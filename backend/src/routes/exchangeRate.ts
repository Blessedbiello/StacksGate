import { Router, Request, Response } from 'express';
import {
  getCurrentExchangeRate,
  convertSbtcToUsd,
  convertUsdToSbtc,
  getExchangeRateWithTrend,
  formatCurrency,
  isValidAmount
} from '@/services/exchangeRate';
import { logger } from '@/utils/logger';

const router = Router();

// GET /api/v1/exchange-rate - Get current BTC/USD exchange rate
router.get('/', async (req: Request, res: Response) => {
  try {
    const exchangeRate = await getExchangeRateWithTrend();
    
    res.json({
      success: true,
      data: {
        rate: exchangeRate.btc_usd,
        formatted: formatCurrency(exchangeRate.btc_usd, 'usd'),
        last_updated: exchangeRate.last_updated,
        source: exchangeRate.source,
        trend: exchangeRate.trend || 'stable',
      },
      meta: {
        cache_duration: '5 minutes',
        note: 'sBTC is pegged 1:1 with BTC',
      }
    });
  } catch (error) {
    logger.error('Exchange rate fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        type: 'api_error',
        message: 'Failed to fetch exchange rate',
      },
    });
  }
});

// POST /api/v1/exchange-rate/convert - Convert between sBTC and USD
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { amount, from_currency, to_currency } = req.body;

    // Validation
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
    if (!isValidAmount(numAmount, from_currency)) {
      return res.status(400).json({
        success: false,
        error: {
          type: 'validation_error',
          message: `Invalid amount for ${from_currency}. Must be positive and within acceptable limits.`,
        },
      });
    }

    // Perform conversion
    let conversion;
    if (from_currency === 'sbtc' && to_currency === 'usd') {
      conversion = await convertSbtcToUsd(numAmount);
    } else {
      conversion = await convertUsdToSbtc(numAmount);
    }

    res.json({
      success: true,
      data: {
        original_amount: conversion[`amount_${from_currency}` as keyof typeof conversion],
        converted_amount: conversion[`amount_${to_currency}` as keyof typeof conversion],
        exchange_rate: conversion.exchange_rate,
        from_currency,
        to_currency,
        formatted: {
          original: formatCurrency(conversion[`amount_${from_currency}` as keyof typeof conversion] as number, from_currency),
          converted: formatCurrency(conversion[`amount_${to_currency}` as keyof typeof conversion] as number, to_currency),
        },
        timestamp: conversion.timestamp,
      },
      meta: {
        note: 'sBTC is pegged 1:1 with BTC',
        rate_source: (await getCurrentExchangeRate()).source,
      }
    });

  } catch (error) {
    logger.error('Currency conversion error:', error);
    res.status(500).json({
      success: false,
      error: {
        type: 'api_error',
        message: 'Failed to convert currency',
      },
    });
  }
});

// GET /api/v1/exchange-rate/convert/sbtc/:amount - Quick sBTC to USD conversion
router.get('/convert/sbtc/:amount', async (req: Request, res: Response) => {
  try {
    const amount = parseFloat(req.params.amount);
    
    if (!isValidAmount(amount, 'sbtc')) {
      return res.status(400).json({
        success: false,
        error: {
          type: 'validation_error',
          message: 'Invalid sBTC amount',
        },
      });
    }

    const conversion = await convertSbtcToUsd(amount);
    
    res.json({
      success: true,
      data: {
        sbtc_amount: conversion.amount_sbtc,
        usd_amount: conversion.amount_usd,
        exchange_rate: conversion.exchange_rate,
        formatted: {
          sbtc: formatCurrency(conversion.amount_sbtc, 'sbtc'),
          usd: formatCurrency(conversion.amount_usd, 'usd'),
        },
        timestamp: conversion.timestamp,
      }
    });

  } catch (error) {
    logger.error('sBTC conversion error:', error);
    res.status(500).json({
      success: false,
      error: {
        type: 'api_error',
        message: 'Failed to convert sBTC to USD',
      },
    });
  }
});

// GET /api/v1/exchange-rate/convert/usd/:amount - Quick USD to sBTC conversion  
router.get('/convert/usd/:amount', async (req: Request, res: Response) => {
  try {
    const amount = parseFloat(req.params.amount);
    
    if (!isValidAmount(amount, 'usd')) {
      return res.status(400).json({
        success: false,
        error: {
          type: 'validation_error',
          message: 'Invalid USD amount',
        },
      });
    }

    const conversion = await convertUsdToSbtc(amount);
    
    res.json({
      success: true,
      data: {
        usd_amount: conversion.amount_usd,
        sbtc_amount: conversion.amount_sbtc,
        exchange_rate: conversion.exchange_rate,
        formatted: {
          usd: formatCurrency(conversion.amount_usd, 'usd'),
          sbtc: formatCurrency(conversion.amount_sbtc, 'sbtc'),
        },
        timestamp: conversion.timestamp,
      }
    });

  } catch (error) {
    logger.error('USD conversion error:', error);
    res.status(500).json({
      success: false,
      error: {
        type: 'api_error',
        message: 'Failed to convert USD to sBTC',
      },
    });
  }
});

export default router;