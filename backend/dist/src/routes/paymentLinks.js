"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const logger_1 = require("@/utils/logger");
const exchangeRate_1 = require("@/services/exchangeRate");
const router = (0, express_1.Router)();
const paymentLinks = new Map();
const generatePaymentLinkId = () => {
    return `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
router.get('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { status, limit = 10, offset = 0 } = req.query;
        const merchantLinks = Array.from(paymentLinks.values())
            .filter(link => link.merchant_id === merchantId)
            .filter(link => !status || link.status === status)
            .slice(Number(offset), Number(offset) + Number(limit));
        const total = Array.from(paymentLinks.values())
            .filter(link => link.merchant_id === merchantId)
            .filter(link => !status || link.status === status).length;
        res.json({
            data: merchantLinks,
            total,
            limit: Number(limit),
            offset: Number(offset)
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching payment links:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const linkData = req.body;
        if (!linkData.title || !linkData.description || !linkData.amount) {
            return res.status(400).json({
                error: 'Missing required fields: title, description, amount'
            });
        }
        const currency = linkData.currency || 'sbtc';
        if (!(0, exchangeRate_1.isValidAmount)(linkData.amount, currency)) {
            return res.status(400).json({
                error: `Invalid amount for ${currency}. Amount must be positive and within acceptable limits.`
            });
        }
        if (linkData.allow_custom_amounts) {
            if (linkData.min_amount && linkData.max_amount && linkData.min_amount >= linkData.max_amount) {
                return res.status(400).json({
                    error: 'min_amount must be less than max_amount'
                });
            }
        }
        const paymentLinkId = generatePaymentLinkId();
        const now = new Date();
        const paymentLink = {
            id: paymentLinkId,
            merchant_id: merchantId,
            title: linkData.title,
            description: linkData.description,
            amount: linkData.amount,
            currency: linkData.currency || 'sbtc',
            status: 'active',
            expires_at: linkData.expires_at ? new Date(linkData.expires_at) : undefined,
            success_url: linkData.success_url,
            cancel_url: linkData.cancel_url,
            collect_shipping_address: linkData.collect_shipping_address || false,
            collect_phone_number: linkData.collect_phone_number || false,
            allow_custom_amounts: linkData.allow_custom_amounts || false,
            min_amount: linkData.min_amount,
            max_amount: linkData.max_amount,
            usage_limit: linkData.usage_limit,
            metadata: linkData.metadata || {},
            created_at: now,
            updated_at: now,
            usage_count: 0
        };
        paymentLinks.set(paymentLinkId, paymentLink);
        logger_1.logger.info(`Payment link created: ${paymentLinkId} for merchant: ${merchantId}`);
        res.status(201).json(paymentLink);
    }
    catch (error) {
        logger_1.logger.error('Error creating payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const paymentLink = paymentLinks.get(id);
        if (!paymentLink) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (paymentLink.merchant_id !== merchantId) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        res.json(paymentLink);
    }
    catch (error) {
        logger_1.logger.error('Error fetching payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const updateData = req.body;
        const paymentLink = paymentLinks.get(id);
        if (!paymentLink) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (paymentLink.merchant_id !== merchantId) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (updateData.amount !== undefined && updateData.amount <= 0) {
            return res.status(400).json({
                error: 'Amount must be greater than 0'
            });
        }
        const updatedLink = {
            ...paymentLink,
            ...updateData,
            id,
            merchant_id: merchantId,
            updated_at: new Date(),
            expires_at: updateData.expires_at ? new Date(updateData.expires_at) : paymentLink.expires_at
        };
        paymentLinks.set(id, updatedLink);
        logger_1.logger.info(`Payment link updated: ${id}`);
        res.json(updatedLink);
    }
    catch (error) {
        logger_1.logger.error('Error updating payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', auth_1.authenticateJWT, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { id } = req.params;
        const paymentLink = paymentLinks.get(id);
        if (!paymentLink) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (paymentLink.merchant_id !== merchantId) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        paymentLinks.delete(id);
        logger_1.logger.info(`Payment link deleted: ${id}`);
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Error deleting payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/public/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const paymentLink = paymentLinks.get(id);
        if (!paymentLink) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (paymentLink.status !== 'active') {
            return res.status(404).json({ error: 'Payment link is not active' });
        }
        if (paymentLink.expires_at && paymentLink.expires_at < new Date()) {
            return res.status(404).json({ error: 'Payment link has expired' });
        }
        if (paymentLink.usage_limit && paymentLink.usage_count >= paymentLink.usage_limit) {
            return res.status(404).json({ error: 'Payment link usage limit exceeded' });
        }
        const publicData = {
            id: paymentLink.id,
            title: paymentLink.title,
            description: paymentLink.description,
            amount: paymentLink.amount,
            currency: paymentLink.currency,
            collect_shipping_address: paymentLink.collect_shipping_address,
            collect_phone_number: paymentLink.collect_phone_number,
            allow_custom_amounts: paymentLink.allow_custom_amounts,
            min_amount: paymentLink.min_amount,
            max_amount: paymentLink.max_amount
        };
        res.json(publicData);
    }
    catch (error) {
        logger_1.logger.error('Error fetching public payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/public/:id/pay', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, customer_info } = req.body;
        const paymentLink = paymentLinks.get(id);
        if (!paymentLink) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (paymentLink.status !== 'active') {
            return res.status(404).json({ error: 'Payment link is not active' });
        }
        if (paymentLink.expires_at && paymentLink.expires_at < new Date()) {
            return res.status(404).json({ error: 'Payment link has expired' });
        }
        if (paymentLink.usage_limit && paymentLink.usage_count >= paymentLink.usage_limit) {
            return res.status(404).json({ error: 'Payment link usage limit exceeded' });
        }
        let finalAmount = paymentLink.amount;
        let sbtcAmount = paymentLink.amount;
        let usdAmount = 0;
        if (paymentLink.allow_custom_amounts && amount) {
            if (paymentLink.min_amount && amount < paymentLink.min_amount) {
                return res.status(400).json({
                    error: `Amount must be at least ${(0, exchangeRate_1.formatCurrency)(paymentLink.min_amount, paymentLink.currency)}`
                });
            }
            if (paymentLink.max_amount && amount > paymentLink.max_amount) {
                return res.status(400).json({
                    error: `Amount cannot exceed ${(0, exchangeRate_1.formatCurrency)(paymentLink.max_amount, paymentLink.currency)}`
                });
            }
            finalAmount = amount;
        }
        if (paymentLink.currency === 'usd') {
            const conversion = await (0, exchangeRate_1.convertUsdToSbtc)(finalAmount);
            sbtcAmount = conversion.amount_sbtc;
            usdAmount = finalAmount;
        }
        else {
            const conversion = await (0, exchangeRate_1.convertSbtcToUsd)(finalAmount);
            sbtcAmount = finalAmount;
            usdAmount = conversion.amount_usd;
        }
        const paymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const paymentIntent = {
            id: paymentIntentId,
            client_secret: `${paymentIntentId}_secret_${Math.random().toString(36).substr(2, 9)}`,
            amount: sbtcAmount,
            amount_sbtc: sbtcAmount,
            amount_usd: usdAmount,
            currency: paymentLink.currency,
            display_currency: paymentLink.currency,
            description: `${paymentLink.title} - ${paymentLink.description}`,
            status: 'pending',
            payment_link_id: paymentLink.id,
            customer_info: customer_info || {},
            metadata: {
                ...paymentLink.metadata,
                payment_link_id: paymentLink.id,
                payment_link_title: paymentLink.title,
                original_amount: finalAmount,
                original_currency: paymentLink.currency
            },
            created: Math.floor(Date.now() / 1000)
        };
        paymentLink.usage_count += 1;
        paymentLinks.set(id, paymentLink);
        logger_1.logger.info(`Payment intent created from payment link: ${paymentIntentId} (link: ${id})`);
        res.status(201).json(paymentIntent);
    }
    catch (error) {
        logger_1.logger.error('Error creating payment intent from payment link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
