"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentIntent = void 0;
const database_1 = require("@/utils/database");
const uuid_1 = require("uuid");
const logger_1 = require("@/utils/logger");
class PaymentIntent {
    static async create(params) {
        const id = `pi_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 24)}`;
        const expires_at = params.expires_in_hours
            ? new Date(Date.now() + params.expires_in_hours * 60 * 60 * 1000)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);
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
            const result = await (0, database_1.query)(sql, values);
            const paymentIntent = result.rows[0];
            await PaymentIntent.logEvent(id, 'payment_intent.created', {
                amount_sats: params.amount_sats,
                amount_usd: params.amount_usd,
                merchant_id: params.merchant_id,
            });
            logger_1.logger.info('Payment intent created', {
                id,
                merchant_id: params.merchant_id,
                amount_sats: params.amount_sats,
            });
            return {
                ...paymentIntent,
                metadata: paymentIntent.metadata || {},
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create payment intent:', error);
            throw error;
        }
    }
    static async findById(id) {
        const sql = 'SELECT * FROM payment_intents WHERE id = $1';
        try {
            const result = await (0, database_1.query)(sql, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            const paymentIntent = result.rows[0];
            return {
                ...paymentIntent,
                metadata: paymentIntent.metadata || {},
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to find payment intent:', { id, error });
            throw error;
        }
    }
    static async findByMerchant(merchantId, limit = 50, offset = 0) {
        const sql = `
      SELECT * FROM payment_intents 
      WHERE merchant_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
        try {
            const result = await (0, database_1.query)(sql, [merchantId, limit, offset]);
            return result.rows.map((row) => ({
                ...row,
                metadata: row.metadata || {},
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to find payment intents by merchant:', { merchantId, error });
            throw error;
        }
    }
    static async updateStatus(id, status, additionalData) {
        return (0, database_1.transaction)(async (client) => {
            const currentResult = await client.query('SELECT * FROM payment_intents WHERE id = $1', [id]);
            if (currentResult.rows.length === 0) {
                throw new Error('Payment intent not found');
            }
            const currentPaymentIntent = currentResult.rows[0];
            const previousStatus = currentPaymentIntent.status;
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
            await PaymentIntent.logEvent(id, `payment_intent.${status}`, {
                previous_status: previousStatus,
                new_status: status,
                ...additionalData,
            }, client);
            logger_1.logger.info('Payment intent status updated', {
                id,
                status,
                previousStatus,
            });
            const finalPaymentIntent = {
                ...paymentIntent,
                metadata: paymentIntent.metadata || {},
            };
            if (previousStatus !== status) {
                setImmediate(async () => {
                    try {
                        const { WebhookService } = await Promise.resolve().then(() => __importStar(require('@/services/WebhookService')));
                        const { Merchant } = await Promise.resolve().then(() => __importStar(require('@/models/Merchant')));
                        const merchant = await Merchant.findById(paymentIntent.merchant_id);
                        if (merchant && merchant.webhook_url) {
                            await WebhookService.sendPaymentIntentWebhook(finalPaymentIntent, merchant.webhook_url, merchant.webhook_secret);
                        }
                    }
                    catch (error) {
                        logger_1.logger.error('Failed to send webhook for payment intent status change:', {
                            id,
                            status,
                            error: error.message,
                        });
                    }
                });
            }
            return finalPaymentIntent;
        });
    }
    static async logEvent(paymentIntentId, eventType, data, client) {
        const sql = `
      INSERT INTO payment_events (payment_intent_id, event_type, data)
      VALUES ($1, $2, $3)
    `;
        const values = [paymentIntentId, eventType, JSON.stringify(data)];
        try {
            if (client) {
                await client.query(sql, values);
            }
            else {
                await (0, database_1.query)(sql, values);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to log payment event:', { paymentIntentId, eventType, error });
        }
    }
    static async getEvents(paymentIntentId) {
        const sql = `
      SELECT event_type, data, created_at
      FROM payment_events 
      WHERE payment_intent_id = $1 
      ORDER BY created_at ASC
    `;
        try {
            const result = await (0, database_1.query)(sql, [paymentIntentId]);
            return result.rows.map((row) => ({
                ...row,
                data: row.data || {},
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get payment events:', { paymentIntentId, error });
            return [];
        }
    }
    static async findExpired() {
        const sql = `
      SELECT * FROM payment_intents 
      WHERE expires_at < NOW() 
        AND status IN ('requires_payment', 'processing')
    `;
        try {
            const result = await (0, database_1.query)(sql);
            return result.rows.map((row) => ({
                ...row,
                metadata: row.metadata || {},
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to find expired payment intents:', error);
            throw error;
        }
    }
    static async cancel(id, reason) {
        return PaymentIntent.updateStatus(id, 'canceled', {
            metadata: { cancel_reason: reason },
        });
    }
}
exports.PaymentIntent = PaymentIntent;
