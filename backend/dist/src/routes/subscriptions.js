"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const logger_1 = require("@/utils/logger");
const subscriptionService_1 = require("@/services/subscriptionService");
const exchangeRate_1 = require("@/services/exchangeRate");
const router = (0, express_1.Router)();
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const subscriptionData = req.body;
        if (!subscriptionData.product_name || !subscriptionData.amount || !subscriptionData.currency || !subscriptionData.interval) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Missing required fields: product_name, amount, currency, interval'
                }
            });
        }
        if (!(0, exchangeRate_1.isValidAmount)(subscriptionData.amount, subscriptionData.currency)) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: `Invalid amount for ${subscriptionData.currency}. Amount must be positive and within acceptable limits.`
                }
            });
        }
        if (!['day', 'week', 'month', 'year'].includes(subscriptionData.interval)) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Invalid interval. Must be one of: day, week, month, year'
                }
            });
        }
        if (!subscriptionData.customer_info || !subscriptionData.customer_info.email) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Customer email is required for subscriptions'
                }
            });
        }
        const subscription = await (0, subscriptionService_1.createSubscription)(merchantId, subscriptionData);
        res.status(201).json({
            success: true,
            data: {
                ...subscription,
                formatted_amount: (0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency),
                billing_summary: `${(0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Subscription creation error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to create subscription'
            }
        });
    }
});
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { status, limit = 10, offset = 0 } = req.query;
        const validStatuses = ['active', 'canceled', 'past_due', 'incomplete', 'paused'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`
                }
            });
        }
        const result = await (0, subscriptionService_1.listSubscriptions)(merchantId, {
            status: status,
            limit: Number(limit),
            offset: Number(offset)
        });
        const subscriptionsWithFormatting = result.data.map(subscription => ({
            ...subscription,
            formatted_amount: (0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency),
            billing_summary: `${(0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
            days_until_next_billing: subscription.next_billing_date ?
                Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
        }));
        res.json({
            success: true,
            data: subscriptionsWithFormatting,
            pagination: {
                total: result.total,
                limit: Number(limit),
                offset: Number(offset),
                has_more: result.total > Number(offset) + Number(limit)
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Subscription list error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to fetch subscriptions'
            }
        });
    }
});
router.get('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const subscription = await (0, subscriptionService_1.getSubscription)(id);
        if (!subscription || subscription.merchant_id !== merchantId) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found'
                }
            });
        }
        res.json({
            success: true,
            data: {
                ...subscription,
                formatted_amount: (0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency),
                billing_summary: `${(0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
                days_until_next_billing: subscription.next_billing_date ?
                    Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
                is_trialing: subscription.trial_end ? subscription.trial_end > new Date() : false
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Subscription fetch error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to fetch subscription'
            }
        });
    }
});
router.put('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const updates = req.body;
        if (updates.amount !== undefined && updates.currency) {
            if (!(0, exchangeRate_1.isValidAmount)(updates.amount, updates.currency)) {
                return res.status(400).json({
                    error: {
                        type: 'validation_error',
                        message: `Invalid amount for ${updates.currency}. Amount must be positive and within acceptable limits.`
                    }
                });
            }
        }
        if (updates.interval && !['day', 'week', 'month', 'year'].includes(updates.interval)) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Invalid interval. Must be one of: day, week, month, year'
                }
            });
        }
        const subscription = await (0, subscriptionService_1.updateSubscription)(id, merchantId, updates);
        if (!subscription) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found'
                }
            });
        }
        res.json({
            success: true,
            data: {
                ...subscription,
                formatted_amount: (0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency),
                billing_summary: `${(0, exchangeRate_1.formatCurrency)(subscription.amount, subscription.currency)} every ${subscription.interval_count} ${subscription.interval}${subscription.interval_count > 1 ? 's' : ''}`,
                days_until_next_billing: subscription.next_billing_date ?
                    Math.ceil((subscription.next_billing_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Subscription update error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to update subscription'
            }
        });
    }
});
router.delete('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const { at_period_end = true, immediately = false } = req.query;
        const subscription = await (0, subscriptionService_1.cancelSubscription)(id, merchantId, {
            at_period_end: at_period_end === 'true',
            immediately: immediately === 'true'
        });
        if (!subscription) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found'
                }
            });
        }
        res.json({
            success: true,
            data: {
                ...subscription,
                cancellation_effective: immediately === 'true' ? 'immediately' : 'at_period_end',
                service_ends_at: subscription.ended_at
            },
            message: immediately === 'true'
                ? 'Subscription canceled immediately'
                : 'Subscription will be canceled at the end of the current billing period'
        });
    }
    catch (error) {
        logger_1.logger.error('Subscription cancellation error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to cancel subscription'
            }
        });
    }
});
router.post('/:id/usage', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const { quantity, action = 'increment', timestamp, description, metadata } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Quantity must be a positive number'
                }
            });
        }
        if (!['increment', 'set'].includes(action)) {
            return res.status(400).json({
                error: {
                    type: 'validation_error',
                    message: 'Action must be either "increment" or "set"'
                }
            });
        }
        const usageRecord = await (0, subscriptionService_1.recordUsage)(id, merchantId, quantity, action, {
            timestamp: timestamp ? new Date(timestamp) : undefined,
            description,
            metadata
        });
        if (!usageRecord) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found or not configured for usage tracking'
                }
            });
        }
        res.status(201).json({
            success: true,
            data: usageRecord,
            message: `Usage ${action}ed successfully`
        });
    }
    catch (error) {
        logger_1.logger.error('Usage recording error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to record usage'
            }
        });
    }
});
router.get('/:id/usage', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const { period_start, period_end } = req.query;
        const options = {};
        if (period_start)
            options.period_start = new Date(period_start);
        if (period_end)
            options.period_end = new Date(period_end);
        const usageSummary = await (0, subscriptionService_1.getSubscriptionUsage)(id, merchantId, options);
        if (!usageSummary) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found'
                }
            });
        }
        res.json({
            success: true,
            data: usageSummary
        });
    }
    catch (error) {
        logger_1.logger.error('Usage summary error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to fetch usage summary'
            }
        });
    }
});
router.post('/:id/invoices', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const subscription = await (0, subscriptionService_1.getSubscription)(id);
        if (!subscription || subscription.merchant_id !== merchantId) {
            return res.status(404).json({
                error: {
                    type: 'resource_missing',
                    message: 'Subscription not found'
                }
            });
        }
        const invoice = await (0, subscriptionService_1.createSubscriptionInvoice)(id);
        if (!invoice) {
            return res.status(400).json({
                error: {
                    type: 'api_error',
                    message: 'Failed to create invoice for subscription'
                }
            });
        }
        res.status(201).json({
            success: true,
            data: {
                ...invoice,
                formatted_total: (0, exchangeRate_1.formatCurrency)(invoice.total, invoice.currency),
                formatted_amount_due: (0, exchangeRate_1.formatCurrency)(invoice.amount_due, invoice.currency)
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Invoice creation error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to create invoice'
            }
        });
    }
});
router.post('/billing/process', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const expectedToken = process.env.INTERNAL_API_TOKEN || 'internal-billing-token-change-in-production';
        if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
            return res.status(401).json({
                error: {
                    type: 'authentication_error',
                    message: 'Invalid internal API token'
                }
            });
        }
        const results = await (0, subscriptionService_1.processBilling)();
        res.json({
            success: true,
            data: results,
            message: `Processed ${results.processed} subscriptions, ${results.failed} failed`
        });
    }
    catch (error) {
        logger_1.logger.error('Billing processing error:', error);
        res.status(500).json({
            error: {
                type: 'api_error',
                message: 'Failed to process billing'
            }
        });
    }
});
exports.default = router;
