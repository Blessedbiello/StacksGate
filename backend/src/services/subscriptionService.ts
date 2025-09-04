import { 
  Subscription, 
  SubscriptionStatus, 
  SubscriptionInvoice, 
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  SubscriptionUsageRecord
} from '@/models/Subscription';
import { logger } from '@/utils/logger';
import { convertUsdToSbtc, convertSbtcToUsd, formatCurrency } from '@/services/exchangeRate';

// In-memory storage for demo (replace with database in production)
const subscriptions = new Map<string, Subscription>();
const subscriptionInvoices = new Map<string, SubscriptionInvoice>();
const usageRecords = new Map<string, SubscriptionUsageRecord[]>();

// Generate unique subscription ID
export const generateSubscriptionId = (): string => {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Generate unique invoice ID
export const generateInvoiceId = (): string => {
  return `in_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Calculate next billing date based on interval
export function calculateNextBillingDate(currentDate: Date, interval: string, intervalCount: number): Date {
  const nextDate = new Date(currentDate);
  
  switch (interval) {
    case 'day':
      nextDate.setDate(nextDate.getDate() + intervalCount);
      break;
    case 'week':
      nextDate.setDate(nextDate.getDate() + (intervalCount * 7));
      break;
    case 'month':
      nextDate.setMonth(nextDate.getMonth() + intervalCount);
      break;
    case 'year':
      nextDate.setFullYear(nextDate.getFullYear() + intervalCount);
      break;
    default:
      throw new Error(`Invalid interval: ${interval}`);
  }
  
  return nextDate;
}

// Calculate trial end date
export function calculateTrialEnd(startDate: Date, trialDays: number): Date {
  const trialEnd = new Date(startDate);
  trialEnd.setDate(trialEnd.getDate() + trialDays);
  return trialEnd;
}

// Create a new subscription
export async function createSubscription(
  merchantId: string, 
  request: CreateSubscriptionRequest
): Promise<Subscription> {
  const subscriptionId = generateSubscriptionId();
  const now = new Date();
  
  // Calculate trial period if specified
  let trialStart: Date | undefined;
  let trialEnd: Date | undefined;
  let currentPeriodStart = now;
  
  if (request.trial_period_days && request.trial_period_days > 0) {
    trialStart = now;
    trialEnd = calculateTrialEnd(now, request.trial_period_days);
    currentPeriodStart = trialEnd;
  }
  
  // Calculate billing period
  const currentPeriodEnd = calculateNextBillingDate(
    currentPeriodStart, 
    request.interval, 
    request.interval_count || 1
  );
  
  // Handle billing cycle anchor
  let nextBillingDate = currentPeriodEnd;
  if (request.billing_cycle_anchor) {
    const anchorDate = new Date(request.billing_cycle_anchor);
    if (anchorDate > now) {
      nextBillingDate = anchorDate;
    }
  }
  
  const subscription: Subscription = {
    id: subscriptionId,
    merchant_id: merchantId,
    status: trialStart ? 'active' : 'active', // Start trial or active
    
    // Pricing
    amount: request.amount,
    currency: request.currency,
    interval: request.interval,
    interval_count: request.interval_count || 1,
    
    // Product details
    product_name: request.product_name,
    description: request.description,
    
    // Billing cycle
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    billing_cycle_anchor: request.billing_cycle_anchor ? new Date(request.billing_cycle_anchor) : undefined,
    
    // Trial period
    trial_start: trialStart,
    trial_end: trialEnd,
    
    // Payment tracking
    next_billing_date: nextBillingDate,
    failed_payment_attempts: 0,
    
    // Discounts
    discount_percent: request.discount_percent,
    discount_amount: request.discount_amount,
    discount_end_date: request.discount_end_date ? new Date(request.discount_end_date) : undefined,
    
    // Usage tracking
    usage_type: request.usage_type,
    usage_limit: request.usage_limit,
    current_usage: 0,
    
    // Customer information
    customer_info: request.customer_info,
    
    // Metadata
    metadata: request.metadata || {},
    
    // Lifecycle
    created_at: now,
    updated_at: now,
    
    // Webhook configuration
    webhook_url: request.webhook_url,
    
    // Dunning management
    max_failed_payments: request.max_failed_payments || 3,
    retry_schedule: request.retry_schedule || [3, 7, 14], // Days
  };
  
  subscriptions.set(subscriptionId, subscription);
  
  logger.info('Subscription created', {
    subscriptionId,
    merchantId,
    amount: request.amount,
    currency: request.currency,
    interval: `${request.interval_count || 1} ${request.interval}`,
    trialDays: request.trial_period_days
  });
  
  // Initialize usage records for metered billing
  if (subscription.usage_type === 'metered') {
    usageRecords.set(subscriptionId, []);
  }
  
  return subscription;
}

// Get subscription by ID
export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  return subscriptions.get(subscriptionId) || null;
}

// List subscriptions for a merchant
export async function listSubscriptions(
  merchantId: string, 
  options: {
    status?: SubscriptionStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ data: Subscription[]; total: number }> {
  const allSubscriptions = Array.from(subscriptions.values())
    .filter(sub => sub.merchant_id === merchantId)
    .filter(sub => !options.status || sub.status === options.status)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  
  const limit = options.limit || 10;
  const offset = options.offset || 0;
  const data = allSubscriptions.slice(offset, offset + limit);
  
  return {
    data,
    total: allSubscriptions.length
  };
}

// Update subscription
export async function updateSubscription(
  subscriptionId: string,
  merchantId: string,
  updates: UpdateSubscriptionRequest
): Promise<Subscription | null> {
  const subscription = subscriptions.get(subscriptionId);
  
  if (!subscription || subscription.merchant_id !== merchantId) {
    return null;
  }
  
  const now = new Date();
  
  // Update subscription fields
  const updatedSubscription: Subscription = {
    ...subscription,
    ...updates,
    updated_at: now,
  };
  
  // Handle status changes
  if (updates.status === 'canceled' && subscription.status !== 'canceled') {
    updatedSubscription.canceled_at = now;
  }
  
  if (updates.status === 'ended' && subscription.status !== 'ended') {
    updatedSubscription.ended_at = now;
  }
  
  // Handle pricing changes with proration
  if (updates.amount !== undefined || updates.interval !== undefined) {
    // Recalculate next billing date if interval changed
    if (updates.interval && updates.interval !== subscription.interval) {
      updatedSubscription.next_billing_date = calculateNextBillingDate(
        subscription.current_period_start,
        updates.interval,
        updates.interval_count || subscription.interval_count
      );
    }
  }
  
  // Handle trial extensions
  if (updates.trial_end) {
    updatedSubscription.trial_end = new Date(updates.trial_end);
  }
  
  // Update discount end date
  if (updates.discount_end_date) {
    updatedSubscription.discount_end_date = new Date(updates.discount_end_date);
  }
  
  subscriptions.set(subscriptionId, updatedSubscription);
  
  logger.info('Subscription updated', {
    subscriptionId,
    merchantId,
    changes: Object.keys(updates)
  });
  
  return updatedSubscription;
}

// Cancel subscription
export async function cancelSubscription(
  subscriptionId: string,
  merchantId: string,
  options: { at_period_end?: boolean; immediately?: boolean } = {}
): Promise<Subscription | null> {
  const subscription = subscriptions.get(subscriptionId);
  
  if (!subscription || subscription.merchant_id !== merchantId) {
    return null;
  }
  
  const now = new Date();
  
  let canceledSubscription: Subscription;
  
  if (options.immediately) {
    // Cancel immediately
    canceledSubscription = {
      ...subscription,
      status: 'canceled',
      canceled_at: now,
      ended_at: now,
      current_period_end: now,
      updated_at: now
    };
  } else {
    // Cancel at period end (default)
    canceledSubscription = {
      ...subscription,
      status: 'canceled',
      canceled_at: now,
      ended_at: subscription.current_period_end,
      updated_at: now
    };
  }
  
  subscriptions.set(subscriptionId, canceledSubscription);
  
  logger.info('Subscription canceled', {
    subscriptionId,
    merchantId,
    immediately: options.immediately || false,
    endDate: canceledSubscription.ended_at
  });
  
  return canceledSubscription;
}

// Create invoice for subscription
export async function createSubscriptionInvoice(
  subscriptionId: string
): Promise<SubscriptionInvoice | null> {
  const subscription = subscriptions.get(subscriptionId);
  
  if (!subscription) {
    return null;
  }
  
  const invoiceId = generateInvoiceId();
  const now = new Date();
  
  // Calculate amounts with discounts
  let subtotal = subscription.amount;
  let discountAmount = 0;
  
  if (subscription.discount_percent) {
    discountAmount = (subtotal * subscription.discount_percent) / 100;
  } else if (subscription.discount_amount) {
    discountAmount = subscription.discount_amount;
  }
  
  const total = subtotal - discountAmount;
  
  // Handle currency conversion for display
  let displayAmount = total;
  if (subscription.currency === 'usd') {
    // Convert USD to sBTC for blockchain payment
    const conversion = await convertUsdToSbtc(total);
    displayAmount = conversion.amount_sbtc;
  }
  
  const invoice: SubscriptionInvoice = {
    id: invoiceId,
    subscription_id: subscriptionId,
    merchant_id: subscription.merchant_id,
    
    // Invoice details
    amount: displayAmount, // sBTC amount for blockchain
    currency: subscription.currency,
    description: `${subscription.product_name} - ${subscription.description || 'Subscription'}`,
    
    // Billing period
    period_start: subscription.current_period_start,
    period_end: subscription.current_period_end,
    
    // Payment details
    paid: false,
    
    // Status
    status: 'open',
    
    // Attempts
    attempt_count: 0,
    next_payment_attempt: subscription.next_billing_date,
    
    // Amounts
    subtotal: subtotal,
    discount_amount: discountAmount,
    total: total,
    amount_paid: 0,
    amount_due: total,
    
    // Customer
    customer_info: subscription.customer_info,
    
    // Line items
    line_items: [{
      id: `li_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      description: subscription.product_name,
      quantity: 1,
      unit_amount: subscription.amount,
      amount: subscription.amount,
      period: {
        start: subscription.current_period_start,
        end: subscription.current_period_end
      }
    }],
    
    // Metadata
    metadata: subscription.metadata,
    
    // Lifecycle
    created_at: now,
    updated_at: now,
    due_date: subscription.next_billing_date,
  };
  
  subscriptionInvoices.set(invoiceId, invoice);
  
  logger.info('Subscription invoice created', {
    invoiceId,
    subscriptionId,
    amount: total,
    currency: subscription.currency,
    dueDate: subscription.next_billing_date
  });
  
  return invoice;
}

// Record usage for metered subscriptions
export async function recordUsage(
  subscriptionId: string,
  merchantId: string,
  quantity: number,
  action: 'increment' | 'set' = 'increment',
  options: {
    timestamp?: Date;
    description?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<SubscriptionUsageRecord | null> {
  const subscription = subscriptions.get(subscriptionId);
  
  if (!subscription || subscription.merchant_id !== merchantId) {
    return null;
  }
  
  if (subscription.usage_type !== 'metered') {
    throw new Error('Usage recording is only available for metered subscriptions');
  }
  
  const recordId = `ur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = options.timestamp || new Date();
  
  const usageRecord: SubscriptionUsageRecord = {
    id: recordId,
    subscription_id: subscriptionId,
    merchant_id: merchantId,
    quantity,
    timestamp: now,
    action,
    description: options.description,
    metadata: options.metadata,
    created_at: new Date()
  };
  
  // Store usage record
  const records = usageRecords.get(subscriptionId) || [];
  records.push(usageRecord);
  usageRecords.set(subscriptionId, records);
  
  // Update subscription current usage
  if (action === 'increment') {
    subscription.current_usage = (subscription.current_usage || 0) + quantity;
  } else if (action === 'set') {
    subscription.current_usage = quantity;
  }
  
  subscription.updated_at = new Date();
  subscriptions.set(subscriptionId, subscription);
  
  logger.info('Usage recorded for subscription', {
    subscriptionId,
    merchantId,
    quantity,
    action,
    newTotal: subscription.current_usage
  });
  
  return usageRecord;
}

// Get subscription usage summary
export async function getSubscriptionUsage(
  subscriptionId: string,
  merchantId: string,
  options: {
    period_start?: Date;
    period_end?: Date;
  } = {}
): Promise<{
  total_usage: number;
  usage_records: SubscriptionUsageRecord[];
  usage_limit?: number;
  usage_remaining?: number;
} | null> {
  const subscription = subscriptions.get(subscriptionId);
  
  if (!subscription || subscription.merchant_id !== merchantId) {
    return null;
  }
  
  const allRecords = usageRecords.get(subscriptionId) || [];
  
  // Filter records by date range if specified
  let filteredRecords = allRecords;
  if (options.period_start || options.period_end) {
    filteredRecords = allRecords.filter(record => {
      if (options.period_start && record.timestamp < options.period_start) {
        return false;
      }
      if (options.period_end && record.timestamp > options.period_end) {
        return false;
      }
      return true;
    });
  }
  
  // Calculate total usage
  const totalUsage = subscription.current_usage || 0;
  const usageRemaining = subscription.usage_limit ? subscription.usage_limit - totalUsage : undefined;
  
  return {
    total_usage: totalUsage,
    usage_records: filteredRecords,
    usage_limit: subscription.usage_limit,
    usage_remaining: usageRemaining
  };
}

// Process billing for due subscriptions
export async function processBilling(): Promise<{
  processed: number;
  failed: number;
  invoices_created: string[];
}> {
  const now = new Date();
  const results = {
    processed: 0,
    failed: 0,
    invoices_created: [] as string[]
  };
  
  // Find subscriptions due for billing
  const dueSubscriptions = Array.from(subscriptions.values())
    .filter(sub => 
      sub.status === 'active' && 
      sub.next_billing_date <= now &&
      (!sub.trial_end || sub.trial_end <= now) // Not in trial period
    );
  
  logger.info(`Processing billing for ${dueSubscriptions.length} subscriptions`);
  
  for (const subscription of dueSubscriptions) {
    try {
      // Create invoice
      const invoice = await createSubscriptionInvoice(subscription.id);
      
      if (invoice) {
        results.invoices_created.push(invoice.id);
        results.processed++;
        
        // Update subscription for next billing cycle
        const nextBillingDate = calculateNextBillingDate(
          subscription.current_period_end,
          subscription.interval,
          subscription.interval_count
        );
        
        const updatedSubscription: Subscription = {
          ...subscription,
          current_period_start: subscription.current_period_end,
          current_period_end: nextBillingDate,
          next_billing_date: nextBillingDate,
          last_payment_date: now,
          updated_at: now
        };
        
        subscriptions.set(subscription.id, updatedSubscription);
        
        logger.info('Subscription billing processed', {
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          nextBillingDate
        });
      } else {
        results.failed++;
        logger.error('Failed to create invoice for subscription', {
          subscriptionId: subscription.id
        });
      }
    } catch (error) {
      results.failed++;
      logger.error('Error processing billing for subscription', {
        subscriptionId: subscription.id,
        error: (error as Error).message
      });
    }
  }
  
  return results;
}

// Get all subscriptions storage (for testing)
export const getSubscriptionsStorage = () => subscriptions;
export const getInvoicesStorage = () => subscriptionInvoices;
export const getUsageStorage = () => usageRecords;