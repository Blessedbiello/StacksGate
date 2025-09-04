export interface PaymentLink {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  amount: number; // in sBTC
  currency: 'sbtc' | 'usd';
  status: 'active' | 'inactive' | 'expired';
  expires_at?: Date;
  success_url?: string;
  cancel_url?: string;
  collect_shipping_address: boolean;
  collect_phone_number: boolean;
  allow_custom_amounts: boolean;
  min_amount?: number;
  max_amount?: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  usage_count: number;
  usage_limit?: number;
}

export interface CreatePaymentLinkRequest {
  title: string;
  description: string;
  amount: number;
  currency?: 'sbtc' | 'usd';
  expires_at?: string; // ISO date string
  success_url?: string;
  cancel_url?: string;
  collect_shipping_address?: boolean;
  collect_phone_number?: boolean;
  allow_custom_amounts?: boolean;
  min_amount?: number;
  max_amount?: number;
  usage_limit?: number;
  metadata?: Record<string, any>;
}

export interface UpdatePaymentLinkRequest {
  title?: string;
  description?: string;
  amount?: number;
  status?: 'active' | 'inactive';
  expires_at?: string;
  success_url?: string;
  cancel_url?: string;
  collect_shipping_address?: boolean;
  collect_phone_number?: boolean;
  allow_custom_amounts?: boolean;
  min_amount?: number;
  max_amount?: number;
  usage_limit?: number;
  metadata?: Record<string, any>;
}