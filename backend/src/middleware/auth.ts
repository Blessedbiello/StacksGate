import { Request, Response, NextFunction } from 'express';
import { Merchant } from '@/models/Merchant';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  merchant: any;
}

// API Key authentication middleware
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;
    
    let apiKey: string | undefined;

    // Check for API key in Authorization header (Bearer token format)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }
    // Check for API key in X-API-Key header
    else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'No API key provided. Include your API key in the Authorization header as Bearer token or X-API-Key header.',
        },
      });
    }

    // Validate API key format
    if (!apiKey.match(/^(pk|sk)_(test|live)_[a-zA-Z0-9]{32,48}$/)) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid API key format.',
        },
      });
    }

    // Find merchant by API key
    const merchant = await Merchant.findByApiKey(apiKey);

    if (!merchant) {
      logger.warn('Invalid API key used', { 
        apiKeyPrefix: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid API key.',
        },
      });
    }

    if (!merchant.is_active) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Merchant account is deactivated.',
        },
      });
    }

    // Check if it's a public key being used for secret key endpoints
    if (apiKey.startsWith('pk_') && req.method !== 'GET') {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Public API keys cannot be used for write operations. Use your secret API key.',
        },
      });
    }

    // Add merchant to request object (excluding sensitive data)
    (req as AuthenticatedRequest).merchant = {
      id: merchant.id,
      email: merchant.email,
      business_name: merchant.business_name,
      website_url: merchant.website_url,
    };

    logger.debug('API request authenticated', {
      merchantId: merchant.id,
      keyType: apiKey.startsWith('pk_') ? 'public' : 'secret',
      method: req.method,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Authentication failed',
      },
    });
  }
}

// JWT authentication middleware for dashboard
export async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'No authentication token provided.',
        },
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: {
          type: 'api_error',
          message: 'Authentication configuration error',
        },
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as { merchantId: string; iat: number; exp: number };
    
    // Find merchant
    const merchant = await Merchant.findById(decoded.merchantId);

    if (!merchant || !merchant.is_active) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid authentication token.',
        },
      });
    }

    // Add merchant to request object (excluding sensitive data)
    (req as AuthenticatedRequest).merchant = {
      id: merchant.id,
      email: merchant.email,
      business_name: merchant.business_name,
      website_url: merchant.website_url,
    };

    logger.debug('JWT request authenticated', {
      merchantId: merchant.id,
      method: req.method,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid authentication token.',
        },
      });
    }

    logger.error('JWT authentication error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: 'Authentication failed',
      },
    });
  }
}

// Optional authentication middleware (allows both authenticated and unauthenticated requests)
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (!authHeader && !apiKeyHeader) {
      // No authentication provided, continue without merchant data
      return next();
    }

    // Try to authenticate
    await authenticateApiKey(req, res, next);
  } catch (error) {
    // If authentication fails, continue without merchant data
    next();
  }
}

// Rate limiting by API key or IP
export function createRateLimitKey(req: Request): string {
  const merchant = (req as AuthenticatedRequest).merchant;
  
  if (merchant) {
    return `rate_limit:merchant:${merchant.id}`;
  }
  
  return `rate_limit:ip:${req.ip}`;
}

// Middleware to check merchant permissions for specific resources
export function requireMerchantOwnership(resourceIdParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const merchant = (req as AuthenticatedRequest).merchant;
    const resourceId = req.params[resourceIdParam];

    if (!merchant) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Authentication required',
        },
      });
    }

    // This middleware assumes the route handler will check ownership
    // The specific ownership check depends on the resource type
    next();
  };
}