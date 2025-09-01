import { query, transaction, PoolClient } from '@/utils/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

export interface PaymentIntentData {
  id?: string;
  merchant_id: string;
  amount_sats: number;
  amount_usd?: number;
  currency?: string;
  status?: PaymentIntentStatus;
  description?: string;
  metadata?: Record<string, any>;
  stacks_address?: string;
  bitcoin_address?: string;
  sbtc_tx_id?: string;
  confirmation_count?: number;
  webhook_delivered?: boolean;
  webhook_attempts?: number;
  last_webhook_attempt?: Date;
  expires_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export type PaymentIntentStatus = 
  | 'requires_payment'
  | 'processing' 
  | 'succeeded' 
  | 'failed' 
  | 'canceled';

export interface CreatePaymentIntentParams {
  merchant_id: string;
  amount_sats: number;
  amount_usd?: number;
  description?: string;
  metadata?: Record<string, any>;
  expires_in_hours?: number;
}

export class PaymentIntent {
  static async create(params: CreatePaymentIntentParams): Promise<PaymentIntentData> {
    const id = `pi_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
    const expires_at = params.expires_in_hours 
      ? new Date(Date.now() + params.expires_in_hours * 60 * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24 hours

    const sql = `
      INSERT INTO payment_intents (
        id, merchant_id, amount_sats, amount_usd, description, 
        metadata, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      id,
      params.merchant_id,
      params.amount_sats,
      params.amount_usd,
      params.description,
      JSON.stringify(params.metadata || {}),
      expires_at,
      'requires_payment'
    ];

    try {
      const result = await query(sql, values);
      const paymentIntent = result.rows[0];

      // Log payment intent creation
      await PaymentIntent.logEvent(id, 'payment_intent.created', {
        amount_sats: params.amount_sats,
        amount_usd: params.amount_usd,
        merchant_id: params.merchant_id,
      });

      logger.info('Payment intent created', {
        id,
        merchant_id: params.merchant_id,
        amount_sats: params.amount_sats,
      });

      return {
        ...paymentIntent,
        metadata: paymentIntent.metadata || {},
      };
    } catch (error) {
      logger.error('Failed to create payment intent:', error);
      throw error;
    }
  }

  static async findById(id: string): Promise<PaymentIntentData | null> {
    const sql = 'SELECT * FROM payment_intents WHERE id = $1';
    
    try {
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const paymentIntent = result.rows[0];
      return {
        ...paymentIntent,
        metadata: paymentIntent.metadata || {},
      };
    } catch (error) {
      logger.error('Failed to find payment intent:', { id, error });
      throw error;
    }
  }

  static async findByMerchant(merchantId: string, limit: number = 50, offset: number = 0): Promise<PaymentIntentData[]> {
    const sql = `
      SELECT * FROM payment_intents 
      WHERE merchant_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await query(sql, [merchantId, limit, offset]);
      
      return result.rows.map((row: any) => ({
        ...row,
        metadata: row.metadata || {},
      }));
    } catch (error) {
      logger.error('Failed to find payment intents by merchant:', { merchantId, error });
      throw error;
    }
  }

  static async updateStatus(id: string, status: PaymentIntentStatus, additionalData?: Partial<PaymentIntentData>): Promise<PaymentIntentData> {
    return transaction(async (client: PoolClient) => {
      // Get current payment intent to check for status change
      const currentResult = await client.query('SELECT * FROM payment_intents WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        throw new Error('Payment intent not found');
      }
      const currentPaymentIntent = currentResult.rows[0];
      const previousStatus = currentPaymentIntent.status;

      // Update payment intent
      const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
      const values = [id, status];
      let paramIndex = 3;

      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
            updateFields.push(`${key} = $${paramIndex}`);
            values.push(key === 'metadata' ? JSON.stringify(value) : value);
            paramIndex++;
          }
        });
      }

      const updateSql = `
        UPDATE payment_intents 
        SET ${updateFields.join(', ')} 
        WHERE id = $1 
        RETURNING *
      `;

      const result = await client.query(updateSql, values);
      const paymentIntent = result.rows[0];

      // Log status change event
      await PaymentIntent.logEvent(id, `payment_intent.${status}`, {
        previous_status: previousStatus,
        new_status: status,
        ...additionalData,
      }, client);

      logger.info('Payment intent status updated', {
        id,
        status,
        previousStatus,
      });

      const finalPaymentIntent = {
        ...paymentIntent,
        metadata: paymentIntent.metadata || {},
      };

      // Send webhook if status actually changed
      if (previousStatus !== status) {
        // Import WebhookService dynamically to avoid circular dependencies
        setImmediate(async () => {
          try {
            const { WebhookService } = await import('@/services/WebhookService');
            const { Merchant } = await import('@/models/Merchant');
            
            const merchant = await Merchant.findById(paymentIntent.merchant_id);
            if (merchant && merchant.webhook_url) {
              await WebhookService.sendPaymentIntentWebhook(
                finalPaymentIntent,
                merchant.webhook_url,
                merchant.webhook_secret
              );
            }
          } catch (error) {
            logger.error('Failed to send webhook for payment intent status change:', {
              id,
              status,
              error: (error as Error).message,
            });
          }
        });
      }

      return finalPaymentIntent;
    });
  }

  static async logEvent(
    paymentIntentId: string, 
    eventType: string, 
    data: Record<string, any>,
    client?: PoolClient
  ): Promise<void> {
    const sql = `
      INSERT INTO payment_events (payment_intent_id, event_type, data)
      VALUES ($1, $2, $3)
    `;

    const values = [paymentIntentId, eventType, JSON.stringify(data)];

    try {
      if (client) {
        await client.query(sql, values);
      } else {
        await query(sql, values);
      }
    } catch (error) {
      logger.error('Failed to log payment event:', { paymentIntentId, eventType, error });
      // Don't throw error for logging failures
    }
  }

  static async getEvents(paymentIntentId: string): Promise<any[]> {
    const sql = `
      SELECT event_type, data, created_at
      FROM payment_events 
      WHERE payment_intent_id = $1 
      ORDER BY created_at ASC
    `;

    try {
      const result = await query(sql, [paymentIntentId]);
      return result.rows.map((row: any) => ({
        ...row,
        data: row.data || {},
      }));
    } catch (error) {
      logger.error('Failed to get payment events:', { paymentIntentId, error });
      return [];
    }
  }

  static async findExpired(): Promise<PaymentIntentData[]> {
    const sql = `
      SELECT * FROM payment_intents 
      WHERE expires_at < NOW() 
        AND status IN ('requires_payment', 'processing')
    `;

    try {
      const result = await query(sql);
      return result.rows.map((row: any) => ({
        ...row,
        metadata: row.metadata || {},
      }));
    } catch (error) {
      logger.error('Failed to find expired payment intents:', error);
      throw error;
    }
  }

  static async cancel(id: string, reason?: string): Promise<PaymentIntentData> {
    return PaymentIntent.updateStatus(id, 'canceled', {
      metadata: { cancel_reason: reason },
    });
  }
}