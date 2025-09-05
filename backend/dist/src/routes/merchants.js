"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Merchant_1 = require("@/models/Merchant");
const PaymentIntent_1 = require("@/models/PaymentIntent");
const auth_1 = require("@/middleware/auth");
const logger_1 = require("@/utils/logger");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const createMerchantSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    business_name: zod_1.z.string().min(1, 'Business name is required').max(255),
    website_url: zod_1.z.string().url('Invalid website URL').optional(),
    webhook_url: zod_1.z.string().url('Invalid webhook URL').optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const updateWebhookSchema = zod_1.z.object({
    webhook_url: zod_1.z.string().url('Invalid webhook URL').optional(),
});
const updateProfileSchema = zod_1.z.object({
    business_name: zod_1.z.string().min(1, 'Business name is required').max(255).optional(),
    website_url: zod_1.z.string().url('Invalid website URL').optional().or(zod_1.z.literal('')),
    webhook_url: zod_1.z.string().url('Invalid webhook URL').optional().or(zod_1.z.literal('')),
});
router.post('/register', async (req, res) => {
    try {
        const validatedData = createMerchantSchema.parse(req.body);
        const createParams = {
            email: validatedData.email,
            password: validatedData.password,
            business_name: validatedData.business_name,
            website_url: validatedData.website_url,
            webhook_url: validatedData.webhook_url,
        };
        const merchant = await Merchant_1.Merchant.create(createParams);
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not configured');
        }
        const token = jsonwebtoken_1.default.sign({ merchantId: merchant.id }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
        const response = {
            merchant: {
                id: merchant.id,
                email: merchant.email,
                business_name: merchant.business_name,
                website_url: merchant.website_url,
                api_key_public: merchant.api_key_public,
                webhook_url: merchant.webhook_url,
                is_active: merchant.is_active,
                created_at: Math.floor(merchant.created_at.getTime() / 1000),
            },
            token,
            message: 'Merchant account created successfully',
        };
        logger_1.logger.info('New merchant registered', {
            id: merchant.id,
            email: merchant.email,
            business_name: merchant.business_name,
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
        if (error.message.includes('already exists')) {
            return res.status(400).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'A merchant with this email already exists',
                },
            });
        }
        logger_1.logger.error('Failed to create merchant:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to create merchant account',
            },
        });
    }
});
router.post('/login', async (req, res) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const authResult = await Merchant_1.Merchant.authenticate(validatedData.email, validatedData.password);
        if (!authResult) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Invalid email or password',
                },
            });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not configured');
        }
        const token = jsonwebtoken_1.default.sign({ merchantId: authResult.merchant.id }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
        const response = {
            merchant: {
                id: authResult.merchant.id,
                email: authResult.merchant.email,
                business_name: authResult.merchant.business_name,
                website_url: authResult.merchant.website_url,
                api_key_public: authResult.merchant.api_key_public,
                webhook_url: authResult.merchant.webhook_url,
                is_active: authResult.merchant.is_active,
                created_at: Math.floor(authResult.merchant.created_at.getTime() / 1000),
            },
            token,
        };
        logger_1.logger.info('Merchant logged in', {
            id: authResult.merchant.id,
            email: authResult.merchant.email,
        });
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
        logger_1.logger.error('Login failed:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Login failed',
            },
        });
    }
});
router.get('/me', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const fullMerchant = await Merchant_1.Merchant.findById(merchant.id);
        if (!fullMerchant) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Merchant not found',
                },
            });
        }
        const response = {
            id: fullMerchant.id,
            email: fullMerchant.email,
            business_name: fullMerchant.business_name,
            website_url: fullMerchant.website_url,
            api_key_public: fullMerchant.api_key_public,
            webhook_url: fullMerchant.webhook_url,
            webhook_secret: fullMerchant.webhook_secret,
            is_active: fullMerchant.is_active,
            created_at: Math.floor(fullMerchant.created_at.getTime() / 1000),
            updated_at: Math.floor(fullMerchant.updated_at.getTime() / 1000),
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to get merchant info:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve merchant information',
            },
        });
    }
});
router.patch('/me', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const validatedData = updateProfileSchema.parse(req.body);
        const currentMerchant = await Merchant_1.Merchant.findById(merchant.id);
        if (!currentMerchant) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Merchant not found',
                },
            });
        }
        const updatedMerchant = await Merchant_1.Merchant.updateProfile(merchant.id, {
            business_name: validatedData.business_name || currentMerchant.business_name,
            website_url: validatedData.website_url === '' ? null : (validatedData.website_url || currentMerchant.website_url),
            webhook_url: validatedData.webhook_url === '' ? null : (validatedData.webhook_url || currentMerchant.webhook_url),
        });
        const response = {
            id: updatedMerchant.id,
            email: updatedMerchant.email,
            business_name: updatedMerchant.business_name,
            website_url: updatedMerchant.website_url,
            api_key_public: updatedMerchant.api_key_public,
            webhook_url: updatedMerchant.webhook_url,
            is_active: updatedMerchant.is_active,
            created_at: Math.floor(updatedMerchant.created_at.getTime() / 1000),
            updated_at: Math.floor(updatedMerchant.updated_at.getTime() / 1000),
        };
        logger_1.logger.info('Merchant profile updated', {
            merchantId: merchant.id,
            changes: validatedData,
        });
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
        logger_1.logger.error('Failed to update merchant profile:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to update profile',
            },
        });
    }
});
router.post('/webhook', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const validatedData = updateWebhookSchema.parse(req.body);
        const updatedMerchant = await Merchant_1.Merchant.updateWebhookConfig(merchant.id, validatedData.webhook_url);
        const response = {
            webhook_url: updatedMerchant.webhook_url,
            webhook_secret: updatedMerchant.webhook_secret,
            updated_at: Math.floor(updatedMerchant.updated_at.getTime() / 1000),
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
        logger_1.logger.error('Failed to update webhook config:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to update webhook configuration',
            },
        });
    }
});
router.post('/regenerate-keys', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const newKeys = await Merchant_1.Merchant.regenerateApiKeys(merchant.id);
        logger_1.logger.info('API keys regenerated', { merchantId: merchant.id });
        res.json({
            api_key_public: newKeys.api_key_public,
            api_key_secret: newKeys.api_key_secret,
            message: 'API keys regenerated successfully. Please update your integration with the new keys.',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to regenerate API keys:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to regenerate API keys',
            },
        });
    }
});
router.get('/stats', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const paymentIntents = await PaymentIntent_1.PaymentIntent.findByMerchant(merchant.id, 1000);
        const stats = {
            total_payments: paymentIntents.length,
            successful_payments: paymentIntents.filter(pi => pi.status === 'succeeded').length,
            failed_payments: paymentIntents.filter(pi => pi.status === 'failed').length,
            pending_payments: paymentIntents.filter(pi => ['requires_payment', 'processing'].includes(pi.status)).length,
            total_volume_sats: paymentIntents
                .filter(pi => pi.status === 'succeeded')
                .reduce((sum, pi) => sum + pi.amount_sats, 0),
            total_volume_usd: paymentIntents
                .filter(pi => pi.status === 'succeeded')
                .reduce((sum, pi) => sum + (pi.amount_usd || 0), 0),
            recent_payments: paymentIntents
                .slice(0, 10)
                .map(pi => ({
                id: pi.id,
                amount_sats: pi.amount_sats,
                amount_usd: pi.amount_usd,
                status: pi.status,
                created_at: Math.floor(pi.created_at.getTime() / 1000),
            })),
        };
        res.json(stats);
    }
    catch (error) {
        logger_1.logger.error('Failed to get merchant stats:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve statistics',
            },
        });
    }
});
router.get('/payment-intents', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const search = req.query.search;
        const status = req.query.status;
        let paymentIntents = await PaymentIntent_1.PaymentIntent.findByMerchant(merchant.id, limit);
        if (search) {
            paymentIntents = paymentIntents.filter(pi => pi.id.toLowerCase().includes(search.toLowerCase()) ||
                pi.description?.toLowerCase().includes(search.toLowerCase()));
        }
        if (status && status !== 'all') {
            paymentIntents = paymentIntents.filter(pi => pi.status === status);
        }
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
                stacks_address: pi.stacks_address,
                bitcoin_address: pi.bitcoin_address,
                sbtc_tx_id: pi.sbtc_tx_id,
                confirmation_count: pi.confirmation_count,
                created: Math.floor(pi.created_at.getTime() / 1000),
                expires_at: Math.floor(pi.expires_at.getTime() / 1000),
            })),
            has_more: paymentIntents.length === limit,
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to get payment intents:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve payment intents',
            },
        });
    }
});
router.get('/keys', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchant = req.merchant;
        const fullMerchant = await Merchant_1.Merchant.findById(merchant.id);
        if (!fullMerchant) {
            return res.status(404).json({
                error: {
                    type: 'invalid_request_error',
                    message: 'Merchant not found',
                },
            });
        }
        const response = {
            api_key_public: fullMerchant.api_key_public,
            api_key_secret: fullMerchant.api_key_secret,
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to get API keys:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to retrieve API keys',
            },
        });
    }
});
exports.default = router;
