"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateApiKey = authenticateApiKey;
exports.authenticateJWT = authenticateJWT;
exports.optionalAuth = optionalAuth;
exports.createRateLimitKey = createRateLimitKey;
exports.requireMerchantOwnership = requireMerchantOwnership;
exports.authenticateToken = authenticateToken;
const Merchant_1 = require("@/models/Merchant");
const logger_1 = require("@/utils/logger");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
async function authenticateApiKey(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers['x-api-key'];
        let apiKey;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7);
        }
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
        if (!apiKey.match(/^(pk|sk)_(test|live)_[a-zA-Z0-9]{32,48}$/)) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Invalid API key format.',
                },
            });
        }
        const merchant = await Merchant_1.Merchant.findByApiKey(apiKey);
        if (!merchant) {
            logger_1.logger.warn('Invalid API key used', {
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
        if (apiKey.startsWith('pk_') && req.method !== 'GET') {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Public API keys cannot be used for write operations. Use your secret API key.',
                },
            });
        }
        req.merchant = {
            id: merchant.id,
            email: merchant.email,
            business_name: merchant.business_name,
            website_url: merchant.website_url,
        };
        logger_1.logger.debug('API request authenticated', {
            merchantId: merchant.id,
            keyType: apiKey.startsWith('pk_') ? 'public' : 'secret',
            method: req.method,
            path: req.path,
        });
        next();
    }
    catch (error) {
        logger_1.logger.error('Authentication error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Authentication failed',
            },
        });
    }
}
async function authenticateJWT(req, res, next) {
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
            logger_1.logger.error('JWT_SECRET not configured');
            return res.status(500).json({
                error: {
                    type: 'api_error',
                    message: 'Authentication configuration error',
                },
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const merchant = await Merchant_1.Merchant.findById(decoded.merchantId);
        if (!merchant || !merchant.is_active) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Invalid authentication token.',
                },
            });
        }
        req.merchant = {
            id: merchant.id,
            email: merchant.email,
            business_name: merchant.business_name,
            website_url: merchant.website_url,
        };
        logger_1.logger.debug('JWT request authenticated', {
            merchantId: merchant.id,
            method: req.method,
            path: req.path,
        });
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Invalid authentication token.',
                },
            });
        }
        logger_1.logger.error('JWT authentication error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Authentication failed',
            },
        });
    }
}
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers['x-api-key'];
        if (!authHeader && !apiKeyHeader) {
            return next();
        }
        await authenticateApiKey(req, res, next);
    }
    catch (error) {
        next();
    }
}
function createRateLimitKey(req) {
    const merchant = req.merchant;
    if (merchant) {
        return `rate_limit:merchant:${merchant.id}`;
    }
    return `rate_limit:ip:${req.ip}`;
}
function requireMerchantOwnership(resourceIdParam = 'id') {
    return async (req, res, next) => {
        const merchant = req.merchant;
        const resourceId = req.params[resourceIdParam];
        if (!merchant) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Authentication required',
                },
            });
        }
        next();
    };
}
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No authentication token provided',
            });
        }
        const token = authHeader.substring(7);
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-min-32-chars';
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = {
            userId: decoded.merchantId,
        };
        next();
    }
    catch (error) {
        return res.status(401).json({
            error: 'Invalid authentication token',
        });
    }
}
