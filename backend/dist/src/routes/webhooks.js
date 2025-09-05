"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const PaymentIntent_1 = require("@/models/PaymentIntent");
const Merchant_1 = require("@/models/Merchant");
const WebhookService_1 = require("@/services/WebhookService");
const logger_1 = require("@/utils/logger");
const router = (0, express_1.Router)();
router.post('/test', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantFromToken = req.merchant;
        const merchant = await Merchant_1.Merchant.findById(merchantFromToken.id);
        if (!merchant) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Merchant not found',
                },
            });
        }
        if (!merchant.webhook_url) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'No webhook URL configured for this merchant',
                },
            });
        }
        const testPayload = {
            id: 'evt_test_webhook',
            object: 'event',
            type: 'test.webhook',
            created: Math.floor(Date.now() / 1000),
            data: {
                object: {
                    message: 'This is a test webhook from StacksGate',
                    merchant_id: merchant.id,
                    timestamp: new Date().toISOString(),
                },
            },
        };
        const success = await WebhookService_1.WebhookService.sendWebhook(merchant.id, merchant.webhook_url, merchant.webhook_secret, testPayload);
        if (success) {
            res.json({
                message: 'Test webhook sent successfully',
                webhook_url: merchant.webhook_url,
            });
        }
        else {
            res.status(400).json({
                error: {
                    type: 'api_error',
                    message: 'Failed to send test webhook',
                },
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to send test webhook:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to send test webhook',
            },
        });
    }
});
router.post('/retry/:payment_intent_id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const { payment_intent_id } = req.params;
        const paymentIntent = await PaymentIntent_1.PaymentIntent.findById(payment_intent_id);
        if (!paymentIntent || paymentIntent.merchant_id !== merchant.id) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent not found',
                },
            });
        }
        if (!merchant.webhook_url) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'No webhook URL configured for this merchant',
                },
            });
        }
        const webhookPayload = WebhookService_1.WebhookService.createPaymentIntentWebhook(paymentIntent);
        const success = await WebhookService_1.WebhookService.sendWebhook(merchant.id, merchant.webhook_url, merchant.webhook_secret, webhookPayload, payment_intent_id);
        if (success) {
            res.json({
                message: 'Webhook retry sent successfully',
                payment_intent_id,
                webhook_url: merchant.webhook_url,
            });
        }
        else {
            res.status(400).json({
                error: {
                    type: 'api_error',
                    message: 'Failed to retry webhook',
                },
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to retry webhook:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retry webhook',
            },
        });
    }
});
router.get('/logs', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const logs = await WebhookService_1.WebhookService.getWebhookLogs(merchant.id, limit, offset);
        const response = {
            object: 'list',
            data: logs.map(log => ({
                id: log.id,
                payment_intent_id: log.payment_intent_id,
                event_type: log.event_type,
                webhook_url: log.webhook_url,
                response_status: log.response_status,
                delivered: log.delivered,
                attempt_number: log.attempt_number,
                created_at: Math.floor(log.created_at.getTime() / 1000),
            })),
            has_more: logs.length === limit,
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to get webhook logs:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve webhook logs',
            },
        });
    }
});
router.get('/stats', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const stats = await WebhookService_1.WebhookService.getWebhookStats(merchant.id);
        res.json(stats);
    }
    catch (error) {
        logger_1.logger.error('Failed to get webhook stats:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve webhook statistics',
            },
        });
    }
});
router.post('/trigger', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const merchant = req.merchant;
        const { event_type, data } = req.body;
        if (!merchant.webhook_url) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'No webhook URL configured for this merchant',
                },
            });
        }
        if (!event_type) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'event_type is required',
                },
            });
        }
        const webhookPayload = {
            id: `evt_manual_${Date.now()}`,
            object: 'event',
            type: event_type,
            created: Math.floor(Date.now() / 1000),
            data: {
                object: data || {},
            },
        };
        const success = await WebhookService_1.WebhookService.sendWebhook(merchant.id, merchant.webhook_url, merchant.webhook_secret, webhookPayload);
        if (success) {
            res.json({
                message: 'Manual webhook sent successfully',
                event_type,
                webhook_url: merchant.webhook_url,
            });
        }
        else {
            res.status(400).json({
                error: {
                    type: 'api_error',
                    message: 'Failed to send manual webhook',
                },
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to send manual webhook:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to send manual webhook',
            },
        });
    }
});
router.post('/validate', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const { webhook_url } = req.body;
        if (!webhook_url) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'webhook_url is required',
                },
            });
        }
        const isValid = await WebhookService_1.WebhookService.validateWebhookUrl(webhook_url);
        res.json({
            webhook_url,
            valid: isValid,
            message: isValid ? 'Webhook URL is valid and reachable' : 'Webhook URL is not reachable',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to validate webhook URL:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to validate webhook URL',
            },
        });
    }
});
exports.default = router;
