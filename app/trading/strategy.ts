// 종목 분석 — 추세(이동평균) + 과열 여부(RSI) + 변동성 돌파 가격으로 점수를 매긴다
import type { Candle, Quote } from "./brokers";

export type Signal = {
  code: string;
  name: string;
  price: number;
  /** 오늘 이 가격을 넘으면 산다 (시가 + 전일 변동폭 × K) */
  target: number;
  ma5: number;
  ma20: number;
  rsi: number;
  score: number;
  decision: "매수" | "관심" | "제외";
  reasons: string[];
};

const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);

function rsi(closes: number[], period = 14) {
  if (closes.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** history = 어제까지 끝난 일봉 (오래된 → 최근), quote = 지금 시세 */
export function analyze(
  stock: { code: string; name: string },
  history: Candle[],
  quote: Quote,
  k: number,
): Signal {
  const closes = history.map((c) => c.close);
  const prev = history[history.length - 1];
  const ma5 = avg(closes.slice(-5));
  const ma20 = avg(closes.slice(-20));
  const r = rsi(closes);
  const range = prev ? prev.high - prev.low : 0;
  const base = quote.open > 0 ? quote.open : (prev?.close ?? quote.price);
  const target = Math.round(base + range * k);
  const price = quote.price;

  let score = 0;
  const reasons: string[] = [];
  const uptrend = ma5 > ma20;

  if (uptrend) {
    score += 25;
    reasons.push("5일선이 20일선 위 (상승 추세)");
  } else reasons.push("5일선이 20일선 아래 (하락 추세)");
  if (prev && prev.close > ma20) score += 15;

  if (r >= 45 && r <= 68) {
    score += 20;
    reasons.push(`RSI ${r.toFixed(0)} — 적당한 힘`);
  } else if (r > 75) {
    score -= 15;
    reasons.push(`RSI ${r.toFixed(0)} — 과열`);
  } else if (r < 30) {
    score -= 10;
    reasons.push(`RSI ${r.toFixed(0)} — 너무 약함`);
  }

  if (price >= target) {
    score += 30;
    reasons.push("돌파 가격 넘음");
  } else if (price >= target * 0.99) {
    score += 10;
    reasons.push("돌파 가격 근접");
  }

  const chasing = price > target * 1.015;
  if (chasing) {
    score -= 20;
    reasons.push("이미 많이 올라 추격 금지");
  }
  if (prev && range / prev.close < 0.01) {
    score -= 10;
    reasons.push("움직임이 너무 작음");
  }

  score = Math.max(0, Math.min(100, score));
  const decision: Signal["decision"] =
    uptrend && price >= target && !chasing && r < 75 ? "매수" : uptrend && score >= 40 ? "관심" : "제외";

  return { code: stock.code, name: stock.name, price, target, ma5, ma20, rsi: r, score, decision, reasons };
}
