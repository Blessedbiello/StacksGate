"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const database_1 = require("@/utils/database");
const logger_1 = require("@/utils/logger");
const crypto_1 = __importDefault(require("crypto"));
class WebhookService {
    static MAX_RETRY_ATTEMPTS = 3;
    static RETRY_DELAYS = [1000, 5000, 15000];
    static async sendWebhook(merchantId, webhookUrl, webhookSecret, payload, paymentIntentId, attemptNumber = 1) {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const bodyString = JSON.stringify(payload);
            let signature;
            if (webhookSecret) {
                signature = this.generateSignature(bodyString, webhookSecret, timestamp);
            }
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'StacksGate-Webhooks/1.0',
                'X-StacksGate-Event': payload.type,
                'X-StacksGate-Timestamp': timestamp.toString(),
            };
            if (signature) {
                headers['X-StacksGate-Signature'] = signature;
            }
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers,
                body: bodyString,
                timeout: 10000,
            });
            const responseBody = await response.text();
            const isSuccess = response.status >= 200 && response.status < 300;
            await this.logWebhookAttempt({
                merchant_id: merchantId,
                payment_intent_id: paymentIntentId,
                event_type: payload.type,
                webhook_url: webhookUrl,
                request_payload: payload,
                response_status: response.status,
                response_body: responseBody,
                delivered: isSuccess,
                attempt_number: attemptNumber,
            });
            if (isSuccess) {
                logger_1.logger.info('Webhook delivered successfully', {
                    merchantId,
                    webhookUrl,
                    eventType: payload.type,
                    paymentIntentId,
                    attemptNumber,
                    responseStatus: response.status,
                });
                return true;
            }
            if (attemptNumber < this.MAX_RETRY_ATTEMPTS) {
                const delay = this.RETRY_DELAYS[attemptNumber - 1];
                logger_1.logger.warn('Webhook delivery failed, scheduling retry', {
                    merchantId,
                    webhookUrl,
                    eventType: payload.type,
                    paymentIntentId,
                    attemptNumber,
                    responseStatus: response.status,
                    retryDelay: delay,
                });
                setTimeout(() => {
                    this.sendWebhook(merchantId, webhookUrl, webhookSecret, payload, paymentIntentId, attemptNumber + 1);
                }, delay);
            }
            else {
                logger_1.logger.error('Webhook delivery failed after all retries', {
                    merchantId,
                    webhookUrl,
                    eventType: payload.type,
                    paymentIntentId,
                    totalAttempts: attemptNumber,
                    responseStatus: response.status,
                });
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error('Webhook delivery error', {
                merchantId,
                webhookUrl,
                eventType: payload.type,
                paymentIntentId,
                attemptNumber,
                error: error.message,
            });
            await this.logWebhookAttempt({
                merchant_id: merchantId,
                payment_intent_id: paymentIntentId,
                event_type: payload.type,
                webhook_url: webhookUrl,
                request_payload: payload,
                response_status: 0,
                response_body: error.message,
                delivered: false,
                attempt_number: attemptNumber,
            });
            if (attemptNumber < this.MAX_RETRY_ATTEMPTS) {
                const delay = this.RETRY_DELAYS[attemptNumber - 1];
                setTimeout(() => {
                    this.sendWebhook(merchantId, webhookUrl, webhookSecret, payload, paymentIntentId, attemptNumber + 1);
                }, delay);
            }
            return false;
        }
    }
    static generateSignature(body, secret, timestamp) {
        const payload = `${timestamp}.${body}`;
        return `t=${timestamp},v1=${crypto_1.default
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')}`;
    }
    static verifySignature(body, signature, secret, tolerance = 300) {
        try {
            const elements = signature.split(',');
            let timestamp;
            let hash;
            for (const element of elements) {
                const [key, value] = element.split('=');
                if (key === 't') {
                    timestamp = parseInt(value);
                }
                else if (key === 'v1') {
                    hash = value;
                }
            }
            if (!timestamp || !hash) {
                return false;
            }
            const now = Math.floor(Date.now() / 1000);
            if (Math.abs(now - timestamp) > tolerance) {
                return false;
            }
            const payload = `${timestamp}.${body}`;
            const expectedHash = crypto_1.default
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');
            return crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
        }
        catch (error) {
            logger_1.logger.error('Signature verification error:', error);
            return false;
        }
    }
    static createPaymentIntentWebhook(paymentIntent) {
        return {
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            object: 'event',
            type: `payment_intent.${paymentIntent.status}`,
            created: Math.floor(Date.now() / 1000),
            data: {
                object: {
                    id: paymentIntent.id,
                    object: 'payment_intent',
                    amount: paymentIntent.amount_sats / 100000000,
                    amount_sats: paymentIntent.amount_sats,
                    amount_usd: paymentIntent.amount_usd,
                    currency: paymentIntent.currency,
                    status: paymentIntent.status,
                    description: paymentIntent.description,
                    metadata: paymentIntent.metadata,
                    stacks_address: paymentIntent.stacks_address,
                    bitcoin_address: paymentIntent.bitcoin_address,
                    sbtc_tx_id: paymentIntent.sbtc_tx_id,
                    confirmation_count: paymentIntent.confirmation_count,
                    created: Math.floor(paymentIntent.created_at.getTime() / 1000),
                    expires_at: Math.floor(paymentIntent.expires_at.getTime() / 1000),
                },
            },
        };
    }
    static async logWebhookAttempt(logData) {
        try {
            const sql = `
        INSERT INTO webhook_logs (
          merchant_id, payment_intent_id, event_type, webhook_url,
          request_payload, response_status, response_body, delivered, attempt_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
            const values = [
                logData.merchant_id,
                logData.payment_intent_id,
                logData.event_type,
                logData.webhook_url,
                JSON.stringify(logData.request_payload),
                logData.response_status,
                logData.response_body,
                logData.delivered,
                logData.attempt_number,
            ];
            await (0, database_1.query)(sql, values);
        }
        catch (error) {
            logger_1.logger.error('Failed to log webhook attempt:', error);
        }
    }
    static async getWebhookLogs(merchantId, limit = 50, offset = 0) {
        const sql = `
      SELECT id, merchant_id, payment_intent_id, event_type, webhook_url,
             request_payload, response_status, response_body, delivered,
             attempt_number, created_at
      FROM webhook_logs
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
        try {
            const result = await (0, database_1.query)(sql, [merchantId, limit, offset]);
            return result.rows.map((row) => ({
                ...row,
                request_payload: row.request_payload || {},
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get webhook logs:', error);
            throw error;
        }
    }
    static async getWebhookStats(merchantId) {
        const sql = `
      SELECT 
        COUNT(*) as total_webhooks,
        COUNT(*) FILTER (WHERE delivered = true) as successful_webhooks,
        COUNT(*) FILTER (WHERE delivered = false) as failed_webhooks,
        AVG(attempt_number) as avg_attempts,
        COUNT(DISTINCT event_type) as unique_event_types
      FROM webhook_logs
      WHERE merchant_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
    `;
        try {
            const result = await (0, database_1.query)(sql, [merchantId]);
            const stats = result.rows[0];
            return {
                total_webhooks: parseInt(stats.total_webhooks),
                successful_webhooks: parseInt(stats.successful_webhooks),
                failed_webhooks: parseInt(stats.failed_webhooks),
                success_rate: stats.total_webhooks > 0
                    ? Math.round((stats.successful_webhooks / stats.total_webhooks) * 100)
                    : 0,
                avg_attempts: Math.round(parseFloat(stats.avg_attempts) * 100) / 100,
                unique_event_types: parseInt(stats.unique_event_types),
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get webhook stats:', error);
            throw error;
        }
    }
    static async validateWebhookUrl(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                timeout: 5000,
            });
            return response.status < 500;
        }
        catch (error) {
            logger_1.logger.debug('Webhook URL validation failed:', { url, error: error.message });
            return false;
        }
    }
    static async sendPaymentIntentWebhook(paymentIntent, merchantWebhookUrl, merchantWebhookSecret) {
        const payload = this.createPaymentIntentWebhook(paymentIntent);
        await this.sendWebhook(paymentIntent.merchant_id, merchantWebhookUrl, merchantWebhookSecret, payload, paymentIntent.id);
    }
    static async retryFailedWebhooks() {
        logger_1.logger.info('Starting failed webhook retry process');
        const sql = `
      SELECT DISTINCT w.merchant_id, w.payment_intent_id, w.event_type,
             m.webhook_url, m.webhook_secret
      FROM webhook_logs w
      JOIN merchants m ON w.merchant_id = m.id
      WHERE w.delivered = false
        AND w.attempt_number < $1
        AND w.created_at >= NOW() - INTERVAL '24 hours'
        AND m.webhook_url IS NOT NULL
      ORDER BY w.created_at DESC
      LIMIT 100
    `;
        try {
            const result = await (0, database_1.query)(sql, [this.MAX_RETRY_ATTEMPTS]);
            for (const row of result.rows) {
                const payload = {
                    id: `evt_retry_${Date.now()}`,
                    object: 'event',
                    type: row.event_type,
                    created: Math.floor(Date.now() / 1000),
                    data: {
                        object: {
                            id: row.payment_intent_id,
                            message: 'Webhook retry attempt',
                        },
                    },
                };
                await this.sendWebhook(row.merchant_id, row.webhook_url, row.webhook_secret, payload, row.payment_intent_id);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            logger_1.logger.info(`Processed ${result.rows.length} failed webhooks for retry`);
        }
        catch (error) {
            logger_1.logger.error('Failed webhook retry process error:', error);
        }
    }
}
exports.WebhookService = WebhookService;
