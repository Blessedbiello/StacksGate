"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exchangeRate_1 = require("@/services/exchangeRate");
const logger_1 = require("@/utils/logger");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const exchangeRate = await (0, exchangeRate_1.getExchangeRateWithTrend)();
        res.json({
            success: true,
            data: {
                rate: exchangeRate.btc_usd,
                formatted: (0, exchangeRate_1.formatCurrency)(exchangeRate.btc_usd, 'usd'),
                last_updated: exchangeRate.last_updated,
                source: exchangeRate.source,
                trend: exchangeRate.trend || 'stable',
            },
            meta: {
                cache_duration: '5 minutes',
                note: 'sBTC is pegged 1:1 with BTC',
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Exchange rate fetch error:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'api_error',
                message: 'Failed to fetch exchange rate',
            },
        });
    }
});
router.post('/convert', async (req, res) => {
    try {
        const { amount, from_currency, to_currency } = req.body;
        if (!amount || !from_currency || !to_currency) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'Missing required fields: amount, from_currency, to_currency',
                },
            });
        }
        if (!['sbtc', 'usd'].includes(from_currency) || !['sbtc', 'usd'].includes(to_currency)) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'Invalid currency. Supported currencies: sbtc, usd',
                },
            });
        }
        if (from_currency === to_currency) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'from_currency and to_currency cannot be the same',
                },
            });
        }
        const numAmount = parseFloat(amount);
        if (!(0, exchangeRate_1.isValidAmount)(numAmount, from_currency)) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: `Invalid amount for ${from_currency}. Must be positive and within acceptable limits.`,
                },
            });
        }
        let conversion;
        if (from_currency === 'sbtc' && to_currency === 'usd') {
            conversion = await (0, exchangeRate_1.convertSbtcToUsd)(numAmount);
        }
        else {
            conversion = await (0, exchangeRate_1.convertUsdToSbtc)(numAmount);
        }
        res.json({
            success: true,
            data: {
                original_amount: conversion[`amount_${from_currency}`],
                converted_amount: conversion[`amount_${to_currency}`],
                exchange_rate: conversion.exchange_rate,
                from_currency,
                to_currency,
                formatted: {
                    original: (0, exchangeRate_1.formatCurrency)(conversion[`amount_${from_currency}`], from_currency),
                    converted: (0, exchangeRate_1.formatCurrency)(conversion[`amount_${to_currency}`], to_currency),
                },
                timestamp: conversion.timestamp,
            },
            meta: {
                note: 'sBTC is pegged 1:1 with BTC',
                rate_source: (await (0, exchangeRate_1.getCurrentExchangeRate)()).source,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Currency conversion error:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'api_error',
                message: 'Failed to convert currency',
            },
        });
    }
});
router.get('/convert/sbtc/:amount', async (req, res) => {
    try {
        const amount = parseFloat(req.params.amount);
        if (!(0, exchangeRate_1.isValidAmount)(amount, 'sbtc')) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'Invalid sBTC amount',
                },
            });
        }
        const conversion = await (0, exchangeRate_1.convertSbtcToUsd)(amount);
        res.json({
            success: true,
            data: {
                sbtc_amount: conversion.amount_sbtc,
                usd_amount: conversion.amount_usd,
                exchange_rate: conversion.exchange_rate,
                formatted: {
                    sbtc: (0, exchangeRate_1.formatCurrency)(conversion.amount_sbtc, 'sbtc'),
                    usd: (0, exchangeRate_1.formatCurrency)(conversion.amount_usd, 'usd'),
                },
                timestamp: conversion.timestamp,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('sBTC conversion error:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'api_error',
                message: 'Failed to convert sBTC to USD',
            },
        });
    }
});
router.get('/convert/usd/:amount', async (req, res) => {
    try {
        const amount = parseFloat(req.params.amount);
        if (!(0, exchangeRate_1.isValidAmount)(amount, 'usd')) {
            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'Invalid USD amount',
                },
            });
        }
        const conversion = await (0, exchangeRate_1.convertUsdToSbtc)(amount);
        res.json({
            success: true,
            data: {
                usd_amount: conversion.amount_usd,
                sbtc_amount: conversion.amount_sbtc,
                exchange_rate: conversion.exchange_rate,
                formatted: {
                    usd: (0, exchangeRate_1.formatCurrency)(conversion.amount_usd, 'usd'),
                    sbtc: (0, exchangeRate_1.formatCurrency)(conversion.amount_sbtc, 'sbtc'),
                },
                timestamp: conversion.timestamp,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('USD conversion error:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'api_error',
                message: 'Failed to convert USD to sBTC',
            },
        });
    }
});
exports.default = router;
