"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Merchant = void 0;
const database_1 = require("@/utils/database");
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
const logger_1 = require("@/utils/logger");
class Merchant {
    static async create(params) {
        const id = (0, uuid_1.v4)();
        const passwordHash = await bcrypt_1.default.hash(params.password, 12);
        const apiKeyPublic = `pk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(32)}`;
        const apiKeySecret = `sk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(48)}`;
        const webhookSecret = params.webhook_url ? `whsec_${this.generateApiKey(32)}` : null;
        const sql = `
      INSERT INTO merchants (
        id, email, password_hash, business_name, website_url,
        api_key_public, api_key_secret, webhook_url, webhook_secret
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, business_name, website_url, api_key_public, 
                api_key_secret, webhook_url, webhook_secret, is_active, 
                created_at, updated_at
    `;
        const values = [
            id,
            params.email.toLowerCase(),
            passwordHash,
            params.business_name,
            params.website_url,
            apiKeyPublic,
            apiKeySecret,
            params.webhook_url,
            webhookSecret,
        ];
        try {
            const result = await (0, database_1.query)(sql, values);
            const merchant = result.rows[0];
            logger_1.logger.info('Merchant created', {
                id,
                email: params.email,
                business_name: params.business_name,
            });
            return merchant;
        }
        catch (error) {
            if (error.code === '23505') {
                throw new Error('A merchant with this email already exists');
            }
            logger_1.logger.error('Failed to create merchant:', error);
            throw error;
        }
    }
    static async authenticate(email, password) {
        const sql = `
      SELECT id, email, password_hash, business_name, website_url, 
             api_key_public, webhook_url, is_active, created_at, updated_at
      FROM merchants 
      WHERE email = $1 AND is_active = true
    `;
        try {
            const result = await (0, database_1.query)(sql, [email.toLowerCase()]);
            if (result.rows.length === 0) {
                return null;
            }
            const merchant = result.rows[0];
            const isValidPassword = await bcrypt_1.default.compare(password, merchant.password_hash);
            if (!isValidPassword) {
                return null;
            }
            const { password_hash, ...merchantData } = merchant;
            const token = this.generateJWT(merchant.id);
            logger_1.logger.info('Merchant authenticated', {
                id: merchant.id,
                email: merchant.email,
            });
            return {
                merchant: merchantData,
                token,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to authenticate merchant:', error);
            throw error;
        }
    }
    static async findByApiKey(apiKey) {
        const isPublicKey = apiKey.startsWith('pk_');
        const column = isPublicKey ? 'api_key_public' : 'api_key_secret';
        const sql = `
      SELECT id, email, business_name, website_url, api_key_public, 
             api_key_secret, webhook_url, webhook_secret, is_active, 
             created_at, updated_at
      FROM merchants 
      WHERE ${column} = $1 AND is_active = true
    `;
        try {
            const result = await (0, database_1.query)(sql, [apiKey]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to find merchant by API key:', error);
            throw error;
        }
    }
    static async findById(id) {
        const sql = `
      SELECT id, email, business_name, website_url, api_key_public, 
             api_key_secret, webhook_url, webhook_secret, is_active, 
             created_at, updated_at
      FROM merchants 
      WHERE id = $1
    `;
        try {
            const result = await (0, database_1.query)(sql, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to find merchant by ID:', error);
            throw error;
        }
    }
    static async updateWebhookConfig(id, webhookUrl) {
        const webhookSecret = webhookUrl ? `whsec_${this.generateApiKey(32)}` : null;
        const sql = `
      UPDATE merchants 
      SET webhook_url = $2, webhook_secret = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 
      RETURNING id, email, business_name, website_url, api_key_public, 
                api_key_secret, webhook_url, webhook_secret, is_active, 
                created_at, updated_at
    `;
        try {
            const result = await (0, database_1.query)(sql, [id, webhookUrl, webhookSecret]);
            if (result.rows.length === 0) {
                throw new Error('Merchant not found');
            }
            logger_1.logger.info('Merchant webhook config updated', {
                id,
                webhookUrl,
                hasWebhookSecret: !!webhookSecret,
            });
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to update merchant webhook config:', error);
            throw error;
        }
    }
    static async regenerateApiKeys(id) {
        const apiKeyPublic = `pk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(32)}`;
        const apiKeySecret = `sk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(48)}`;
        const sql = `
      UPDATE merchants 
      SET api_key_public = $2, api_key_secret = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        try {
            await (0, database_1.query)(sql, [id, apiKeyPublic, apiKeySecret]);
            logger_1.logger.info('Merchant API keys regenerated', { id });
            return {
                api_key_public: apiKeyPublic,
                api_key_secret: apiKeySecret,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to regenerate API keys:', error);
            throw error;
        }
    }
    static generateApiKey(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    static generateJWT(merchantId) {
        const jwt = require('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
        return jwt.sign({
            merchantId,
            type: 'merchant'
        }, jwtSecret, {
            expiresIn: process.env.JWT_EXPIRES_IN || '24h',
            issuer: 'stacksgate',
            audience: 'stacksgate-api'
        });
    }
    static async updateProfile(id, updates) {
        const updateFields = [];
        const values = [id];
        let paramIndex = 2;
        if (updates.business_name !== undefined) {
            updateFields.push(`business_name = $${paramIndex}`);
            values.push(updates.business_name);
            paramIndex++;
        }
        if (updates.website_url !== undefined) {
            updateFields.push(`website_url = $${paramIndex}`);
            values.push(updates.website_url);
            paramIndex++;
        }
        if (updates.webhook_url !== undefined) {
            updateFields.push(`webhook_url = $${paramIndex}`);
            values.push(updates.webhook_url);
            paramIndex++;
            const webhookSecret = updates.webhook_url ? `whsec_${this.generateApiKey(32)}` : null;
            updateFields.push(`webhook_secret = $${paramIndex}`);
            values.push(webhookSecret);
            paramIndex++;
        }
        if (updateFields.length === 0) {
            throw new Error('No fields to update');
        }
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        const sql = `
      UPDATE merchants 
      SET ${updateFields.join(', ')}
      WHERE id = $1 
      RETURNING id, email, business_name, website_url, api_key_public, 
                api_key_secret, webhook_url, webhook_secret, is_active, 
                created_at, updated_at
    `;
        try {
            const result = await (0, database_1.query)(sql, values);
            if (result.rows.length === 0) {
                throw new Error('Merchant not found');
            }
            logger_1.logger.info('Merchant profile updated', {
                id,
                updates: Object.keys(updates).filter(key => updates[key] !== undefined),
            });
            return result.rows[0];
        }
        catch (error) {
            logger_1.logger.error('Failed to update merchant profile:', error);
            throw error;
        }
    }
    static async deactivate(id) {
        const sql = 'UPDATE merchants SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
        try {
            await (0, database_1.query)(sql, [id]);
            logger_1.logger.info('Merchant deactivated', { id });
        }
        catch (error) {
            logger_1.logger.error('Failed to deactivate merchant:', error);
            throw error;
        }
    }
}
exports.Merchant = Merchant;
