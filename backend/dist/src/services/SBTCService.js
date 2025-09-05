"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SBTCService = void 0;
const StacksService_1 = require("./StacksService");
const PaymentIntent_1 = require("@/models/PaymentIntent");
const WebhookService_1 = require("./WebhookService");
const Merchant_1 = require("@/models/Merchant");
const database_1 = require("@/utils/database");
const logger_1 = require("@/utils/logger");
const redis_1 = require("@/utils/redis");
class SBTCService {
    stacksService;
    monitoringInterval = null;
    constructor() {
        this.stacksService = new StacksService_1.StacksService();
    }
    async initialize() {
        logger_1.logger.info('Initializing sBTC Service');
        this.startTransactionMonitoring();
        this.startPriceUpdates();
        logger_1.logger.info('sBTC Service initialized successfully');
    }
    async processDepositRequest(request) {
        try {
            const paymentIntent = await PaymentIntent_1.PaymentIntent.findById(request.paymentIntentId);
            if (!paymentIntent) {
                throw new Error('Payment intent not found');
            }
            if (paymentIntent.status !== 'requires_payment') {
                throw new Error('Payment intent is not in requires_payment status');
            }
            const depositInfo = this.stacksService.generateDepositAddress();
            let stacksTxId;
            try {
                stacksTxId = await this.stacksService.initiateSBTCDeposit(request.amountSats, request.recipientAddress, depositInfo.privateKey);
                logger_1.logger.info('sBTC deposit transaction initiated', {
                    stacksTxId,
                    paymentIntentId: request.paymentIntentId,
                    amountSats: request.amountSats,
                });
            }
            catch (error) {
                logger_1.logger.warn('Direct sBTC deposit failed, falling back to monitoring mode:', error);
            }
            const sbtcTransaction = await this.createSBTCTransaction({
                paymentIntentId: request.paymentIntentId,
                bitcoinTxid: request.bitcoinTxId,
                stacksTxid: stacksTxId,
                depositAddress: depositInfo.address,
                amountSats: request.amountSats,
                status: 'pending',
                confirmationCount: 0,
            });
            await PaymentIntent_1.PaymentIntent.updateStatus(request.paymentIntentId, 'processing', {
                stacks_address: request.recipientAddress,
                bitcoin_address: depositInfo.address,
                sbtc_tx_id: stacksTxId || request.bitcoinTxId,
            });
            await this.sendPaymentIntentWebhook(paymentIntent.merchant_id, request.paymentIntentId);
            logger_1.logger.info('sBTC deposit request processed', {
                paymentIntentId: request.paymentIntentId,
                depositAddress: depositInfo.address,
                stacksTxId,
                amountSats: request.amountSats,
            });
            return sbtcTransaction;
        }
        catch (error) {
            logger_1.logger.error('Failed to process sBTC deposit request:', error);
            throw error;
        }
    }
    async monitorTransaction(bitcoinTxid, expectedAmount) {
        return this.stacksService.monitorSBTCDeposit(bitcoinTxid, expectedAmount);
    }
    async getBalance(address) {
        return this.stacksService.getSBTCBalance(address);
    }
    startTransactionMonitoring() {
        const monitoringInterval = setInterval(async () => {
            try {
                await this.checkPendingTransactions();
            }
            catch (error) {
                logger_1.logger.error('Transaction monitoring error:', error);
            }
        }, 30000);
        this.monitoringInterval = monitoringInterval;
        process.on('SIGINT', () => {
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
            }
        });
    }
    async checkPendingTransactions() {
        try {
            const pendingTransactions = await this.getPendingSBTCTransactions();
            logger_1.logger.debug(`Checking ${pendingTransactions.length} pending sBTC transactions`);
            for (const transaction of pendingTransactions) {
                if (transaction.stacksTxid) {
                    const status = await this.stacksService.getTransactionStatus(transaction.stacksTxid);
                    if (status.status !== 'pending') {
                        await this.updateTransactionStatus(transaction.id, status);
                        continue;
                    }
                }
                if (transaction.bitcoinTxid) {
                    const status = await this.stacksService.monitorSBTCDeposit(transaction.bitcoinTxid, transaction.amountSats);
                    if (status.status !== 'pending') {
                        await this.updateTransactionStatus(transaction.id, status);
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to check pending transactions:', error);
        }
    }
    async updateTransactionStatus(transactionId, status) {
        try {
            await this.updateSBTCTransaction(transactionId, {
                status: status.status,
                confirmationCount: status.confirmations || 0,
                blockHeight: status.blockHeight,
                confirmedAt: status.status === 'confirmed' ? new Date() : undefined,
            });
            const transaction = await this.getSBTCTransaction(transactionId);
            if (!transaction) {
                throw new Error('Transaction not found');
            }
            let paymentStatus;
            if (status.status === 'confirmed') {
                paymentStatus = 'succeeded';
            }
            else if (status.status === 'failed') {
                paymentStatus = 'failed';
            }
            else {
                paymentStatus = 'processing';
            }
            await PaymentIntent_1.PaymentIntent.updateStatus(transaction.paymentIntentId, paymentStatus, {
                confirmation_count: status.confirmations || 0,
                sbtc_tx_id: status.txid,
            });
            await this.sendPaymentIntentWebhook((await PaymentIntent_1.PaymentIntent.findById(transaction.paymentIntentId)).merchant_id, transaction.paymentIntentId);
            logger_1.logger.info('Transaction status updated', {
                transactionId,
                paymentIntentId: transaction.paymentIntentId,
                newStatus: status.status,
                confirmations: status.confirmations,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to update transaction status:', error);
        }
    }
    async sendPaymentIntentWebhook(merchantId, paymentIntentId) {
        try {
            const paymentIntent = await PaymentIntent_1.PaymentIntent.findById(paymentIntentId);
            const merchant = await Merchant_1.Merchant.findById(merchantId);
            if (paymentIntent && merchant && merchant.webhook_url) {
                await WebhookService_1.WebhookService.sendPaymentIntentWebhook(paymentIntent, merchant.webhook_url, merchant.webhook_secret);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to send payment intent webhook:', error);
        }
    }
    async createSBTCTransaction(data) {
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
            const result = await (0, database_1.query)(sql, values);
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to create sBTC transaction:', error);
            throw error;
        }
    }
    async updateSBTCTransaction(id, updates) {
        const updateFields = [];
        const values = [id];
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
            await (0, database_1.query)(sql, values);
        }
        catch (error) {
            logger_1.logger.error('Failed to update sBTC transaction:', error);
            throw error;
        }
    }
    async getSBTCTransaction(id) {
        const sql = 'SELECT * FROM sbtc_transactions WHERE id = $1';
        try {
            const result = await (0, database_1.query)(sql, [id]);
            return result.rows.length > 0 ? result.rows[0] : null;
        }
        catch (error) {
            logger_1.logger.error('Failed to get sBTC transaction:', error);
            throw error;
        }
    }
    async getPendingSBTCTransactions() {
        const sql = `
      SELECT * FROM sbtc_transactions 
      WHERE status = 'pending' 
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
    `;
        try {
            const result = await (0, database_1.query)(sql);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error('Failed to get pending sBTC transactions:', error);
            return [];
        }
    }
    startPriceUpdates() {
        const updateInterval = parseInt(process.env.PRICE_UPDATE_INTERVAL || '60000');
        setInterval(async () => {
            try {
                const price = await this.stacksService.getBitcoinPriceUSD();
                await (0, redis_1.cacheSet)('current_btc_price', price, 300);
                logger_1.logger.debug('Bitcoin price updated', { price });
            }
            catch (error) {
                logger_1.logger.error('Failed to update Bitcoin price:', error);
            }
        }, updateInterval);
    }
    async getCurrentBitcoinPrice() {
        const cachedPrice = await (0, redis_1.cacheGet)('current_btc_price');
        if (cachedPrice !== null) {
            return cachedPrice;
        }
        return this.stacksService.getBitcoinPriceUSD();
    }
    async satsToUSD(sats) {
        const btcPrice = await this.getCurrentBitcoinPrice();
        const btcAmount = sats / 100000000;
        return btcAmount * btcPrice;
    }
    async usdToSats(usd) {
        const btcPrice = await this.getCurrentBitcoinPrice();
        const btcAmount = usd / btcPrice;
        return Math.floor(btcAmount * 100000000);
    }
    async getStats() {
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
            const result = await (0, database_1.query)(sql);
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
        }
        catch (error) {
            logger_1.logger.error('Failed to get sBTC service stats:', error);
            throw error;
        }
    }
    shutdown() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.stacksService.disconnect();
        logger_1.logger.info('sBTC Service shutdown completed');
    }
}
exports.SBTCService = SBTCService;
