import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PaymentIntent, CreatePaymentIntentParams, PaymentIntentStatus } from '@/models/PaymentIntent';
import { authenticateApiKey } from '@/middleware/auth';
import { logger } from '@/utils/logger';

const router = Router();

// Validation schemas
const createPaymentIntentSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(100000000, 'Amount too large'), // Max ~1 BTC
  currency: z.literal('btc').default('btc'),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional(),
  expires_in_hours: z.number().min(1).max(168).optional(), // 1 hour to 1 week
});

const updatePaymentIntentSchema = z.object({
  description: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional(),
});

// Create payment intent
router.post('/', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const validatedData = createPaymentIntentSchema.parse(req.body);
    const merchant = (req as any).merchant;

    // Convert BTC to satoshis (1 BTC = 100,000,000 sats)
    const amountSats = Math.floor(validatedData.amount * 100000000);

    // Get current BTC price in USD (placeholder for now)
    const btcToUsd = await getCurrentBTCPrice();
    const amountUsd = validatedData.amount * btcToUsd;

    const createParams: CreatePaymentIntentParams = {
      merchant_id: merchant.id,
      amount_sats: amountSats,
      amount_usd: amountUsd,
      description: validatedData.description,
      metadata: validatedData.metadata,
      expires_in_hours: validatedData.expires_in_hours,
    };

    const paymentIntent = await PaymentIntent.create(createParams);

    // Format response similar to Stripe
    const response = {
      id: paymentIntent.id,
      object: 'payment_intent',
      amount: validatedData.amount,
      amount_sats: amountSats,
      amount_usd: Math.round(amountUsd * 100) / 100, // Round to 2 decimal places
      currency: 'btc',
      status: paymentIntent.status,
      description: paymentIntent.description,
      metadata: paymentIntent.metadata,
      created: Math.floor(paymentIntent.created_at!.getTime() / 1000),
      expires_at: Math.floor(paymentIntent.expires_at!.getTime() / 1000),
      client_secret: `${paymentIntent.id}_secret_${generateClientSecret()}`,
    };

    logger.info('Payment intent created via API', {
      id: paymentIntent.id,
      merchant_id: merchant.id,
      amount_sats: amountSats,
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

    logger.error('Failed to create payment intent:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to create payment intent',
      },
    });
  }
});

// Public payment intent retrieval (no authentication required)
router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const paymentIntent = await PaymentIntent.findById(id);

    if (!paymentIntent) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent not found',
        },
      });
    }

    // Check if payment intent is expired
    const now = new Date();
    if (paymentIntent.expires_at && paymentIntent.expires_at < now) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent has expired',
        },
      });
    }

    // Return only public/safe information (no sensitive merchant data)
    const publicResponse = {
      id: paymentIntent.id,
      object: 'payment_intent',
      amount: paymentIntent.amount_sats / 100000000, // Convert sats back to BTC
      amount_sats: paymentIntent.amount_sats,
      amount_usd: paymentIntent.amount_usd,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      description: paymentIntent.description,
      stacks_address: paymentIntent.stacks_address,
      bitcoin_address: paymentIntent.bitcoin_address,
      confirmation_count: paymentIntent.confirmation_count,
      created: Math.floor(paymentIntent.created_at!.getTime() / 1000),
      expires_at: Math.floor(paymentIntent.expires_at!.getTime() / 1000),
      // Note: No metadata, merchant info, or other sensitive data
    };

    logger.info('Public payment intent retrieved', {
      id: paymentIntent.id,
      status: paymentIntent.status,
    });

    res.json(publicResponse);
  } catch (error) {
    logger.error('Failed to retrieve public payment intent:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve payment intent',
      },
    });
  }
});

// Retrieve payment intent (authenticated)
router.get('/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchant = (req as any).merchant;

    const paymentIntent = await PaymentIntent.findById(id);

    if (!paymentIntent || paymentIntent.merchant_id !== merchant.id) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent not found',
        },
      });
    }

    // Format response
    const response = {
      id: paymentIntent.id,
      object: 'payment_intent',
      amount: paymentIntent.amount_sats / 100000000, // Convert sats back to BTC
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
      created: Math.floor(paymentIntent.created_at!.getTime() / 1000),
      expires_at: Math.floor(paymentIntent.expires_at!.getTime() / 1000),
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to retrieve payment intent:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve payment intent',
      },
    });
  }
});

// Update payment intent
router.post('/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchant = (req as any).merchant;
    const validatedData = updatePaymentIntentSchema.parse(req.body);

    const existingPaymentIntent = await PaymentIntent.findById(id);

    if (!existingPaymentIntent || existingPaymentIntent.merchant_id !== merchant.id) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent not found',
        },
      });
    }

    // Only allow updates if payment intent is in requires_payment status
    if (existingPaymentIntent.status !== 'requires_payment') {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent cannot be updated in current status',
        },
      });
    }

    const updatedPaymentIntent = await PaymentIntent.updateStatus(
      id,
      existingPaymentIntent.status,
      {
        description: validatedData.description,
        metadata: validatedData.metadata,
      }
    );

    // Format response
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
      created: Math.floor(updatedPaymentIntent.created_at!.getTime() / 1000),
      expires_at: Math.floor(updatedPaymentIntent.expires_at!.getTime() / 1000),
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

    logger.error('Failed to update payment intent:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to update payment intent',
      },
    });
  }
});

// Cancel payment intent
router.post('/:id/cancel', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchant = (req as any).merchant;
    const { cancellation_reason } = req.body;

    const existingPaymentIntent = await PaymentIntent.findById(id);

    if (!existingPaymentIntent || existingPaymentIntent.merchant_id !== merchant.id) {
      return res.status(404).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent not found',
        },
      });
    }

    // Only allow cancellation if payment intent is in requires_payment or processing status
    if (!['requires_payment', 'processing'].includes(existingPaymentIntent.status)) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Payment intent cannot be canceled in current status',
        },
      });
    }

    const canceledPaymentIntent = await PaymentIntent.cancel(id, cancellation_reason);

    // Format response
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
      created: Math.floor(canceledPaymentIntent.created_at!.getTime() / 1000),
      expires_at: Math.floor(canceledPaymentIntent.expires_at!.getTime() / 1000),
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to cancel payment intent:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to cancel payment intent',
      },
    });
  }
});

// List payment intents
router.get('/', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const offset = parseInt(req.query.starting_after as string) || 0;

    const paymentIntents = await PaymentIntent.findByMerchant(merchant.id, limit, offset);

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
        created: Math.floor(pi.created_at!.getTime() / 1000),
        expires_at: Math.floor(pi.expires_at!.getTime() / 1000),
      })),
      has_more: paymentIntents.length === limit,
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to list payment intents:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to list payment intents',
      },
    });
  }
});

// Helper functions
async function getCurrentBTCPrice(): Promise<number> {
  // Use the real StacksService to get Bitcoin price
  const { StacksService } = await import('@/services/StacksService');
  const stacksService = new StacksService();
  return stacksService.getBitcoinPriceUSD();
}

function generateClientSecret(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export default router;