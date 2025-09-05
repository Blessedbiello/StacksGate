"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.parseRawBody = parseRawBody;
exports.verifyWebhookPayload = verifyWebhookPayload;
exports.createExampleWebhookHandler = createExampleWebhookHandler;
const WebhookService_1 = require("@/services/WebhookService");
const logger_1 = require("@/utils/logger");
function verifyWebhookSignature(webhookSecret, options = {}) {
    const { tolerance = 300, requireSignature = true } = options;
    return (req, res, next) => {
        try {
            const signature = req.headers['x-stacksgate-signature'];
            const timestamp = req.headers['x-stacksgate-timestamp'];
            const eventType = req.headers['x-stacksgate-event'];
            if (requireSignature && !signature) {
                logger_1.logger.warn('Webhook signature verification failed: Missing signature', {
                    url: req.url,
                    eventType,
                    timestamp,
                });
                return res.status(400).json({
                    error: {
                        type: 'webhook_signature_verification_failed',
                        message: 'Missing webhook signature',
                    },
                });
            }
            if (!requireSignature && !signature) {
                logger_1.logger.debug('Webhook signature verification skipped: Not required');
                return next();
            }
            let body;
            if (typeof req.body === 'string') {
                body = req.body;
            }
            else if (Buffer.isBuffer(req.body)) {
                body = req.body.toString('utf8');
            }
            else if (typeof req.body === 'object') {
                body = JSON.stringify(req.body);
            }
            else {
                logger_1.logger.error('Webhook signature verification failed: Invalid body type', {
                    bodyType: typeof req.body,
                });
                return res.status(400).json({
                    error: {
                        type: 'webhook_signature_verification_failed',
                        message: 'Invalid request body format',
                    },
                });
            }
            const isValid = WebhookService_1.WebhookService.verifySignature(body, signature, webhookSecret, tolerance);
            if (!isValid) {
                logger_1.logger.warn('Webhook signature verification failed: Invalid signature', {
                    url: req.url,
                    eventType,
                    timestamp,
                    signatureProvided: !!signature,
                });
                return res.status(401).json({
                    error: {
                        type: 'webhook_signature_verification_failed',
                        message: 'Invalid webhook signature',
                    },
                });
            }
            req.webhook = {
                verified: true,
                eventType,
                timestamp: parseInt(timestamp),
                signature,
            };
            logger_1.logger.debug('Webhook signature verified successfully', {
                url: req.url,
                eventType,
                timestamp,
            });
            next();
        }
        catch (error) {
            logger_1.logger.error('Webhook signature verification error:', error);
            res.status(500).json({
                error: {
                    type: 'webhook_signature_verification_failed',
                    message: 'Failed to verify webhook signature',
                },
            });
        }
    };
}
function parseRawBody(req, res, next) {
    if (req.headers['content-type'] === 'application/json') {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            try {
                req.rawBody = data;
                req.body = JSON.parse(data);
                next();
            }
            catch (error) {
                logger_1.logger.error('Failed to parse webhook JSON body:', error);
                res.status(400).json({
                    error: {
                        type: 'invalid_request_error',
                        message: 'Invalid JSON in request body',
                    },
                });
            }
        });
        req.on('error', (error) => {
            logger_1.logger.error('Error reading webhook request body:', error);
            res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Error reading request body',
                },
            });
        });
    }
    else {
        next();
    }
}
function verifyWebhookPayload(body, signature, webhookSecret, options = {}) {
    try {
        const { tolerance = 300 } = options;
        if (!signature) {
            return { valid: false, error: 'Missing signature' };
        }
        if (!webhookSecret) {
            return { valid: false, error: 'Missing webhook secret' };
        }
        const isValid = WebhookService_1.WebhookService.verifySignature(body, signature, webhookSecret, tolerance);
        return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
    }
    catch (error) {
        return { valid: false, error: error.message };
    }
}
function createExampleWebhookHandler() {
    return [
        parseRawBody,
        verifyWebhookSignature(process.env.STACKSGATE_WEBHOOK_SECRET),
        (req, res) => {
            try {
                const { type, data } = req.body;
                const webhook = req.webhook;
                logger_1.logger.info('Received verified webhook', {
                    eventType: type,
                    webhookId: req.body.id,
                    timestamp: webhook.timestamp,
                });
                switch (type) {
                    case 'payment_intent.succeeded':
                        logger_1.logger.info('Payment succeeded', {
                            paymentIntentId: data.object.id,
                            amount: data.object.amount_sats,
                        });
                        break;
                    case 'payment_intent.failed':
                        logger_1.logger.warn('Payment failed', {
                            paymentIntentId: data.object.id,
                            amount: data.object.amount_sats,
                        });
                        break;
                    case 'payment_intent.processing':
                        logger_1.logger.info('Payment processing', {
                            paymentIntentId: data.object.id,
                            amount: data.object.amount_sats,
                        });
                        break;
                    case 'test.webhook':
                        logger_1.logger.info('Test webhook received successfully');
                        break;
                    default:
                        logger_1.logger.warn('Unknown webhook event type', { type });
                }
                res.status(200).json({ received: true });
            }
            catch (error) {
                logger_1.logger.error('Error processing webhook:', error);
                res.status(500).json({
                    error: {
                        type: 'webhook_processing_error',
                        message: 'Failed to process webhook',
                    },
                });
            }
        },
    ];
}
