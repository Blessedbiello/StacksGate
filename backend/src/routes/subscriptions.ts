import { Router, Request, Response } from 'express';
import { authenticateJWT } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  cancelSubscription,
  createSubscriptionInvoice,
  recordUsage,
  getSubscriptionUsage,
  processBilling
} from '@/services/subscriptionService';
import { 
  CreateSubscriptionRequest, 
  UpdateSubscriptionRequest,
  SubscriptionStatus 
} from '@/models/Subscription';
import { formatCurrency, isValidAmount } from '@/services/exchangeRate';

const router = Router();

// POST /subscriptions - Create a new subscription
router.post('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const subscriptionData: CreateSubscriptionRequest = req.body;

    // Validation
    if (!subscriptionData.product_name || !subscriptionData.amount || !subscriptionData.currency || !subscriptionData.interval) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Missing required fields: product_name, amount, currency, interval'
        }
      });
    }

    if (!isValidAmount(subscriptionData.amount, subscriptionData.currency)) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: `Invalid amount for ${subscriptionData.currency}. Amount must be positive and within acceptable limits.`
        }
      });
    }

    if (!['day', 'week', 'month', 'year'].includes(subscriptionData.interval)) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Invalid interval. Must be one of: day, week, month, year'
        }
      });
    }

    if (!subscriptionData.customer_info || !subscriptionData.customer_info.email) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Customer email is required for subscriptions'
        }
      });
    }

    const subscription = await createSubscription(merchantId, subscriptionData);

    res.status(201).json({
      success: true,
      data: {
        ...subscription,
        formatted_amount: formatCurrency(subscription.amount, subscription.currency),
        billing_summary: `${formatCurrency(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`
      }
    });

  } catch (error) {
    logger.error('Subscription creation error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to create subscription'
      }
    });
  }
});

// GET /subscriptions - List subscriptions for merchant
router.get('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { status, limit = 10, offset = 0 } = req.query;

    // Validate status filter
    const validStatuses = ['active', 'canceled', 'past_due', 'incomplete', 'paused'];
    if (status && !validStatuses.includes(status as string)) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`
        }
      });
    }

    const result = await listSubscriptions(merchantId, {
      status: status as SubscriptionStatus,
      limit: Number(limit),
      offset: Number(offset)
    });

    const subscriptionsWithFormatting = result.data.map(subscription => ({
      ...subscription,
      formatted_amount: formatCurrency(subscription.amount, subscription.currency),
      billing_summary: `${formatCurrency(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
      days_until_next_billing: subscription.next_billing_date ? 
        Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
    }));

    res.json({
      success: true,
      data: subscriptionsWithFormatting,
      pagination: {
        total: result.total,
        limit: Number(limit),
        offset: Number(offset),
        has_more: result.total > Number(offset) + Number(limit)
      }
    });

  } catch (error) {
    logger.error('Subscription list error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to fetch subscriptions'
      }
    });
  }
});

// GET /subscriptions/:id - Get a specific subscription
router.get('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;

    const subscription = await getSubscription(id);

    if (!subscription || subscription.merchant_id !== merchantId) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...subscription,
        formatted_amount: formatCurrency(subscription.amount, subscription.currency),
        billing_summary: `${formatCurrency(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
        days_until_next_billing: subscription.next_billing_date ? 
          Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
        is_trialing: subscription.trial_end ? subscription.trial_end > new Date() : false
      }
    });

  } catch (error) {
    logger.error('Subscription fetch error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to fetch subscription'
      }
    });
  }
});

// PUT /subscriptions/:id - Update a subscription
router.put('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;
    const updates: UpdateSubscriptionRequest = req.body;

    // Validate amount if provided
    if (updates.amount !== undefined && updates.currency) {
      if (!isValidAmount(updates.amount, updates.currency)) {
        return res.status(400).json({
          error: {
            type: 'validation_error',
            message: `Invalid amount for ${updates.currency}. Amount must be positive and within acceptable limits.`
          }
        });
      }
    }

    // Validate interval if provided
    if (updates.interval && !['day', 'week', 'month', 'year'].includes(updates.interval)) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Invalid interval. Must be one of: day, week, month, year'
        }
      });
    }

    const subscription = await updateSubscription(id, merchantId, updates);

    if (!subscription) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...subscription,
        formatted_amount: formatCurrency(subscription.amount, subscription.currency),
        billing_summary: `${formatCurrency(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
        days_until_next_billing: subscription.next_billing_date ? 
          Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
      }
    });

  } catch (error) {
    logger.error('Subscription update error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to update subscription'
      }
    });
  }
});

// DELETE /subscriptions/:id - Cancel a subscription
router.delete('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;
    const { at_period_end = true, immediately = false } = req.query;

    const subscription = await cancelSubscription(id, merchantId, {
      at_period_end: at_period_end === 'true',
      immediately: immediately === 'true'
    });

    if (!subscription) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...subscription,
        cancellation_effective: immediately === 'true' ? 'immediately' : 'at_period_end',
        service_ends_at: subscription.ended_at
      },
      message: immediately === 'true' 
        ? 'Subscription canceled immediately' 
        : 'Subscription will be canceled at the end of the current billing period'
    });

  } catch (error) {
    logger.error('Subscription cancellation error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to cancel subscription'
      }
    });
  }
});

// POST /subscriptions/:id/usage - Record usage for metered subscriptions
router.post('/:id/usage', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;
    const { quantity, action = 'increment', timestamp, description, metadata } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Quantity must be a positive number'
        }
      });
    }

    if (!['increment', 'set'].includes(action)) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Action must be either "increment" or "set"'
        }
      });
    }

    const usageRecord = await recordUsage(id, merchantId, quantity, action, {
      timestamp: timestamp ? new Date(timestamp) : undefined,
      description,
      metadata
    });

    if (!usageRecord) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found or not configured for usage tracking'
        }
      });
    }

    res.status(201).json({
      success: true,
      data: usageRecord,
      message: `Usage ${action}ed successfully`
    });

  } catch (error) {
    logger.error('Usage recording error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to record usage'
      }
    });
  }
});

// GET /subscriptions/:id/usage - Get usage summary for a subscription
router.get('/:id/usage', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;
    const { period_start, period_end } = req.query;

    const options: any = {};
    if (period_start) options.period_start = new Date(period_start as string);
    if (period_end) options.period_end = new Date(period_end as string);

    const usageSummary = await getSubscriptionUsage(id, merchantId, options);

    if (!usageSummary) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found'
        }
      });
    }

    res.json({
      success: true,
      data: usageSummary
    });

  } catch (error) {
    logger.error('Usage summary error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to fetch usage summary'
      }
    });
  }
});

// POST /subscriptions/:id/invoices - Create an invoice for a subscription
router.post('/:id/invoices', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).merchant.id;
    const { id } = req.params;

    // Verify subscription belongs to merchant
    const subscription = await getSubscription(id);
    if (!subscription || subscription.merchant_id !== merchantId) {
      return res.status(404).json({
        error: {
          type: 'resource_missing',
          message: 'Subscription not found'
        }
      });
    }

    const invoice = await createSubscriptionInvoice(id);

    if (!invoice) {
      return res.status(400).json({
        error: {
          type: 'api_error',
          message: 'Failed to create invoice for subscription'
        }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...invoice,
        formatted_total: formatCurrency(invoice.total, invoice.currency),
        formatted_amount_due: formatCurrency(invoice.amount_due, invoice.currency)
      }
    });

  } catch (error) {
    logger.error('Invoice creation error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to create invoice'
      }
    });
  }
});

// POST /subscriptions/billing/process - Process billing for all due subscriptions (internal/cron endpoint)
router.post('/billing/process', async (req: Request, res: Response) => {
  try {
    // This endpoint should be protected by internal API authentication in production
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.INTERNAL_API_TOKEN || 'internal-billing-token-change-in-production';
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid internal API token'
        }
      });
    }

    const results = await processBilling();

    res.json({
      success: true,
      data: results,
      message: `Processed ${results.processed} subscriptions, ${results.failed} failed`
    });

  } catch (error) {
    logger.error('Billing processing error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to process billing'
      }
    });
  }
});

export default router;