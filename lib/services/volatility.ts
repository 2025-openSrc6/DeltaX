interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function calculateStdDev(prices: number[]): number {
  if (prices.length < 2) return 0;

  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;

  return Math.sqrt(variance);
}

export function calculateVolatilityChangeRate(current: number, average: number): number {
  if (average === 0) return 0;
  return current / average;
}

export function calculateVolatilityScore(changeRate: number): number {
  // 0.5 ~ 2.0 범위를 0 ~ 100으로 정규화
  const normalized = ((changeRate - 0.5) / 1.5) * 100;
  return Math.max(0, Math.min(100, normalized));
}

export function calculateMovementIntensity(data: OHLCData): number {
  return ((data.high - data.low) / data.close) * 100;
}

export function calculateTrendStrength(data: OHLCData): number {
  const range = data.high - data.low;
  if (range === 0) return 0;
  return (Math.abs(data.close - data.open) / range) * 100;
}

export function calculateRelativePosition(data: OHLCData): number {
  const range = data.high - data.low;
  if (range === 0) return 50;
  return ((data.close - data.low) / range) * 100;
}

export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  const changes = prices.slice(1).map((price, i) => price - prices[i]);
  const recentChanges = changes.slice(-period);

  const gains = recentChanges.filter((c) => c > 0);
  const losses = recentChanges.filter((c) => c < 0).map((c) => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateATR(data: OHLCData[], period: number = 14): number {
  if (data.length < period + 1) return 0;

  const trueRanges = data.slice(1).map((item, index) => {
    const prevClose = data[index].close;
    return Math.max(
      item.high - item.low,
      Math.abs(item.high - prevClose),
      Math.abs(item.low - prevClose),
    );
  });

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  multiplier: number = 2,
): { upper: number; middle: number; lower: number; bandwidth: number } {
  if (prices.length < period) {
    const lastPrice = prices[prices.length - 1] || 0;
    return { upper: lastPrice, middle: lastPrice, lower: lastPrice, bandwidth: 0 };
  }

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((sum, p) => sum + p, 0) / period;
  const stdDev = calculateStdDev(recentPrices);

  const upper = sma + multiplier * stdDev;
  const lower = sma - multiplier * stdDev;
  const bandwidth = sma > 0 ? ((upper - lower) / sma) * 100 : 0;

  return { upper, middle: sma, lower, bandwidth };
}

export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  // signalPeriod: number = 9,
): { macd: number; signal: number; histogram: number } {
  if (prices.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  const macdLine = fastEMA - slowEMA;

  // 단순화: signal은 macdLine 자체로 사용
  const signal = macdLine * 0.8;
  const histogram = macdLine - signal;

  return { macd: macdLine, signal, histogram };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;

  const multiplier = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * 두 자산의 변동성 대비 수익률을 비교합니다
 *
 * @param prices1 - 첫 번째 자산의 가격 배열
 * @param prices2 - 두 번째 자산의 가격 배열
 * @returns 비교 결과 (volatility, return, adjustedReturn, winner, confidence 등)
 */
export function compareVolatilityAdjustedReturns(
  prices1: number[],
  prices2: number[],
): {
  asset1: {
    volatility: number;
    return: number;
    adjustedReturn: number;
  };
  asset2: {
    volatility: number;
    return: number;
    adjustedReturn: number;
  };
  winner: 'asset1' | 'asset2' | 'tie';
  confidence: number;
  difference: number;
} {
  // 변동성 계산 (표준편차)
  const volatility1 = calculateStdDev(prices1);
  const volatility2 = calculateStdDev(prices2);

  // 수익률 계산 (%)
  const return1 =
    prices1.length > 0 ? ((prices1[prices1.length - 1] - prices1[0]) / prices1[0]) * 100 : 0;
  const return2 =
    prices2.length > 0 ? ((prices2[prices2.length - 1] - prices2[0]) / prices2[0]) * 100 : 0;

  // 변동성 대비 수익률 (Sharpe Ratio와 유사)
  const adjustedReturn1 = volatility1 !== 0 ? return1 / volatility1 : 0;
  const adjustedReturn2 = volatility2 !== 0 ? return2 / volatility2 : 0;

  // 차이
  const difference = Math.abs(adjustedReturn1 - adjustedReturn2);

  // 승자 판단
  let winner: 'asset1' | 'asset2' | 'tie';
  if (Math.abs(adjustedReturn1 - adjustedReturn2) < 0.01) {
    winner = 'tie';
  } else {
    winner = adjustedReturn1 > adjustedReturn2 ? 'asset1' : 'asset2';
  }

  // 신뢰도 (차이가 클수록 높음, 0-1 범위)
  const confidence = Math.min(difference / 10, 1);

  return {
    asset1: {
      volatility: volatility1,
      return: return1,
      adjustedReturn: adjustedReturn1,
    },
    asset2: {
      volatility: volatility2,
      return: return2,
      adjustedReturn: adjustedReturn2,
    },
    winner,
    confidence,
    difference,
  };
}
