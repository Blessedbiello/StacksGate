"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsageStorage = exports.getInvoicesStorage = exports.getSubscriptionsStorage = exports.generateInvoiceId = exports.generateSubscriptionId = void 0;
exports.calculateNextBillingDate = calculateNextBillingDate;
exports.calculateTrialEnd = calculateTrialEnd;
exports.createSubscription = createSubscription;
exports.getSubscription = getSubscription;
exports.listSubscriptions = listSubscriptions;
exports.updateSubscription = updateSubscription;
exports.cancelSubscription = cancelSubscription;
exports.createSubscriptionInvoice = createSubscriptionInvoice;
exports.recordUsage = recordUsage;
exports.getSubscriptionUsage = getSubscriptionUsage;
exports.processBilling = processBilling;
const logger_1 = require("@/utils/logger");
const exchangeRate_1 = require("@/services/exchangeRate");
const subscriptions = new Map();
const subscriptionInvoices = new Map();
const usageRecords = new Map();
const generateSubscriptionId = () => {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
exports.generateSubscriptionId = generateSubscriptionId;
const generateInvoiceId = () => {
    return `in_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
exports.generateInvoiceId = generateInvoiceId;
function calculateNextBillingDate(currentDate, interval, intervalCount) {
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
function calculateTrialEnd(startDate, trialDays) {
    const trialEnd = new Date(startDate);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    return trialEnd;
}
async function createSubscription(merchantId, request) {
    const subscriptionId = (0, exports.generateSubscriptionId)();
    const now = new Date();
    let trialStart;
    let trialEnd;
    let currentPeriodStart = now;
    if (request.trial_period_days && request.trial_period_days > 0) {
        trialStart = now;
        trialEnd = calculateTrialEnd(now, request.trial_period_days);
        currentPeriodStart = trialEnd;
    }
    const currentPeriodEnd = calculateNextBillingDate(currentPeriodStart, request.interval, request.interval_count || 1);
    let nextBillingDate = currentPeriodEnd;
    if (request.billing_cycle_anchor) {
        const anchorDate = new Date(request.billing_cycle_anchor);
        if (anchorDate > now) {
            nextBillingDate = anchorDate;
        }
    }
    const subscription = {
        id: subscriptionId,
        merchant_id: merchantId,
        status: trialStart ? 'active' : 'active',
        amount: request.amount,
        currency: request.currency,
        interval: request.interval,
        interval_count: request.interval_count || 1,
        product_name: request.product_name,
        description: request.description,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        billing_cycle_anchor: request.billing_cycle_anchor ? new Date(request.billing_cycle_anchor) : undefined,
        trial_start: trialStart,
        trial_end: trialEnd,
        next_billing_date: nextBillingDate,
        failed_payment_attempts: 0,
        discount_percent: request.discount_percent,
        discount_amount: request.discount_amount,
        discount_end_date: request.discount_end_date ? new Date(request.discount_end_date) : undefined,
        usage_type: request.usage_type,
        usage_limit: request.usage_limit,
        current_usage: 0,
        customer_info: request.customer_info,
        metadata: request.metadata || {},
        created_at: now,
        updated_at: now,
        webhook_url: request.webhook_url,
        max_failed_payments: request.max_failed_payments || 3,
        retry_schedule: request.retry_schedule || [3, 7, 14],
    };
    subscriptions.set(subscriptionId, subscription);
    logger_1.logger.info('Subscription created', {
        subscriptionId,
        merchantId,
        amount: request.amount,
        currency: request.currency,
        interval: `${request.interval_count || 1} ${request.interval}`,
        trialDays: request.trial_period_days
    });
    if (subscription.usage_type === 'metered') {
        usageRecords.set(subscriptionId, []);
    }
    return subscription;
}
async function getSubscription(subscriptionId) {
    return subscriptions.get(subscriptionId) || null;
}
async function listSubscriptions(merchantId, options = {}) {
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
async function updateSubscription(subscriptionId, merchantId, updates) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription || subscription.merchant_id !== merchantId) {
        return null;
    }
    const now = new Date();
    const updatedSubscription = {
        ...subscription,
        ...updates,
        updated_at: now,
    };
    if (updates.status === 'canceled' && subscription.status !== 'canceled') {
        updatedSubscription.canceled_at = now;
    }
    if (updates.status === 'ended' && subscription.status !== 'ended') {
        updatedSubscription.ended_at = now;
    }
    if (updates.amount !== undefined || updates.interval !== undefined) {
        if (updates.interval && updates.interval !== subscription.interval) {
            updatedSubscription.next_billing_date = calculateNextBillingDate(subscription.current_period_start, updates.interval, updates.interval_count || subscription.interval_count);
        }
    }
    if (updates.trial_end) {
        updatedSubscription.trial_end = new Date(updates.trial_end);
    }
    if (updates.discount_end_date) {
        updatedSubscription.discount_end_date = new Date(updates.discount_end_date);
    }
    subscriptions.set(subscriptionId, updatedSubscription);
    logger_1.logger.info('Subscription updated', {
        subscriptionId,
        merchantId,
        changes: Object.keys(updates)
    });
    return updatedSubscription;
}
async function cancelSubscription(subscriptionId, merchantId, options = {}) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription || subscription.merchant_id !== merchantId) {
        return null;
    }
    const now = new Date();
    let canceledSubscription;
    if (options.immediately) {
        canceledSubscription = {
            ...subscription,
            status: 'canceled',
            canceled_at: now,
            ended_at: now,
            current_period_end: now,
            updated_at: now
        };
    }
    else {
        canceledSubscription = {
            ...subscription,
            status: 'canceled',
            canceled_at: now,
            ended_at: subscription.current_period_end,
            updated_at: now
        };
    }
    subscriptions.set(subscriptionId, canceledSubscription);
    logger_1.logger.info('Subscription canceled', {
        subscriptionId,
        merchantId,
        immediately: options.immediately || false,
        endDate: canceledSubscription.ended_at
    });
    return canceledSubscription;
}
async function createSubscriptionInvoice(subscriptionId) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) {
        return null;
    }
    const invoiceId = (0, exports.generateInvoiceId)();
    const now = new Date();
    let subtotal = subscription.amount;
    let discountAmount = 0;
    if (subscription.discount_percent) {
        discountAmount = (subtotal * subscription.discount_percent) / 100;
    }
    else if (subscription.discount_amount) {
        discountAmount = subscription.discount_amount;
    }
    const total = subtotal - discountAmount;
    let displayAmount = total;
    if (subscription.currency === 'usd') {
        const conversion = await (0, exchangeRate_1.convertUsdToSbtc)(total);
        displayAmount = conversion.amount_sbtc;
    }
    const invoice = {
        id: invoiceId,
        subscription_id: subscriptionId,
        merchant_id: subscription.merchant_id,
        amount: displayAmount,
        currency: subscription.currency,
        description: `${subscription.product_name} - ${subscription.description || 'Subscription'}`,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
        paid: false,
        status: 'open',
        attempt_count: 0,
        next_payment_attempt: subscription.next_billing_date,
        subtotal: subtotal,
        discount_amount: discountAmount,
        total: total,
        amount_paid: 0,
        amount_due: total,
        customer_info: subscription.customer_info,
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
        metadata: subscription.metadata,
        created_at: now,
        updated_at: now,
        due_date: subscription.next_billing_date,
    };
    subscriptionInvoices.set(invoiceId, invoice);
    logger_1.logger.info('Subscription invoice created', {
        invoiceId,
        subscriptionId,
        amount: total,
        currency: subscription.currency,
        dueDate: subscription.next_billing_date
    });
    return invoice;
}
async function recordUsage(subscriptionId, merchantId, quantity, action = 'increment', options = {}) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription || subscription.merchant_id !== merchantId) {
        return null;
    }
    if (subscription.usage_type !== 'metered') {
        throw new Error('Usage recording is only available for metered subscriptions');
    }
    const recordId = `ur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = options.timestamp || new Date();
    const usageRecord = {
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
    const records = usageRecords.get(subscriptionId) || [];
    records.push(usageRecord);
    usageRecords.set(subscriptionId, records);
    if (action === 'increment') {
        subscription.current_usage = (subscription.current_usage || 0) + quantity;
    }
    else if (action === 'set') {
        subscription.current_usage = quantity;
    }
    subscription.updated_at = new Date();
    subscriptions.set(subscriptionId, subscription);
    logger_1.logger.info('Usage recorded for subscription', {
        subscriptionId,
        merchantId,
        quantity,
        action,
        newTotal: subscription.current_usage
    });
    return usageRecord;
}
async function getSubscriptionUsage(subscriptionId, merchantId, options = {}) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription || subscription.merchant_id !== merchantId) {
        return null;
    }
    const allRecords = usageRecords.get(subscriptionId) || [];
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
    const totalUsage = subscription.current_usage || 0;
    const usageRemaining = subscription.usage_limit ? subscription.usage_limit - totalUsage : undefined;
    return {
        total_usage: totalUsage,
        usage_records: filteredRecords,
        usage_limit: subscription.usage_limit,
        usage_remaining: usageRemaining
    };
}
async function processBilling() {
    const now = new Date();
    const results = {
        processed: 0,
        failed: 0,
        invoices_created: []
    };
    const dueSubscriptions = Array.from(subscriptions.values())
        .filter(sub => sub.status === 'active' &&
        sub.next_billing_date <= now &&
        (!sub.trial_end || sub.trial_end <= now));
    logger_1.logger.info(`Processing billing for ${dueSubscriptions.length} subscriptions`);
    for (const subscription of dueSubscriptions) {
        try {
            const invoice = await createSubscriptionInvoice(subscription.id);
            if (invoice) {
                results.invoices_created.push(invoice.id);
                results.processed++;
                const nextBillingDate = calculateNextBillingDate(subscription.current_period_end, subscription.interval, subscription.interval_count);
                const updatedSubscription = {
                    ...subscription,
                    current_period_start: subscription.current_period_end,
                    current_period_end: nextBillingDate,
                    next_billing_date: nextBillingDate,
                    last_payment_date: now,
                    updated_at: now
                };
                subscriptions.set(subscription.id, updatedSubscription);
                logger_1.logger.info('Subscription billing processed', {
                    subscriptionId: subscription.id,
                    invoiceId: invoice.id,
                    nextBillingDate
                });
            }
            else {
                results.failed++;
                logger_1.logger.error('Failed to create invoice for subscription', {
                    subscriptionId: subscription.id
                });
            }
        }
        catch (error) {
            results.failed++;
            logger_1.logger.error('Error processing billing for subscription', {
                subscriptionId: subscription.id,
                error: error.message
            });
        }
    }
    return results;
}
const getSubscriptionsStorage = () => subscriptions;
exports.getSubscriptionsStorage = getSubscriptionsStorage;
const getInvoicesStorage = () => subscriptionInvoices;
exports.getInvoicesStorage = getInvoicesStorage;
const getUsageStorage = () => usageRecords;
exports.getUsageStorage = getUsageStorage;
