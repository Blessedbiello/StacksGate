import { Request, Response, NextFunction } from 'express';
import { WebhookService } from '@/services/WebhookService';
import { logger } from '@/utils/logger';

export interface WebhookVerificationOptions {
  tolerance?: number; // Timestamp tolerance in seconds (default: 5 minutes)
  requireSignature?: boolean; // Whether signature is required (default: true)
}

/**
 * Middleware to verify webhook signatures from StacksGate
 * This is intended for merchants to use in their webhook endpoints
 * to verify that requests are genuinely from StacksGate
 */
export function verifyWebhookSignature(
  webhookSecret: string,
  options: WebhookVerificationOptions = {}
) {
  const { tolerance = 300, requireSignature = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-stacksgate-signature'] as string;
      const timestamp = req.headers['x-stacksgate-timestamp'] as string;
      const eventType = req.headers['x-stacksgate-event'] as string;

      // Check if signature is required but missing
      if (requireSignature && !signature) {
        logger.warn('Webhook signature verification failed: Missing signature', {
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

      // If signature is not required and not present, skip verification
      if (!requireSignature && !signature) {
        logger.debug('Webhook signature verification skipped: Not required');
        return next();
      }

      // Get raw body for signature verification
      let body: string;
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body.toString('utf8');
      } else if (typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      } else {
        logger.error('Webhook signature verification failed: Invalid body type', {
          bodyType: typeof req.body,
        });
        
        return res.status(400).json({
          error: {
            type: 'webhook_signature_verification_failed',
            message: 'Invalid request body format',
          },
        });
      }

      // Verify the signature
      const isValid = WebhookService.verifySignature(
        body,
        signature,
        webhookSecret,
        tolerance
      );

      if (!isValid) {
        logger.warn('Webhook signature verification failed: Invalid signature', {
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

      // Add webhook info to request for downstream middleware
      (req as any).webhook = {
        verified: true,
        eventType,
        timestamp: parseInt(timestamp),
        signature,
      };

      logger.debug('Webhook signature verified successfully', {
        url: req.url,
        eventType,
        timestamp,
      });

      next();
    } catch (error) {
      logger.error('Webhook signature verification error:', error);
      
      res.status(500).json({
        error: {
          type: 'webhook_signature_verification_failed',
          message: 'Failed to verify webhook signature',
        },
      });
    }
  };
}

/**
 * Express middleware to parse raw body for webhook signature verification
 * This should be used before JSON parsing middleware for webhook endpoints
 */
export function parseRawBody(req: Request, res: Response, next: NextFunction) {
  if (req.headers['content-type'] === 'application/json') {
    let data = '';
    
    req.on('data', (chunk) => {
      data += chunk;
    });
    
    req.on('end', () => {
      try {
        (req as any).rawBody = data;
        req.body = JSON.parse(data);
        next();
      } catch (error) {
        logger.error('Failed to parse webhook JSON body:', error);
        res.status(400).json({
          error: {
            type: 'invalid_request_error',
            message: 'Invalid JSON in request body',
          },
        });
      }
    });
    
    req.on('error', (error) => {
      logger.error('Error reading webhook request body:', error);
      res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Error reading request body',
        },
      });
    });
  } else {
    next();
  }
}

/**
 * Utility function for merchants to verify webhook signatures in their own code
 * without using Express middleware
 */
export function verifyWebhookPayload(
  body: string,
  signature: string,
  webhookSecret: string,
  options: WebhookVerificationOptions = {}
): { valid: boolean; error?: string } {
  try {
    const { tolerance = 300 } = options;
    
    if (!signature) {
      return { valid: false, error: 'Missing signature' };
    }
    
    if (!webhookSecret) {
      return { valid: false, error: 'Missing webhook secret' };
    }
    
    const isValid = WebhookService.verifySignature(body, signature, webhookSecret, tolerance);
    
    return { valid: isValid, error: isValid ? undefined : 'Invalid signature' };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Example webhook endpoint implementation for merchants
 * This shows how to properly handle StacksGate webhooks
 */
export function createExampleWebhookHandler() {
  return [
    parseRawBody,
    verifyWebhookSignature(process.env.STACKSGATE_WEBHOOK_SECRET!),
    (req: Request, res: Response) => {
      try {
        const { type, data } = req.body;
        const webhook = (req as any).webhook;
        
        logger.info('Received verified webhook', {
          eventType: type,
          webhookId: req.body.id,
          timestamp: webhook.timestamp,
        });
        
        // Handle different webhook event types
        switch (type) {
          case 'payment_intent.succeeded':
            // Handle successful payment
            logger.info('Payment succeeded', {
              paymentIntentId: data.object.id,
              amount: data.object.amount_sats,
            });
            break;
            
          case 'payment_intent.failed':
            // Handle failed payment
            logger.warn('Payment failed', {
              paymentIntentId: data.object.id,
              amount: data.object.amount_sats,
            });
            break;
            
          case 'payment_intent.processing':
            // Handle payment in progress
            logger.info('Payment processing', {
              paymentIntentId: data.object.id,
              amount: data.object.amount_sats,
            });
            break;
            
          case 'test.webhook':
            // Handle test webhook
            logger.info('Test webhook received successfully');
            break;
            
          default:
            logger.warn('Unknown webhook event type', { type });
        }
        
        // Always respond with 200 OK to acknowledge receipt
        res.status(200).json({ received: true });
      } catch (error) {
        logger.error('Error processing webhook:', error);
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