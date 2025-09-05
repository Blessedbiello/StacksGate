"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentExchangeRate = getCurrentExchangeRate;
exports.convertSbtcToUsd = convertSbtcToUsd;
exports.convertUsdToSbtc = convertUsdToSbtc;
exports.formatCurrency = formatCurrency;
exports.isValidAmount = isValidAmount;
exports.getExchangeRateWithTrend = getExchangeRateWithTrend;
const logger_1 = require("@/utils/logger");
const redis_1 = require("@/utils/redis");
let memoryCache = {};
async function getFromCache(key) {
    try {
        const redisResult = await (0, redis_1.cacheGet)(key);
        if (redisResult)
            return redisResult;
    }
    catch (error) {
        logger_1.logger.debug('Redis cache miss, trying memory cache');
    }
    const cached = memoryCache[key];
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }
    return null;
}
async function setInCache(key, value, ttlSeconds) {
    try {
        await (0, redis_1.cacheSet)(key, value, ttlSeconds);
    }
    catch (error) {
        logger_1.logger.debug('Redis cache set failed, using memory cache');
    }
    memoryCache[key] = {
        data: value,
        expiry: Date.now() + (ttlSeconds * 1000)
    };
}
const EXCHANGE_RATE_SOURCES = [
    {
        name: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        parser: (data) => data.bitcoin.usd,
    },
    {
        name: 'CoinDesk',
        url: 'https://api.coindesk.com/v1/bpi/currentprice/USD.json',
        parser: (data) => parseFloat(data.bpi.USD.rate.replace(/,/g, '')),
    },
    {
        name: 'Binance',
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        parser: (data) => parseFloat(data.price),
    }
];
async function fetchExchangeRateFromSource(source) {
    try {
        logger_1.logger.debug(`Fetching BTC/USD rate from ${source.name}`);
        const response = await fetch(source.url, {
            method: 'GET',
            headers: {
                'User-Agent': 'StacksGate-Payment-Gateway/1.0',
            },
            timeout: 5000,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        const rate = source.parser(data);
        if (!rate || isNaN(rate) || rate <= 0) {
            throw new Error('Invalid exchange rate received');
        }
        logger_1.logger.info(`Successfully fetched BTC/USD rate from ${source.name}: $${rate}`);
        return rate;
    }
    catch (error) {
        logger_1.logger.warn(`Failed to fetch exchange rate from ${source.name}:`, error.message);
        return null;
    }
}
async function getCurrentExchangeRate() {
    const cacheKey = 'btc_usd_exchange_rate';
    const cached = await getFromCache(cacheKey);
    if (cached) {
        logger_1.logger.debug('Using cached exchange rate:', cached.btc_usd);
        return cached;
    }
    let rate = null;
    let successSource = '';
    for (const source of EXCHANGE_RATE_SOURCES) {
        rate = await fetchExchangeRateFromSource(source);
        if (rate) {
            successSource = source.name;
            break;
        }
    }
    if (!rate) {
        const fallbackRate = 43000;
        logger_1.logger.error('All exchange rate sources failed, using fallback rate:', fallbackRate);
        const fallbackData = {
            btc_usd: fallbackRate,
            last_updated: new Date().toISOString(),
            source: 'fallback',
        };
        return fallbackData;
    }
    const exchangeRateData = {
        btc_usd: rate,
        last_updated: new Date().toISOString(),
        source: successSource,
    };
    await setInCache(cacheKey, exchangeRateData, 300);
    return exchangeRateData;
}
async function convertSbtcToUsd(sbtcAmount) {
    const exchangeRate = await getCurrentExchangeRate();
    const usdAmount = sbtcAmount * exchangeRate.btc_usd;
    const result = {
        amount_sbtc: sbtcAmount,
        amount_usd: Math.round(usdAmount * 100) / 100,
        exchange_rate: exchangeRate.btc_usd,
        timestamp: new Date().toISOString(),
    };
    logger_1.logger.debug('sBTC to USD conversion:', result);
    return result;
}
async function convertUsdToSbtc(usdAmount) {
    const exchangeRate = await getCurrentExchangeRate();
    const sbtcAmount = usdAmount / exchangeRate.btc_usd;
    const result = {
        amount_sbtc: Math.round(sbtcAmount * 100000000) / 100000000,
        amount_usd: usdAmount,
        exchange_rate: exchangeRate.btc_usd,
        timestamp: new Date().toISOString(),
    };
    logger_1.logger.debug('USD to sBTC conversion:', result);
    return result;
}
function formatCurrency(amount, currency) {
    if (currency === 'usd') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    }
    else {
        return `${amount.toFixed(8)} sBTC`;
    }
}
function isValidAmount(amount, currency) {
    if (isNaN(amount) || amount <= 0) {
        return false;
    }
    if (currency === 'usd') {
        return amount >= 0.01 && amount <= 1000000;
    }
    else {
        return amount >= 0.00000001 && amount <= 1000;
    }
}
async function getExchangeRateWithTrend() {
    const current = await getCurrentExchangeRate();
    const previousCacheKey = 'btc_usd_previous_rate';
    const previous = await getFromCache(previousCacheKey);
    let trend = 'stable';
    if (previous) {
        const changePercent = ((current.btc_usd - previous) / previous) * 100;
        if (changePercent > 0.1)
            trend = 'up';
        else if (changePercent < -0.1)
            trend = 'down';
    }
    await setInCache(previousCacheKey, current.btc_usd, 3600);
    return { ...current, trend };
}
