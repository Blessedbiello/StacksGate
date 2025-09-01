import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Merchant, CreateMerchantParams } from '@/models/Merchant';
import { PaymentIntent } from '@/models/PaymentIntent';
import { authenticateJWT, authenticateApiKey } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

const router = Router();

// Validation schemas
const createMerchantSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  business_name: z.string().min(1, 'Business name is required').max(255),
  website_url: z.string().url('Invalid website URL').optional(),
  webhook_url: z.string().url('Invalid webhook URL').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const updateWebhookSchema = z.object({
  webhook_url: z.string().url('Invalid webhook URL').optional(),
});

const updateProfileSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(255).optional(),
  website_url: z.string().url('Invalid website URL').optional().or(z.literal('')),
  webhook_url: z.string().url('Invalid webhook URL').optional().or(z.literal('')),
});

// Register new merchant
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = createMerchantSchema.parse(req.body);

    const createParams: CreateMerchantParams = {
      email: validatedData.email,
      password: validatedData.password,
      business_name: validatedData.business_name,
      website_url: validatedData.website_url,
      webhook_url: validatedData.webhook_url,
    };

    const merchant = await Merchant.create(createParams);

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const token = jwt.sign(
      { merchantId: merchant.id },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Return response without sensitive data
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

    logger.info('New merchant registered', {
      id: merchant.id,
      email: merchant.email,
      business_name: merchant.business_name,
    });

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid request parameters',
          details: error.errors,
        },
      });
    }

    if ((error as Error).message.includes('already exists')) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'A merchant with this email already exists',
        },
      });
    }

    logger.error('Failed to create merchant:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to create merchant account',
      },
    });
  }
});

// Login merchant
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const authResult = await Merchant.authenticate(validatedData.email, validatedData.password);

    if (!authResult) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid email or password',
        },
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const token = jwt.sign(
      { merchantId: authResult.merchant.id },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

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

    logger.info('Merchant logged in', {
      id: authResult.merchant.id,
      email: authResult.merchant.email,
    });

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid request parameters',
          details: error.errors,
        },
      });
    }

    logger.error('Login failed:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Login failed',
      },
    });
  }
});

// Get current merchant info
router.get('/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const fullMerchant = await Merchant.findById(merchant.id);

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
  } catch (error) {
    logger.error('Failed to get merchant info:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve merchant information',
      },
    });
  }
});

// Update merchant profile
router.patch('/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const validatedData = updateProfileSchema.parse(req.body);

    // Get current merchant data
    const currentMerchant = await Merchant.findById(merchant.id);
    if (!currentMerchant) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Merchant not found',
        },
      });
    }

    // Update merchant with new data
    const updatedMerchant = await Merchant.updateProfile(merchant.id, {
      business_name: validatedData.business_name || currentMerchant.business_name,
      website_url: validatedData.website_url === '' ? null : (validatedData.website_url || currentMerchant.website_url),
      webhook_url: validatedData.webhook_url === '' ? null : (validatedData.webhook_url || currentMerchant.webhook_url),
    });

    // Return updated merchant data (without sensitive fields)
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

    logger.info('Merchant profile updated', {
      merchantId: merchant.id,
      changes: validatedData,
    });

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid request parameters',
          details: error.errors,
        },
      });
    }

    logger.error('Failed to update merchant profile:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to update profile',
      },
    });
  }
});

// Update webhook configuration
router.post('/webhook', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const validatedData = updateWebhookSchema.parse(req.body);

    const updatedMerchant = await Merchant.updateWebhookConfig(
      merchant.id,
      validatedData.webhook_url
    );

    const response = {
      webhook_url: updatedMerchant.webhook_url,
      webhook_secret: updatedMerchant.webhook_secret,
      updated_at: Math.floor(updatedMerchant.updated_at.getTime() / 1000),
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid request parameters',
          details: error.errors,
        },
      });
    }

    logger.error('Failed to update webhook config:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to update webhook configuration',
      },
    });
  }
});

// Regenerate API keys
router.post('/regenerate-keys', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;

    const newKeys = await Merchant.regenerateApiKeys(merchant.id);

    logger.info('API keys regenerated', { merchantId: merchant.id });

    res.json({
      api_key_public: newKeys.api_key_public,
      api_key_secret: newKeys.api_key_secret,
      message: 'API keys regenerated successfully. Please update your integration with the new keys.',
    });
  } catch (error) {
    logger.error('Failed to regenerate API keys:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to regenerate API keys',
      },
    });
  }
});

// Get merchant dashboard stats
router.get('/stats', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    
    // Get payment statistics
    const paymentIntents = await PaymentIntent.findByMerchant(merchant.id, 1000); // Get more for stats
    
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
          created_at: Math.floor(pi.created_at!.getTime() / 1000),
        })),
    };

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get merchant stats:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve statistics',
      },
    });
  }
});

// Get merchant payment intents (for dashboard display)
router.get('/payment-intents', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = req.query.search as string;
    const status = req.query.status as string;

    // Get payment intents with filters
    let paymentIntents = await PaymentIntent.findByMerchant(merchant.id, limit);
    
    // Apply filters
    if (search) {
      paymentIntents = paymentIntents.filter(pi => 
        pi.id.toLowerCase().includes(search.toLowerCase()) ||
        pi.description?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (status && status !== 'all') {
      paymentIntents = paymentIntents.filter(pi => pi.status === status);
    }

    // Format response similar to Stripe API
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
        created: Math.floor(pi.created_at!.getTime() / 1000),
        expires_at: Math.floor(pi.expires_at!.getTime() / 1000),
      })),
      has_more: paymentIntents.length === limit,
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get payment intents:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve payment intents',
      },
    });
  }
});

// Get API keys (for dashboard display)
router.get('/keys', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const fullMerchant = await Merchant.findById(merchant.id);

    if (!fullMerchant) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Merchant not found',
        },
      });
    }

    // Always show both keys for authenticated user
    const response = {
      api_key_public: fullMerchant.api_key_public,
      api_key_secret: fullMerchant.api_key_secret,
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get API keys:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve API keys',
      },
    });
  }
});

export default router;