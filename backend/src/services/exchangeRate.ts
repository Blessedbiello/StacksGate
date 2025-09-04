import { logger } from '@/utils/logger';
import { cacheGet, cacheSet } from '@/utils/redis';

export interface ExchangeRate {
  btc_usd: number;
  last_updated: string;
  source: string;
}

export interface ConversionResult {
  amount_sbtc: number;
  amount_usd: number;
  exchange_rate: number;
  timestamp: string;
}

// In-memory fallback when Redis is not available
let memoryCache: { [key: string]: { data: any; expiry: number } } = {};

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    // Try Redis first
    const redisResult = await cacheGet<T>(key);
    if (redisResult) return redisResult;
  } catch (error) {
    logger.debug('Redis cache miss, trying memory cache');
  }

  // Fallback to memory cache
  const cached = memoryCache[key];
  if (cached && Date.now() < cached.expiry) {
    return cached.data as T;
  }
  
  return null;
}

async function setInCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    // Try Redis first
    await cacheSet(key, value, ttlSeconds);
  } catch (error) {
    logger.debug('Redis cache set failed, using memory cache');
  }

  // Always set in memory cache as fallback
  memoryCache[key] = {
    data: value,
    expiry: Date.now() + (ttlSeconds * 1000)
  };
}

// Multiple exchange rate sources for redundancy
const EXCHANGE_RATE_SOURCES = [
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    parser: (data: any) => data.bitcoin.usd,
  },
  {
    name: 'CoinDesk',
    url: 'https://api.coindesk.com/v1/bpi/currentprice/USD.json',
    parser: (data: any) => parseFloat(data.bpi.USD.rate.replace(/,/g, '')),
  },
  {
    name: 'Binance',
    url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    parser: (data: any) => parseFloat(data.price),
  }
];

async function fetchExchangeRateFromSource(source: typeof EXCHANGE_RATE_SOURCES[0]): Promise<number | null> {
  try {
    logger.debug(`Fetching BTC/USD rate from ${source.name}`);
    
    const response = await fetch(source.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'StacksGate-Payment-Gateway/1.0',
      },
      timeout: 5000, // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rate = source.parser(data);

    if (!rate || isNaN(rate) || rate <= 0) {
      throw new Error('Invalid exchange rate received');
    }

    logger.info(`Successfully fetched BTC/USD rate from ${source.name}: $${rate}`);
    return rate;
  } catch (error) {
    logger.warn(`Failed to fetch exchange rate from ${source.name}:`, (error as Error).message);
    return null;
  }
}

export async function getCurrentExchangeRate(): Promise<ExchangeRate> {
  const cacheKey = 'btc_usd_exchange_rate';
  
  // Try to get from cache first (5 minute cache)
  const cached = await getFromCache<ExchangeRate>(cacheKey);
  if (cached) {
    logger.debug('Using cached exchange rate:', cached.btc_usd);
    return cached;
  }

  // Try each source until we get a valid rate
  let rate: number | null = null;
  let successSource = '';

  for (const source of EXCHANGE_RATE_SOURCES) {
    rate = await fetchExchangeRateFromSource(source);
    if (rate) {
      successSource = source.name;
      break;
    }
  }

  if (!rate) {
    // Fallback to a reasonable default if all sources fail
    const fallbackRate = 43000; // Approximate BTC price as fallback
    logger.error('All exchange rate sources failed, using fallback rate:', fallbackRate);
    
    const fallbackData: ExchangeRate = {
      btc_usd: fallbackRate,
      last_updated: new Date().toISOString(),
      source: 'fallback',
    };
    
    return fallbackData;
  }

  const exchangeRateData: ExchangeRate = {
    btc_usd: rate,
    last_updated: new Date().toISOString(),
    source: successSource,
  };

  // Cache for 5 minutes
  await setInCache(cacheKey, exchangeRateData, 300);
  
  return exchangeRateData;
}

export async function convertSbtcToUsd(sbtcAmount: number): Promise<ConversionResult> {
  const exchangeRate = await getCurrentExchangeRate();
  
  // sBTC is pegged 1:1 with BTC
  const usdAmount = sbtcAmount * exchangeRate.btc_usd;
  
  const result: ConversionResult = {
    amount_sbtc: sbtcAmount,
    amount_usd: Math.round(usdAmount * 100) / 100, // Round to 2 decimal places
    exchange_rate: exchangeRate.btc_usd,
    timestamp: new Date().toISOString(),
  };

  logger.debug('sBTC to USD conversion:', result);
  return result;
}

export async function convertUsdToSbtc(usdAmount: number): Promise<ConversionResult> {
  const exchangeRate = await getCurrentExchangeRate();
  
  // sBTC is pegged 1:1 with BTC
  const sbtcAmount = usdAmount / exchangeRate.btc_usd;
  
  const result: ConversionResult = {
    amount_sbtc: Math.round(sbtcAmount * 100000000) / 100000000, // Round to 8 decimal places (satoshis)
    amount_usd: usdAmount,
    exchange_rate: exchangeRate.btc_usd,
    timestamp: new Date().toISOString(),
  };

  logger.debug('USD to sBTC conversion:', result);
  return result;
}

// Utility function to format currency amounts
export function formatCurrency(amount: number, currency: 'sbtc' | 'usd'): string {
  if (currency === 'usd') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  } else {
    return `${amount.toFixed(8)} sBTC`;
  }
}

// Validation helper
export function isValidAmount(amount: number, currency: 'sbtc' | 'usd'): boolean {
  if (isNaN(amount) || amount <= 0) {
    return false;
  }

  if (currency === 'usd') {
    // USD: minimum $0.01, maximum $1,000,000
    return amount >= 0.01 && amount <= 1000000;
  } else {
    // sBTC: minimum 0.00000001 (1 satoshi), maximum 1000 sBTC
    return amount >= 0.00000001 && amount <= 1000;
  }
}

// Price change tracking (for displaying trends)
export async function getExchangeRateWithTrend(): Promise<ExchangeRate & { trend?: 'up' | 'down' | 'stable' }> {
  const current = await getCurrentExchangeRate();
  const previousCacheKey = 'btc_usd_previous_rate';
  
  const previous = await getFromCache<number>(previousCacheKey);
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (previous) {
    const changePercent = ((current.btc_usd - previous) / previous) * 100;
    if (changePercent > 0.1) trend = 'up';
    else if (changePercent < -0.1) trend = 'down';
  }
  
  // Store current rate as previous for next comparison
  await setInCache(previousCacheKey, current.btc_usd, 3600); // 1 hour cache
  
  return { ...current, trend };
}