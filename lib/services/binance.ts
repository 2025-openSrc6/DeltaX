import { z } from 'zod';

const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

// 재시도 설정
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// 요청 속도 제한 추적
class RateLimitTracker {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly windowMs = 60000; // 1분
  private readonly maxRequests = 1200; // Binance 제한

  async checkAndWait(): Promise<void> {
    const now = Date.now();

    // 만료된 경우 윈도우 리셋
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // 제한에 도달한 경우 윈도우가 리셋될 때까지 대기
    if (this.requestCount >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.windowStart);
      console.warn(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      windowStart: this.windowStart,
      remainingRequests: this.maxRequests - this.requestCount,
    };
  }
}

const rateLimitTracker = new RateLimitTracker();

// 지수 백오프 재시도 유틸리티
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = RETRY_CONFIG.maxRetries,
  delay: number = RETRY_CONFIG.initialDelayMs,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    // 재시도 가능한 에러인지 확인 (네트워크 에러, 5xx, 429)
    const isRetryable =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('429') ||
        error.message.includes('5'));

    if (!isRetryable) {
      throw error;
    }

    console.warn(
      `Retrying after ${delay}ms... (${RETRY_CONFIG.maxRetries - retries + 1}/${RETRY_CONFIG.maxRetries})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    const nextDelay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);

    return retryWithBackoff(fn, retries - 1, nextDelay);
  }
}

const SYMBOL_MAP = {
  PAXG: 'PAXGUSDT',
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
} as const;

type SupportedAsset = keyof typeof SYMBOL_MAP;

// 런타임 검증용 Zod 스키마
const BinanceKlineRawSchema = z.tuple([
  z.number(), // 시작 시간
  z.string(), // 시가
  z.string(), // 고가
  z.string(), // 저가
  z.string(), // 종가
  z.string(), // 거래량
  z.number(), // 종료 시간
  z.string(), // 견적 자산 거래량
  z.number(), // 거래 횟수
  z.string(), // 테이커 매수 기본 자산 거래량
  z.string(), // 테이커 매수 견적 자산 거래량
  z.string(), // 무시
]);

const BinanceKlineArraySchema = z.array(BinanceKlineRawSchema);

const BinanceTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChangePercent: z.string(),
  volume: z.string(),
});

// ticker/price 엔드포인트용 경량 가격 스키마
const BinancePriceSchema = z.object({
  symbol: z.string(),
  price: z.string(),
});

interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface BinanceTicker {
  symbol: string;
  price: string;
  priceChangePercent: string;
  volume: string;
}

// 정산 메타데이터 지원용 타입
export type BinanceKlineWithMeta = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  numberOfTrades: number;
};

export type KlinesMeta = {
  exchange: 'binance';
  endpoint: '/api/v3/klines';
  symbol: string;
  asset: 'PAXG' | 'BTC' | 'ETH' | 'SOL';
  interval: '1m' | '1h';
  limit: number;
  firstOpenTimeMs: number;
  lastCloseTimeMs: number;
  requestedAtMs?: number;
};

export async function fetchKlines(
  asset: SupportedAsset,
  interval: string = '1m',
  limit: number = 100,
): Promise<BinanceKline[]> {
  // 요청 전 속도 제한 확인
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const url = `${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const response = await fetch(url);

    // 서버로부터의 속도 제한 응답 처리
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();

    // Zod로 응답 데이터 검증
    const validatedData = BinanceKlineArraySchema.parse(data);

    return validatedData.map((kline) => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
    }));
  });
}

export async function fetchCurrentPrice(asset: SupportedAsset): Promise<BinanceTicker> {
  // 요청 전 속도 제한 확인
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const url = `${BINANCE_BASE_URL}/ticker/24hr?symbol=${symbol}`;

    const response = await fetch(url);

    // 서버로부터의 속도 제한 응답 처리
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();

    // Zod로 응답 데이터 검증
    const validatedData = BinanceTickerSchema.parse(data);

    return {
      symbol: validatedData.symbol,
      price: validatedData.lastPrice,
      priceChangePercent: validatedData.priceChangePercent,
      volume: validatedData.volume,
    };
  });
}

export async function fetchMultipleKlines(
  assets: SupportedAsset[],
  interval: string = '1m',
  limit: number = 100,
): Promise<Map<SupportedAsset, BinanceKline[]>> {
  const results = new Map<SupportedAsset, BinanceKline[]>();

  const promises = assets.map(async (asset) => {
    const klines = await fetchKlines(asset, interval, limit);
    results.set(asset, klines);
  });

  await Promise.all(promises);
  return results;
}

// 모니터링용 속도 제한 통계 내보내기
export function getRateLimitStats() {
  return rateLimitTracker.getStats();
}

/**
 * 5초 폴링용 경량 가격 조회 (차트 UX)
 * 무거운 ticker/24hr 대신 ticker/price 엔드포인트 사용
 */
export async function fetchTickPrice(
  asset: SupportedAsset,
): Promise<{ price: number; timestamp: Date }> {
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const url = `${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`;

    const response = await fetch(url);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    const validatedData = BinancePriceSchema.parse(data);

    return {
      price: parseFloat(validatedData.price),
      timestamp: new Date(),
    };
  });
}

/**
 * 정산 온체인 검증용 메타데이터 포함 klines 조회
 * 캔들 + 메타데이터(거래소, 심볼, 인터벌, 시간 범위 등) 반환
 */
export async function fetchKlinesWithMeta(
  asset: SupportedAsset,
  interval: '1m' | '1h',
  limit: number,
): Promise<{ candles: BinanceKlineWithMeta[]; meta: KlinesMeta }> {
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const requestedAtMs = Date.now();
    const url = `${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const response = await fetch(url);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    const validatedData = BinanceKlineArraySchema.parse(data);

    const candles: BinanceKlineWithMeta[] = validatedData.map((kline) => ({
      openTimeMs: kline[0],
      closeTimeMs: kline[6],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      numberOfTrades: kline[8],
    }));

    const meta: KlinesMeta = {
      exchange: 'binance',
      endpoint: '/api/v3/klines',
      symbol,
      asset,
      interval,
      limit,
      firstOpenTimeMs: candles[0]?.openTimeMs || 0,
      lastCloseTimeMs: candles[candles.length - 1]?.closeTimeMs || 0,
      requestedAtMs,
    };

    return { candles, meta };
  });
}

/**
 * 라운드 시작/종료 가격 스냅샷용 1분 캔들 조회
 * 종가 + 온체인 Settlement용 메타데이터 반환
 */
export async function fetchRoundSnapshotKline1m(asset: SupportedAsset): Promise<{
  close: number;
  closeTimeMs: number;
  onchainMeta: {
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1m';
    limit: 1;
    candleOpenTimeMs: number;
    candleCloseTimeMs: number;
  };
}> {
  const { candles, meta } = await fetchKlinesWithMeta(asset, '1m', 1);

  if (candles.length === 0) {
    throw new Error(`No kline data returned for ${asset}`);
  }

  const latestCandle = candles[0];

  return {
    close: latestCandle.close,
    closeTimeMs: latestCandle.closeTimeMs,
    onchainMeta: {
      exchange: meta.exchange,
      endpoint: meta.endpoint,
      symbol: meta.symbol,
      interval: '1m',
      limit: 1,
      candleOpenTimeMs: latestCandle.openTimeMs,
      candleCloseTimeMs: latestCandle.closeTimeMs,
    },
  };
}

/**
 * avgVol 계산용 1시간 캔들 720개(30일) 조회
 * 종가 배열 + 온체인 검증용 메타데이터 반환
 */
export async function fetchAvgVolKlines1h720(asset: SupportedAsset): Promise<{
  closes: number[];
  onchainMeta: {
    exchange: 'binance';
    endpoint: '/api/v3/klines';
    symbol: string;
    interval: '1h';
    limit: 720;
    firstOpenTimeMs: number;
    lastCloseTimeMs: number;
  };
}> {
  const { candles, meta } = await fetchKlinesWithMeta(asset, '1h', 720);

  return {
    closes: candles.map((c) => c.close),
    onchainMeta: {
      exchange: meta.exchange,
      endpoint: meta.endpoint,
      symbol: meta.symbol,
      interval: '1h',
      limit: 720,
      firstOpenTimeMs: meta.firstOpenTimeMs,
      lastCloseTimeMs: meta.lastCloseTimeMs,
    },
  };
}

export { type SupportedAsset, type BinanceKline, type BinanceTicker };
