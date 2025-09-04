import { Router, Request, Response } from 'express';
import { authenticateApiKey, authenticateJWT } from '@/middleware/auth';
import { PaymentIntent } from '@/models/PaymentIntent';
import { Merchant } from '@/models/Merchant';
import { WebhookService } from '@/services/WebhookService';
import { logger } from '@/utils/logger';

const router = Router();

// Test webhook endpoint
router.post('/test', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchantFromToken = (req as any).merchant;
    
    // Fetch full merchant data from database to get current webhook URL
    const merchant = await Merchant.findById(merchantFromToken.id);
    
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

    // Create a test webhook payload
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

    // Send test webhook
    const success = await WebhookService.sendWebhook(
      merchant.id,
      merchant.webhook_url,
      merchant.webhook_secret,
      testPayload
    );

    if (success) {
      res.json({
        message: 'Test webhook sent successfully',
        webhook_url: merchant.webhook_url,
      });
    } else {
      res.status(400).json({
        error: {
          type: 'api_error',
          message: 'Failed to send test webhook',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to send test webhook:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to send test webhook',
      },
    });
  }
});

// Retry webhook for a specific payment intent
router.post('/retry/:payment_intent_id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const { payment_intent_id } = req.params;

    // Find the payment intent
    const paymentIntent = await PaymentIntent.findById(payment_intent_id);

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

    // Create webhook payload for the payment intent
    const webhookPayload = WebhookService.createPaymentIntentWebhook(paymentIntent);

    // Send webhook
    const success = await WebhookService.sendWebhook(
      merchant.id,
      merchant.webhook_url,
      merchant.webhook_secret,
      webhookPayload,
      payment_intent_id
    );

    if (success) {
      res.json({
        message: 'Webhook retry sent successfully',
        payment_intent_id,
        webhook_url: merchant.webhook_url,
      });
    } else {
      res.status(400).json({
        error: {
          type: 'api_error',
          message: 'Failed to retry webhook',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to retry webhook:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retry webhook',
      },
    });
  }
});

// Get webhook logs for merchant
router.get('/logs', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await WebhookService.getWebhookLogs(merchant.id, limit, offset);

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
  } catch (error) {
    logger.error('Failed to get webhook logs:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve webhook logs',
      },
    });
  }
});

// Get webhook statistics
router.get('/stats', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
    
    const stats = await WebhookService.getWebhookStats(merchant.id);

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get webhook stats:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to retrieve webhook statistics',
      },
    });
  }
});

// Manual webhook trigger (for development/testing)
router.post('/trigger', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const merchant = (req as any).merchant;
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

    // Create custom webhook payload
    const webhookPayload = {
      id: `evt_manual_${Date.now()}`,
      object: 'event',
      type: event_type,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: data || {},
      },
    };

    // Send webhook
    const success = await WebhookService.sendWebhook(
      merchant.id,
      merchant.webhook_url,
      merchant.webhook_secret,
      webhookPayload
    );

    if (success) {
      res.json({
        message: 'Manual webhook sent successfully',
        event_type,
        webhook_url: merchant.webhook_url,
      });
    } else {
      res.status(400).json({
        error: {
          type: 'api_error',
          message: 'Failed to send manual webhook',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to send manual webhook:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to send manual webhook',
      },
    });
  }
});

// Validate webhook endpoint (ping test)
router.post('/validate', authenticateApiKey, async (req: Request, res: Response) => {
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

    // Test if the webhook URL is reachable
    const isValid = await WebhookService.validateWebhookUrl(webhook_url);

    res.json({
      webhook_url,
      valid: isValid,
      message: isValid ? 'Webhook URL is valid and reachable' : 'Webhook URL is not reachable',
    });
  } catch (error) {
    logger.error('Failed to validate webhook URL:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Failed to validate webhook URL',
      },
    });
  }
});

export default router;