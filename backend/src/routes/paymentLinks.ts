import { Router, Request, Response } from 'express';
import { authenticateJWT } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import { PaymentLink, CreatePaymentLinkRequest, UpdatePaymentLinkRequest } from '@/models/PaymentLink';
import { convertUsdToSbtc, convertSbtcToUsd, formatCurrency, isValidAmount } from '@/services/exchangeRate';

const router = Router();

// In-memory storage for demo (replace with database in production)
const paymentLinks = new Map<string, PaymentLink>();

// Generate unique payment link ID
const generatePaymentLinkId = (): string => {
  return `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// GET /payment-links - List all payment links for merchant
router.get('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { status, limit = 10, offset = 0 } = req.query;

    // Filter payment links for this merchant
    const merchantLinks = Array.from(paymentLinks.values())
      .filter(link => link.merchant_id === merchantId)
      .filter(link => !status || link.status === status)
      .slice(Number(offset), Number(offset) + Number(limit));

    const total = Array.from(paymentLinks.values())
      .filter(link => link.merchant_id === merchantId)
      .filter(link => !status || link.status === status).length;

    res.json({
      data: merchantLinks,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error) {
    logger.error('Error fetching payment links:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /payment-links - Create new payment link
router.post('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const linkData: CreatePaymentLinkRequest = req.body;

    // Validate required fields
    if (!linkData.title || !linkData.description || !linkData.amount) {
      return res.status(400).json({
        error: 'Missing required fields: title, description, amount'
      });
    }

    // Validate amount with currency support
    const currency = linkData.currency || 'sbtc';
    if (!isValidAmount(linkData.amount, currency)) {
      return res.status(400).json({
        error: `Invalid amount for ${currency}. Amount must be positive and within acceptable limits.`
      });
    }

    // Validate custom amount settings
    if (linkData.allow_custom_amounts) {
      if (linkData.min_amount && linkData.max_amount && linkData.min_amount >= linkData.max_amount) {
        return res.status(400).json({
          error: 'min_amount must be less than max_amount'
        });
      }
    }

    const paymentLinkId = generatePaymentLinkId();
    const now = new Date();

    const paymentLink: PaymentLink = {
      id: paymentLinkId,
      merchant_id: merchantId,
      title: linkData.title,
      description: linkData.description,
      amount: linkData.amount,
      currency: linkData.currency || 'sbtc',
      status: 'active',
      expires_at: linkData.expires_at ? new Date(linkData.expires_at) : undefined,
      success_url: linkData.success_url,
      cancel_url: linkData.cancel_url,
      collect_shipping_address: linkData.collect_shipping_address || false,
      collect_phone_number: linkData.collect_phone_number || false,
      allow_custom_amounts: linkData.allow_custom_amounts || false,
      min_amount: linkData.min_amount,
      max_amount: linkData.max_amount,
      usage_limit: linkData.usage_limit,
      metadata: linkData.metadata || {},
      created_at: now,
      updated_at: now,
      usage_count: 0
    };

    paymentLinks.set(paymentLinkId, paymentLink);

    logger.info(`Payment link created: ${paymentLinkId} for merchant: ${merchantId}`);

    res.status(201).json(paymentLink);
  } catch (error) {
    logger.error('Error creating payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /payment-links/:id - Get specific payment link
router.get('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;

    const paymentLink = paymentLinks.get(id);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if merchant owns this payment link
    if (paymentLink.merchant_id !== merchantId) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    res.json(paymentLink);
  } catch (error) {
    logger.error('Error fetching payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /payment-links/:id - Update payment link
router.put('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;
    const updateData: UpdatePaymentLinkRequest = req.body;

    const paymentLink = paymentLinks.get(id);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if merchant owns this payment link
    if (paymentLink.merchant_id !== merchantId) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Validate amount if provided
    if (updateData.amount !== undefined && updateData.amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than 0'
      });
    }

    // Update fields
    const updatedLink: PaymentLink = {
      ...paymentLink,
      ...updateData,
      id, // Ensure ID doesn't change
      merchant_id: merchantId, // Ensure merchant doesn't change
      updated_at: new Date(),
      expires_at: updateData.expires_at ? new Date(updateData.expires_at) : paymentLink.expires_at
    };

    paymentLinks.set(id, updatedLink);

    logger.info(`Payment link updated: ${id}`);

    res.json(updatedLink);
  } catch (error) {
    logger.error('Error updating payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /payment-links/:id - Delete payment link
router.delete('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;

    const paymentLink = paymentLinks.get(id);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if merchant owns this payment link
    if (paymentLink.merchant_id !== merchantId) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    paymentLinks.delete(id);

    logger.info(`Payment link deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /public/payment-links/:id - Get payment link for public payment page (no auth required)
router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const paymentLink = paymentLinks.get(id);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if payment link is active and not expired
    if (paymentLink.status !== 'active') {
      return res.status(404).json({ error: 'Payment link is not active' });
    }

    if (paymentLink.expires_at && paymentLink.expires_at < new Date()) {
      return res.status(404).json({ error: 'Payment link has expired' });
    }

    // Check usage limit
    if (paymentLink.usage_limit && paymentLink.usage_count >= paymentLink.usage_limit) {
      return res.status(404).json({ error: 'Payment link usage limit exceeded' });
    }

    // Return public data (exclude sensitive information)
    const publicData = {
      id: paymentLink.id,
      title: paymentLink.title,
      description: paymentLink.description,
      amount: paymentLink.amount,
      currency: paymentLink.currency,
      collect_shipping_address: paymentLink.collect_shipping_address,
      collect_phone_number: paymentLink.collect_phone_number,
      allow_custom_amounts: paymentLink.allow_custom_amounts,
      min_amount: paymentLink.min_amount,
      max_amount: paymentLink.max_amount
    };

    res.json(publicData);
  } catch (error) {
    logger.error('Error fetching public payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /public/payment-links/:id/pay - Create payment intent from payment link (no auth required)
router.post('/public/:id/pay', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, customer_info } = req.body;

    const paymentLink = paymentLinks.get(id);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Check if payment link is active and not expired
    if (paymentLink.status !== 'active') {
      return res.status(404).json({ error: 'Payment link is not active' });
    }

    if (paymentLink.expires_at && paymentLink.expires_at < new Date()) {
      return res.status(404).json({ error: 'Payment link has expired' });
    }

    // Check usage limit
    if (paymentLink.usage_limit && paymentLink.usage_count >= paymentLink.usage_limit) {
      return res.status(404).json({ error: 'Payment link usage limit exceeded' });
    }

    // Determine payment amount and handle currency conversion
    let finalAmount = paymentLink.amount;
    let sbtcAmount = paymentLink.amount;
    let usdAmount = 0;
    
    if (paymentLink.allow_custom_amounts && amount) {
      if (paymentLink.min_amount && amount < paymentLink.min_amount) {
        return res.status(400).json({ 
          error: `Amount must be at least ${formatCurrency(paymentLink.min_amount, paymentLink.currency)}` 
        });
      }
      if (paymentLink.max_amount && amount > paymentLink.max_amount) {
        return res.status(400).json({ 
          error: `Amount cannot exceed ${formatCurrency(paymentLink.max_amount, paymentLink.currency)}` 
        });
      }
      finalAmount = amount;
    }

    // Handle currency conversion
    if (paymentLink.currency === 'usd') {
      // Convert USD to sBTC for blockchain payment
      const conversion = await convertUsdToSbtc(finalAmount);
      sbtcAmount = conversion.amount_sbtc;
      usdAmount = finalAmount;
    } else {
      // Payment link is in sBTC, convert to USD for display
      const conversion = await convertSbtcToUsd(finalAmount);
      sbtcAmount = finalAmount;
      usdAmount = conversion.amount_usd;
    }

    // Create payment intent
    const paymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create payment intent with currency conversion
    const paymentIntent = {
      id: paymentIntentId,
      client_secret: `${paymentIntentId}_secret_${Math.random().toString(36).substr(2, 9)}`,
      amount: sbtcAmount, // Always use sBTC for blockchain transaction
      amount_sbtc: sbtcAmount,
      amount_usd: usdAmount,
      currency: paymentLink.currency,
      display_currency: paymentLink.currency,
      description: `${paymentLink.title} - ${paymentLink.description}`,
      status: 'pending',
      payment_link_id: paymentLink.id,
      customer_info: customer_info || {},
      metadata: {
        ...paymentLink.metadata,
        payment_link_id: paymentLink.id,
        payment_link_title: paymentLink.title,
        original_amount: finalAmount,
        original_currency: paymentLink.currency
      },
      created: Math.floor(Date.now() / 1000)
    };

    // Increment usage count
    paymentLink.usage_count += 1;
    paymentLinks.set(id, paymentLink);

    logger.info(`Payment intent created from payment link: ${paymentIntentId} (link: ${id})`);

    res.status(201).json(paymentIntent);
  } catch (error) {
    logger.error('Error creating payment intent from payment link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;