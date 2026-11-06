// 매매 규칙 최적화 — 장 마감 후 최근 몇 달 일봉으로 K·익절·손절 조합을 시험해 본다.
// 찾은 조합은 바로 쓰지 않고, 대표가 화면에서 "적용"을 눌러야 다음 매매부터 쓰인다.
// 과거에 잘 맞았다고 앞으로도 맞는다는 보장은 없다.
import { TRADING } from "../../company.config";
import type { BrokerKind, Candle } from "./brokers";
import { rsi } from "./strategy";

/** 최적화가 바꿀 수 있는 숫자는 이 셋뿐. 하루 손실 한도·금액 한도는 건드리지 않는다 */
export type Rules = { breakoutK: number; takeProfitPct: number; stopLossPct: number };

export type RuleScore = Rules & {
  trades: number;
  wins: number;
  /** 거래 1건 평균 수익률(%, 비용 뺀 값) */
  avgPct: number;
  /** 모든 거래 수익률 합(%) */
  totalPct: number;
  /** 앞쪽 절반 기간 / 뒤쪽 절반 기간 수익률 합 — 둘 다 플러스여야 추천 */
  firstHalfPct: number;
  secondHalfPct: number;
};

export type OptimizeResult = {
  day: string;
  kind: BrokerKind;
  from: string;
  to: string;
  stocks: number;
  current: RuleScore;
  top: RuleScore[];
  /** 추천 조합 — 지금 규칙보다 낫고 두 기간 모두 수익이었던 것. 없으면 지금 규칙 유지 */
  best: RuleScore | null;
};

const GRID = {
  breakoutK: [0.3, 0.4, 0.5, 0.6, 0.7],
  takeProfitPct: [1, 1.5, 2, 2.5, 3],
  stopLossPct: [1, 1.5, 2],
};
const MIN_TRADES = 15;

export const DEFAULT_RULES: Rules = {
  breakoutK: TRADING.breakoutK,
  takeProfitPct: TRADING.takeProfitPct,
  stopLossPct: TRADING.stopLossPct,
};

// ── 저장 (실제 증권사 모드만, 모의투자/실전 따로) ─────────────────
const rulesKey = (kind: BrokerKind) => `auto-trader:${kind}:rules`;
const resultKey = (kind: BrokerKind) => `auto-trader:${kind}:optimize`;
const listeners = new Set<() => void>();

export function subscribeOptimizer(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
  for (const listener of listeners) listener();
}

const inGrid = (value: unknown, allowed: number[]) => typeof value === "number" && allowed.includes(value);

/** 지금 쓰는 규칙 — 적용한 최적화 값이 있으면 그것, 없으면 company.config.ts 값 */
export function activeRules(kind: BrokerKind): Rules {
  if (kind === "sim") return DEFAULT_RULES;
  try {
    const saved = JSON.parse(read(rulesKey(kind)) || "null") as Rules | null;
    // 시험해 본 범위 밖의 값은 믿지 않는다
    if (
      saved &&
      inGrid(saved.breakoutK, GRID.breakoutK) &&
      inGrid(saved.takeProfitPct, GRID.takeProfitPct) &&
      inGrid(saved.stopLossPct, GRID.stopLossPct)
    ) {
      return { breakoutK: saved.breakoutK, takeProfitPct: saved.takeProfitPct, stopLossPct: saved.stopLossPct };
    }
  } catch {}
  return DEFAULT_RULES;
}

export function readRulesRaw(kind: BrokerKind) {
  return read(rulesKey(kind));
}

export function applyRules(kind: BrokerKind, rules: Rules) {
  write(rulesKey(kind), JSON.stringify({ breakoutK: rules.breakoutK, takeProfitPct: rules.takeProfitPct, stopLossPct: rules.stopLossPct }));
}

export function resetRules(kind: BrokerKind) {
  write(rulesKey(kind), null);
}

export function readResultRaw(kind: BrokerKind) {
  return read(resultKey(kind));
}

export function parseResult(raw: string): OptimizeResult | null {
  try {
    return raw ? (JSON.parse(raw) as OptimizeResult) : null;
  } catch {
    return null;
  }
}

// ── 시험 (일봉 기준 근사) ─────────────────────────────────────────
const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);

/**
 * 하루 = 일봉 1개. 실제 엔진과 같은 조건(상승 추세 + RSI 75 미만 + 돌파가 도달, 1.5% 넘게 갭 상승이면 추격 안 함)으로 산다.
 * 일봉엔 순서가 없어서 흔히 쓰는 가정을 쓴다: 양봉은 시가→저가→고가→종가, 음봉은 시가→고가→저가→종가.
 * 돌파 매수는 고가로 가는 길에 일어나므로, 산 뒤엔 고가(익절 확인) → 그 뒤 내려간 곳(손절 확인) → 종가 정리.
 */
export function backtest(histories: Candle[][], rules: Rules): RuleScore {
  const results: { day: string; pct: number }[] = [];
  for (const candles of histories) {
    for (let i = 20; i < candles.length; i++) {
      const today = candles[i];
      const prev = candles[i - 1];
      const closes = candles.slice(0, i).map((c) => c.close);
      if (avg(closes.slice(-5)) <= avg(closes.slice(-20)) || rsi(closes) >= 75) continue;
      const target = today.open + (prev.high - prev.low) * rules.breakoutK;
      if (today.high < target) continue;
      const entry = Math.max(today.open, target);
      if (entry > target * 1.015) continue;
      const stop = entry * (1 - rules.stopLossPct / 100);
      const take = entry * (1 + rules.takeProfitPct / 100);
      // 양봉의 저가는 사기 전에 지나갔고, 산 뒤 가장 낮은 곳은 종가. 음봉은 고가 뒤에 저가가 온다
      const lowAfterEntry = today.close >= today.open ? today.close : today.low;
      const exit = today.high >= take ? take : lowAfterEntry <= stop ? stop : today.close;
      results.push({ day: today.date, pct: (exit / entry - 1) * 100 - TRADING.costPct });
    }
  }
  const days = [...new Set(results.map((r) => r.day))].sort();
  const middle = days[Math.floor(days.length / 2)] ?? "";
  const sum = (list: typeof results) => list.reduce((total, r) => total + r.pct, 0);
  const totalPct = sum(results);
  return {
    ...rules,
    trades: results.length,
    wins: results.filter((r) => r.pct > 0).length,
    avgPct: results.length ? totalPct / results.length : 0,
    totalPct,
    firstHalfPct: sum(results.filter((r) => r.day < middle)),
    secondHalfPct: sum(results.filter((r) => r.day >= middle)),
  };
}

export function optimize(histories: Candle[][], current: Rules): { current: RuleScore; top: RuleScore[]; best: RuleScore | null } {
  const scores: RuleScore[] = [];
  for (const breakoutK of GRID.breakoutK) {
    for (const takeProfitPct of GRID.takeProfitPct) {
      for (const stopLossPct of GRID.stopLossPct) scores.push(backtest(histories, { breakoutK, takeProfitPct, stopLossPct }));
    }
  }
  const now = backtest(histories, current);
  const ranked = scores.filter((s) => s.trades >= MIN_TRADES).sort((a, b) => b.totalPct - a.totalPct);
  const same = (s: Rules) => s.breakoutK === current.breakoutK && s.takeProfitPct === current.takeProfitPct && s.stopLossPct === current.stopLossPct;
  const best = ranked.find((s) => s.firstHalfPct > 0 && s.secondHalfPct > 0 && s.totalPct > now.totalPct && !same(s)) ?? null;
  return { current: now, top: ranked.slice(0, 5), best };
}

// ── 실행 ─────────────────────────────────────────────────────────
function seoulDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replace(/-/g, "");
}

async function fetchChart(code: string, from: string, to: string): Promise<Candle[]> {
  const response = await fetch(`/api/trade/chart?code=${code}&from=${from}&to=${to}`);
  const json = (await response.json().catch(() => ({}))) as Candle[] | { error?: string };
  if (!response.ok || !Array.isArray(json)) throw new Error((json as { error?: string }).error ?? `HTTP ${response.status}`);
  return json;
}

let running: Promise<OptimizeResult> | null = null;

/** 감시 종목 일봉(최근 약 5달)을 받아서 조합을 시험하고 결과를 저장한다 */
export function runOptimization(kind: BrokerKind, onProgress?: (done: number, total: number) => void): Promise<OptimizeResult> {
  if (kind === "sim") return Promise.reject(new Error("연습 모드는 가짜 시장이라 최적화하지 않아요"));
  running ??= (async () => {
    const from = seoulDate(-160);
    const to = seoulDate();
    const histories: Candle[][] = [];
    let done = 0;
    for (const stock of TRADING.watchlist) {
      try {
        const candles = await fetchChart(stock.code, from, to);
        if (candles.length > 40) histories.push(candles);
      } catch {
        // 한 종목 실패는 건너뛴다
      }
      onProgress?.(++done, TRADING.watchlist.length);
    }
    if (histories.length < 5) throw new Error("일봉을 받아온 종목이 너무 적어요");
    const result: OptimizeResult = {
      day: to,
      kind,
      from: histories[0][0].date,
      to: histories[0][histories[0].length - 1].date,
      stocks: histories.length,
      ...optimize(histories, activeRules(kind)),
    };
    write(resultKey(kind), JSON.stringify(result));
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

export const describeRules = (r: Rules) => `K ${r.breakoutK} · 익절 +${r.takeProfitPct}% · 손절 -${r.stopLossPct}%`;
