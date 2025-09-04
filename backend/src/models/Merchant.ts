import { query } from '@/utils/database';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

export interface MerchantData {
  id: string;
  email: string;
  business_name: string;
  website_url?: string;
  api_key_public: string;
  api_key_secret: string;
  webhook_url?: string;
  webhook_secret?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMerchantParams {
  email: string;
  password: string;
  business_name: string;
  website_url?: string;
  webhook_url?: string;
}

export interface MerchantAuth {
  merchant: Omit<MerchantData, 'api_key_secret'>;
  token: string;
}

export class Merchant {
  static async create(params: CreateMerchantParams): Promise<MerchantData> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(params.password, 12);
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
      const result = await query(sql, values);
      const merchant = result.rows[0];

      logger.info('Merchant created', {
        id,
        email: params.email,
        business_name: params.business_name,
      });

      return merchant;
    } catch (error) {
      if ((error as any).code === '23505') { // Unique constraint violation
        throw new Error('A merchant with this email already exists');
      }
      logger.error('Failed to create merchant:', error);
      throw error;
    }
  }

  static async authenticate(email: string, password: string): Promise<MerchantAuth | null> {
    const sql = `
      SELECT id, email, password_hash, business_name, website_url, 
             api_key_public, webhook_url, is_active, created_at, updated_at
      FROM merchants 
      WHERE email = $1 AND is_active = true
    `;

    try {
      const result = await query(sql, [email.toLowerCase()]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const merchant = result.rows[0];
      const isValidPassword = await bcrypt.compare(password, merchant.password_hash);

      if (!isValidPassword) {
        return null;
      }

      // Remove password_hash from response
      const { password_hash, ...merchantData } = merchant;

      // Generate JWT token (you'll need to implement this)
      const token = this.generateJWT(merchant.id);

      logger.info('Merchant authenticated', {
        id: merchant.id,
        email: merchant.email,
      });

      return {
        merchant: merchantData,
        token,
      };
    } catch (error) {
      logger.error('Failed to authenticate merchant:', error);
      throw error;
    }
  }

  static async findByApiKey(apiKey: string): Promise<MerchantData | null> {
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
      const result = await query(sql, [apiKey]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to find merchant by API key:', error);
      throw error;
    }
  }

  static async findById(id: string): Promise<MerchantData | null> {
    const sql = `
      SELECT id, email, business_name, website_url, api_key_public, 
             api_key_secret, webhook_url, webhook_secret, is_active, 
             created_at, updated_at
      FROM merchants 
      WHERE id = $1
    `;

    try {
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to find merchant by ID:', error);
      throw error;
    }
  }

  static async updateWebhookConfig(id: string, webhookUrl?: string): Promise<MerchantData> {
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
      const result = await query(sql, [id, webhookUrl, webhookSecret]);
      
      if (result.rows.length === 0) {
        throw new Error('Merchant not found');
      }

      logger.info('Merchant webhook config updated', {
        id,
        webhookUrl,
        hasWebhookSecret: !!webhookSecret,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update merchant webhook config:', error);
      throw error;
    }
  }

  static async regenerateApiKeys(id: string): Promise<{ api_key_public: string; api_key_secret: string }> {
    const apiKeyPublic = `pk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(32)}`;
    const apiKeySecret = `sk_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${this.generateApiKey(48)}`;

    const sql = `
      UPDATE merchants 
      SET api_key_public = $2, api_key_secret = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    try {
      await query(sql, [id, apiKeyPublic, apiKeySecret]);

      logger.info('Merchant API keys regenerated', { id });

      return {
        api_key_public: apiKeyPublic,
        api_key_secret: apiKeySecret,
      };
    } catch (error) {
      logger.error('Failed to regenerate API keys:', error);
      throw error;
    }
  }

  private static generateApiKey(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private static generateJWT(merchantId: string): string {
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.sign(
      { 
        merchantId,
        type: 'merchant'
      },
      jwtSecret,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: 'stacksgate',
        audience: 'stacksgate-api'
      }
    );
  }

  static async updateProfile(id: string, updates: {
    business_name?: string;
    website_url?: string | null;
    webhook_url?: string | null;
  }): Promise<MerchantData> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    // Build dynamic update query
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
      
      // Also update webhook_secret if webhook_url is being set/unset
      const webhookSecret = updates.webhook_url ? `whsec_${this.generateApiKey(32)}` : null;
      updateFields.push(`webhook_secret = $${paramIndex}`);
      values.push(webhookSecret);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Always update the updated_at timestamp
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
      const result = await query(sql, values);
      
      if (result.rows.length === 0) {
        throw new Error('Merchant not found');
      }

      logger.info('Merchant profile updated', {
        id,
        updates: Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined),
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update merchant profile:', error);
      throw error;
    }
  }

  static async deactivate(id: string): Promise<void> {
    const sql = 'UPDATE merchants SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
    
    try {
      await query(sql, [id]);
      logger.info('Merchant deactivated', { id });
    } catch (error) {
      logger.error('Failed to deactivate merchant:', error);
      throw error;
    }
  }
}