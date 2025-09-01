import { StacksService, TransactionStatus } from './StacksService';
import { PaymentIntent, PaymentIntentData } from '@/models/PaymentIntent';
import { WebhookService } from './WebhookService';
import { Merchant } from '@/models/Merchant';
import { query } from '@/utils/database';
import { logger } from '@/utils/logger';
import { cacheGet, cacheSet } from '@/utils/redis';

export interface SBTCDepositRequest {
  paymentIntentId: string;
  recipientAddress: string;
  amountSats: number;
  bitcoinTxId?: string;
}

export interface SBTCTransactionData {
  id: string;
  paymentIntentId: string;
  bitcoinTxid?: string;
  stacksTxid?: string;
  depositAddress: string;
  amountSats: number;
  status: 'pending' | 'confirmed' | 'failed';
  confirmationCount: number;
  blockHeight?: number;
  createdAt: Date;
  confirmedAt?: Date;
}

export class SBTCService {
  private stacksService: StacksService;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.stacksService = new StacksService();
  }

  // Initialize the service and start monitoring
  async initialize(): Promise<void> {
    logger.info('Initializing sBTC Service');
    
    // Start transaction monitoring
    this.startTransactionMonitoring();
    
    // Start periodic price updates
    this.startPriceUpdates();
    
    logger.info('sBTC Service initialized successfully');
  }

  // Process a new sBTC deposit request
  async processDepositRequest(request: SBTCDepositRequest): Promise<SBTCTransactionData> {
    try {
      // Validate the payment intent
      const paymentIntent = await PaymentIntent.findById(request.paymentIntentId);
      if (!paymentIntent) {
        throw new Error('Payment intent not found');
      }

      if (paymentIntent.status !== 'requires_payment') {
        throw new Error('Payment intent is not in requires_payment status');
      }

      // Generate deposit address for this transaction
      const depositInfo = this.stacksService.generateDepositAddress();

      // Initiate sBTC deposit using official contract
      let stacksTxId: string | undefined;
      try {
        stacksTxId = await this.stacksService.initiateSBTCDeposit(
          request.amountSats,
          request.recipientAddress,
          depositInfo.privateKey
        );
        
        logger.info('sBTC deposit transaction initiated', {
          stacksTxId,
          paymentIntentId: request.paymentIntentId,
          amountSats: request.amountSats,
        });
      } catch (error) {
        logger.warn('Direct sBTC deposit failed, falling back to monitoring mode:', error);
      }

      // Create sBTC transaction record
      const sbtcTransaction = await this.createSBTCTransaction({
        paymentIntentId: request.paymentIntentId,
        bitcoinTxid: request.bitcoinTxId,
        stacksTxid: stacksTxId,
        depositAddress: depositInfo.address,
        amountSats: request.amountSats,
        status: 'pending',
        confirmationCount: 0,
      });

      // Update payment intent with sBTC details
      await PaymentIntent.updateStatus(request.paymentIntentId, 'processing', {
        stacks_address: request.recipientAddress,
        bitcoin_address: depositInfo.address,
        sbtc_tx_id: stacksTxId || request.bitcoinTxId,
      });

      // Send webhook notification
      await this.sendPaymentIntentWebhook(paymentIntent.merchant_id, request.paymentIntentId);

      logger.info('sBTC deposit request processed', {
        paymentIntentId: request.paymentIntentId,
        depositAddress: depositInfo.address,
        stacksTxId,
        amountSats: request.amountSats,
      });

      return sbtcTransaction;
    } catch (error) {
      logger.error('Failed to process sBTC deposit request:', error);
      throw error;
    }
  }

  // Monitor specific transaction
  async monitorTransaction(bitcoinTxid: string, expectedAmount: number): Promise<TransactionStatus> {
    return this.stacksService.monitorSBTCDeposit(bitcoinTxid, expectedAmount);
  }

  // Get sBTC balance for an address
  async getBalance(address: string): Promise<number> {
    return this.stacksService.getSBTCBalance(address);
  }

  // Start background transaction monitoring
  private startTransactionMonitoring(): void {
    const monitoringInterval = setInterval(async () => {
      try {
        await this.checkPendingTransactions();
      } catch (error) {
        logger.error('Transaction monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds

    this.monitoringInterval = monitoringInterval;
    
    // Cleanup on process exit
    process.on('SIGINT', () => {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
    });
  }

  // Check and update pending transactions
  private async checkPendingTransactions(): Promise<void> {
    try {
      const pendingTransactions = await this.getPendingSBTCTransactions();
      
      logger.debug(`Checking ${pendingTransactions.length} pending sBTC transactions`);

      for (const transaction of pendingTransactions) {
        // Check Stacks transaction if available (preferred method)
        if (transaction.stacksTxid) {
          const status = await this.stacksService.getTransactionStatus(transaction.stacksTxid);
          
          if (status.status !== 'pending') {
            await this.updateTransactionStatus(transaction.id, status);
            continue;
          }
        }

        // Fallback to Bitcoin monitoring for legacy transactions
        if (transaction.bitcoinTxid) {
          const status = await this.stacksService.monitorSBTCDeposit(
            transaction.bitcoinTxid,
            transaction.amountSats
          );

          if (status.status !== 'pending') {
            await this.updateTransactionStatus(transaction.id, status);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check pending transactions:', error);
    }
  }

  // Update transaction status and trigger webhooks
  private async updateTransactionStatus(transactionId: string, status: TransactionStatus): Promise<void> {
    try {
      // Update sBTC transaction
      await this.updateSBTCTransaction(transactionId, {
        status: status.status,
        confirmationCount: status.confirmations || 0,
        blockHeight: status.blockHeight,
        confirmedAt: status.status === 'confirmed' ? new Date() : undefined,
      });

      // Get payment intent and update status
      const transaction = await this.getSBTCTransaction(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      let paymentStatus: 'processing' | 'succeeded' | 'failed';
      if (status.status === 'confirmed') {
        paymentStatus = 'succeeded';
      } else if (status.status === 'failed') {
        paymentStatus = 'failed';
      } else {
        paymentStatus = 'processing';
      }

      await PaymentIntent.updateStatus(transaction.paymentIntentId, paymentStatus, {
        confirmation_count: status.confirmations || 0,
        sbtc_tx_id: status.txid,
      });

      // Send webhook notification
      await this.sendPaymentIntentWebhook(
        (await PaymentIntent.findById(transaction.paymentIntentId))!.merchant_id,
        transaction.paymentIntentId
      );

      logger.info('Transaction status updated', {
        transactionId,
        paymentIntentId: transaction.paymentIntentId,
        newStatus: status.status,
        confirmations: status.confirmations,
      });
    } catch (error) {
      logger.error('Failed to update transaction status:', error);
    }
  }

  // Send payment intent webhook
  private async sendPaymentIntentWebhook(merchantId: string, paymentIntentId: string): Promise<void> {
    try {
      const paymentIntent = await PaymentIntent.findById(paymentIntentId);
      const merchant = await Merchant.findById(merchantId);

      if (paymentIntent && merchant && merchant.webhook_url) {
        await WebhookService.sendPaymentIntentWebhook(
          paymentIntent,
          merchant.webhook_url,
          merchant.webhook_secret
        );
      }
    } catch (error) {
      logger.error('Failed to send payment intent webhook:', error);
    }
  }

  // Create sBTC transaction record
  private async createSBTCTransaction(data: Omit<SBTCTransactionData, 'id' | 'createdAt'>): Promise<SBTCTransactionData> {
    const sql = `
      INSERT INTO sbtc_transactions (
        payment_intent_id, bitcoin_txid, stacks_txid, deposit_address,
        amount_sats, status, confirmation_count, block_height
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      data.paymentIntentId,
      data.bitcoinTxid,
      data.stacksTxid,
      data.depositAddress,
      data.amountSats,
      data.status,
      data.confirmationCount,
      data.blockHeight,
    ];

    try {
      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create sBTC transaction:', error);
      throw error;
    }
  }

  // Update sBTC transaction
  private async updateSBTCTransaction(id: string, updates: Partial<SBTCTransactionData>): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        updateFields.push(`${key.toLowerCase()} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return;
    }

    const sql = `
      UPDATE sbtc_transactions 
      SET ${updateFields.join(', ')}
      WHERE id = $1
    `;

    try {
      await query(sql, values);
    } catch (error) {
      logger.error('Failed to update sBTC transaction:', error);
      throw error;
    }
  }

  // Get sBTC transaction by ID
  private async getSBTCTransaction(id: string): Promise<SBTCTransactionData | null> {
    const sql = 'SELECT * FROM sbtc_transactions WHERE id = $1';
    
    try {
      const result = await query(sql, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to get sBTC transaction:', error);
      throw error;
    }
  }

  // Get pending sBTC transactions
  private async getPendingSBTCTransactions(): Promise<SBTCTransactionData[]> {
    const sql = `
      SELECT * FROM sbtc_transactions 
      WHERE status = 'pending' 
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
    `;
    
    try {
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get pending sBTC transactions:', error);
      return [];
    }
  }

  // Start periodic Bitcoin price updates
  private startPriceUpdates(): void {
    const updateInterval = parseInt(process.env.PRICE_UPDATE_INTERVAL || '60000'); // Default 1 minute

    setInterval(async () => {
      try {
        const price = await this.stacksService.getBitcoinPriceUSD();
        await cacheSet('current_btc_price', price, 300); // Cache for 5 minutes
        logger.debug('Bitcoin price updated', { price });
      } catch (error) {
        logger.error('Failed to update Bitcoin price:', error);
      }
    }, updateInterval);
  }

  // Get current Bitcoin price
  async getCurrentBitcoinPrice(): Promise<number> {
    const cachedPrice = await cacheGet<number>('current_btc_price');
    if (cachedPrice !== null) {
      return cachedPrice;
    }

    return this.stacksService.getBitcoinPriceUSD();
  }

  // Convert satoshis to USD
  async satsToUSD(sats: number): Promise<number> {
    const btcPrice = await this.getCurrentBitcoinPrice();
    const btcAmount = sats / 100000000; // Convert sats to BTC
    return btcAmount * btcPrice;
  }

  // Convert USD to satoshis
  async usdToSats(usd: number): Promise<number> {
    const btcPrice = await this.getCurrentBitcoinPrice();
    const btcAmount = usd / btcPrice;
    return Math.floor(btcAmount * 100000000); // Convert BTC to sats
  }

  // Get service statistics
  async getStats(): Promise<any> {
    const sql = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_transactions,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_transactions,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions,
        SUM(amount_sats) FILTER (WHERE status = 'confirmed') as total_volume_sats,
        AVG(confirmation_count) FILTER (WHERE status = 'confirmed') as avg_confirmations
      FROM sbtc_transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    try {
      const result = await query(sql);
      const stats = result.rows[0];

      return {
        total_transactions: parseInt(stats.total_transactions),
        confirmed_transactions: parseInt(stats.confirmed_transactions),
        pending_transactions: parseInt(stats.pending_transactions),
        failed_transactions: parseInt(stats.failed_transactions),
        total_volume_sats: parseInt(stats.total_volume_sats || '0'),
        avg_confirmations: Math.round(parseFloat(stats.avg_confirmations || '0') * 100) / 100,
        success_rate: stats.total_transactions > 0 
          ? Math.round((stats.confirmed_transactions / stats.total_transactions) * 100) 
          : 0,
      };
    } catch (error) {
      logger.error('Failed to get sBTC service stats:', error);
      throw error;
    }
  }

  // Cleanup and shutdown
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.stacksService.disconnect();
    logger.info('sBTC Service shutdown completed');
  }
}