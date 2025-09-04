export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'paused';
export type SubscriptionInterval = 'day' | 'week' | 'month' | 'year';
export type SubscriptionCurrency = 'sbtc' | 'usd';

export interface Subscription {
  id: string;
  merchant_id: string;
  customer_id?: string;
  status: SubscriptionStatus;
  
  // Pricing
  amount: number;
  currency: SubscriptionCurrency;
  interval: SubscriptionInterval;
  interval_count: number; // e.g., every 2 months = interval: 'month', interval_count: 2
  
  // Product details
  product_name: string;
  description?: string;
  
  // Billing cycle
  current_period_start: Date;
  current_period_end: Date;
  billing_cycle_anchor?: Date; // When to anchor billing cycles (optional)
  
  // Trial period
  trial_start?: Date;
  trial_end?: Date;
  
  // Payment tracking
  next_billing_date: Date;
  last_payment_date?: Date;
  failed_payment_attempts: number;
  
  // Discounts and adjustments
  discount_percent?: number;
  discount_amount?: number;
  discount_end_date?: Date;
  
  // Usage tracking (for usage-based billing)
  usage_type?: 'metered' | 'licensed';
  usage_limit?: number;
  current_usage?: number;
  
  // Customer information
  customer_info: {
    name?: string;
    email?: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  
  // Metadata
  metadata: Record<string, any>;
  
  // Lifecycle
  created_at: Date;
  updated_at: Date;
  canceled_at?: Date;
  ended_at?: Date;
  
  // Payment method
  default_payment_method_id?: string;
  
  // Webhook configuration
  webhook_url?: string;
  
  // Dunning management
  max_failed_payments: number;
  retry_schedule?: number[]; // Days to retry after failed payment
}

export interface CreateSubscriptionRequest {
  customer_info: {
    name?: string;
    email?: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  
  // Pricing
  amount: number;
  currency: SubscriptionCurrency;
  interval: SubscriptionInterval;
  interval_count?: number;
  
  // Product details
  product_name: string;
  description?: string;
  
  // Trial period (optional)
  trial_period_days?: number;
  
  // Billing configuration
  billing_cycle_anchor?: string; // ISO date string
  proration_behavior?: 'create_prorations' | 'none';
  
  // Discounts
  discount_percent?: number;
  discount_amount?: number;
  discount_end_date?: string; // ISO date string
  
  // Usage configuration
  usage_type?: 'metered' | 'licensed';
  usage_limit?: number;
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Webhooks
  webhook_url?: string;
  
  // Dunning configuration
  max_failed_payments?: number;
  retry_schedule?: number[];
}

export interface UpdateSubscriptionRequest {
  // Pricing changes
  amount?: number;
  currency?: SubscriptionCurrency;
  interval?: SubscriptionInterval;
  interval_count?: number;
  
  // Product details
  product_name?: string;
  description?: string;
  
  // Status changes
  status?: SubscriptionStatus;
  
  // Customer information updates
  customer_info?: {
    name?: string;
    email?: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  
  // Billing configuration
  proration_behavior?: 'create_prorations' | 'none' | 'always_invoice';
  
  // Discounts
  discount_percent?: number;
  discount_amount?: number;
  discount_end_date?: string; // ISO date string
  
  // Usage updates
  usage_limit?: number;
  current_usage?: number;
  
  // Trial extensions
  trial_end?: string; // ISO date string
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Webhooks
  webhook_url?: string;
  
  // Dunning configuration
  max_failed_payments?: number;
  retry_schedule?: number[];
}

export interface SubscriptionInvoice {
  id: string;
  subscription_id: string;
  merchant_id: string;
  
  // Invoice details
  amount: number;
  currency: SubscriptionCurrency;
  description: string;
  
  // Billing period
  period_start: Date;
  period_end: Date;
  
  // Payment details
  payment_intent_id?: string;
  paid: boolean;
  payment_date?: Date;
  
  // Status
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  
  // Attempts
  attempt_count: number;
  next_payment_attempt?: Date;
  
  // Amounts
  subtotal: number;
  tax_amount?: number;
  discount_amount?: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  
  // Customer
  customer_info: {
    name?: string;
    email?: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  
  // Line items
  line_items: {
    id: string;
    description: string;
    quantity: number;
    unit_amount: number;
    amount: number;
    period?: {
      start: Date;
      end: Date;
    };
  }[];
  
  // Metadata
  metadata: Record<string, any>;
  
  // Lifecycle
  created_at: Date;
  updated_at: Date;
  due_date: Date;
  finalized_at?: Date;
  voided_at?: Date;
}

export interface SubscriptionUsageRecord {
  id: string;
  subscription_id: string;
  merchant_id: string;
  
  quantity: number;
  timestamp: Date;
  action: 'increment' | 'set';
  
  // Optional details
  description?: string;
  metadata?: Record<string, any>;
  
  created_at: Date;
}

// Utility types for API responses
export interface SubscriptionListResponse {
  data: Subscription[];
  has_more: boolean;
  total_count?: number;
}

export interface SubscriptionEventsResponse {
  data: {
    id: string;
    type: string;
    created: number;
    data: {
      object: Subscription;
    };
  }[];
  has_more: boolean;
}