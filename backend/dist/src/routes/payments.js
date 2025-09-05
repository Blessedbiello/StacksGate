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
const express_1 = require("express");
const zod_1 = require("zod");
const PaymentIntent_1 = require("@/models/PaymentIntent");
const auth_1 = require("@/middleware/auth");
const logger_1 = require("@/utils/logger");
const router = (0, express_1.Router)();
const createPaymentIntentSchema = zod_1.z.object({
    amount: zod_1.z.number().positive('Amount must be positive').max(100000000, 'Amount too large'),
    currency: zod_1.z.literal('btc').default('btc'),
    description: zod_1.z.string().max(500).optional(),
    metadata: zod_1.z.record(zod_1.z.string()).optional(),
    expires_in_hours: zod_1.z.number().min(1).max(168).optional(),
});
const updatePaymentIntentSchema = zod_1.z.object({
    description: zod_1.z.string().max(500).optional(),
    metadata: zod_1.z.record(zod_1.z.string()).optional(),
});
router.post('/', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const validatedData = createPaymentIntentSchema.parse(req.body);
        const merchant = req.merchant;
        const amountSats = Math.floor(validatedData.amount * 100000000);
        const btcToUsd = await getCurrentBTCPrice();
        const amountUsd = validatedData.amount * btcToUsd;
        const createParams = {
            merchant_id: merchant.id,
            amount_sats: amountSats,
            amount_usd: amountUsd,
            description: validatedData.description,
            metadata: validatedData.metadata,
            expires_in_hours: validatedData.expires_in_hours,
        };
        const paymentIntent = await PaymentIntent_1.PaymentIntent.create(createParams);
        const response = {
            id: paymentIntent.id,
            object: 'payment_intent',
            amount: validatedData.amount,
            amount_sats: amountSats,
            amount_usd: Math.round(amountUsd * 100) / 100,
            currency: 'btc',
            status: paymentIntent.status,
            description: paymentIntent.description,
            metadata: paymentIntent.metadata,
            created: Math.floor(paymentIntent.created_at.getTime() / 1000),
            expires_at: Math.floor(paymentIntent.expires_at.getTime() / 1000),
            client_secret: `${paymentIntent.id}_secret_${generateClientSecret()}`,
        };
        logger_1.logger.info('Payment intent created via API', {
            id: paymentIntent.id,
            merchant_id: merchant.id,
            amount_sats: amountSats,
        });
        res.status(201).json(response);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Invalid request parameters',
                    details: error.errors,
                },
            });
        }
        logger_1.logger.error('Failed to create payment intent:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to create payment intent',
            },
        });
    }
});
router.get('/:id', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const merchant = req.merchant;
        const paymentIntent = await PaymentIntent_1.PaymentIntent.findById(id);
        if (!paymentIntent || paymentIntent.merchant_id !== merchant.id) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent not found',
                },
            });
        }
        const response = {
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
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to retrieve payment intent:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve payment intent',
            },
        });
    }
});
router.post('/:id', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const merchant = req.merchant;
        const validatedData = updatePaymentIntentSchema.parse(req.body);
        const existingPaymentIntent = await PaymentIntent_1.PaymentIntent.findById(id);
        if (!existingPaymentIntent || existingPaymentIntent.merchant_id !== merchant.id) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent not found',
                },
            });
        }
        if (existingPaymentIntent.status !== 'requires_payment') {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent cannot be updated in current status',
                },
            });
        }
        const updatedPaymentIntent = await PaymentIntent_1.PaymentIntent.updateStatus(id, existingPaymentIntent.status, {
            description: validatedData.description,
            metadata: validatedData.metadata,
        });
        const response = {
            id: updatedPaymentIntent.id,
            object: 'payment_intent',
            amount: updatedPaymentIntent.amount_sats / 100000000,
            amount_sats: updatedPaymentIntent.amount_sats,
            amount_usd: updatedPaymentIntent.amount_usd,
            currency: updatedPaymentIntent.currency,
            status: updatedPaymentIntent.status,
            description: updatedPaymentIntent.description,
            metadata: updatedPaymentIntent.metadata,
            created: Math.floor(updatedPaymentIntent.created_at.getTime() / 1000),
            expires_at: Math.floor(updatedPaymentIntent.expires_at.getTime() / 1000),
        };
        res.json(response);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Invalid request parameters',
                    details: error.errors,
                },
            });
        }
        logger_1.logger.error('Failed to update payment intent:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to update payment intent',
            },
        });
    }
});
router.post('/:id/cancel', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const merchant = req.merchant;
        const { cancellation_reason } = req.body;
        const existingPaymentIntent = await PaymentIntent_1.PaymentIntent.findById(id);
        if (!existingPaymentIntent || existingPaymentIntent.merchant_id !== merchant.id) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent not found',
                },
            });
        }
        if (!['requires_payment', 'processing'].includes(existingPaymentIntent.status)) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Payment intent cannot be canceled in current status',
                },
            });
        }
        const canceledPaymentIntent = await PaymentIntent_1.PaymentIntent.cancel(id, cancellation_reason);
        const response = {
            id: canceledPaymentIntent.id,
            object: 'payment_intent',
            amount: canceledPaymentIntent.amount_sats / 100000000,
            amount_sats: canceledPaymentIntent.amount_sats,
            amount_usd: canceledPaymentIntent.amount_usd,
            currency: canceledPaymentIntent.currency,
            status: canceledPaymentIntent.status,
            description: canceledPaymentIntent.description,
            metadata: canceledPaymentIntent.metadata,
            created: Math.floor(canceledPaymentIntent.created_at.getTime() / 1000),
            expires_at: Math.floor(canceledPaymentIntent.expires_at.getTime() / 1000),
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to cancel payment intent:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to cancel payment intent',
            },
        });
    }
});
router.get('/', auth_1.authenticateApiKey, async (req, res) => {
    try {
        const merchant = req.merchant;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const offset = parseInt(req.query.starting_after) || 0;
        const paymentIntents = await PaymentIntent_1.PaymentIntent.findByMerchant(merchant.id, limit, offset);
        const response = {
            object: 'list',
            data: paymentIntents.map(pi => ({
                id: pi.id,
                object: 'payment_intent',
                amount: pi.amount_sats / 100000000,
                amount_sats: pi.amount_sats,
                amount_usd: pi.amount_usd,
                currency: pi.currency,
                status: pi.status,
                description: pi.description,
                metadata: pi.metadata,
                created: Math.floor(pi.created_at.getTime() / 1000),
                expires_at: Math.floor(pi.expires_at.getTime() / 1000),
            })),
            has_more: paymentIntents.length === limit,
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to list payment intents:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to list payment intents',
            },
        });
    }
});
async function getCurrentBTCPrice() {
    const { StacksService } = await Promise.resolve().then(() => __importStar(require('@/services/StacksService')));
    const stacksService = new StacksService();
    return stacksService.getBitcoinPriceUSD();
}
function generateClientSecret() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}
exports.default = router;
