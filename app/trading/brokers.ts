// 증권사 연결 — 연습 모드(가짜 시장) / 한국투자증권(모의·실전) 을 같은 모양으로 감싼다
import { TRADING } from "../../company.config";

export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type Quote = { code: string; price: number; open: number; high: number; low: number; changePct: number; volume: number };
export type Holding = { code: string; name: string; qty: number; avgPrice: number; price: number };
export type Balance = { cash: number; holdings: Holding[] };
export type OrderResult = { orderNo: string; message: string };
export type BrokerKind = "sim" | "paper" | "real";

export interface Broker {
  kind: BrokerKind;
  label: string;
  /** 한 바퀴(시세 확인 → 판단) 사이 간격 */
  tickMs: number;
  /** 장 시각 (한국시간 자정부터 몇 분) */
  minutes(): number;
  /** 오늘 날짜 키 YYYYMMDD */
  today(): string;
  /** 오늘 장이 안 열리면 그 이유 (주말 등) */
  closedReason(): string | null;
  /** 연습 모드는 시계를 앞으로 돌린다. 실제 증권사는 아무것도 안 함 */
  advance(): void;
  /** 어제까지 끝난 일봉 (오래된 → 최근) */
  daily(code: string): Promise<Candle[]>;
  quote(code: string): Promise<Quote>;
  balance(): Promise<Balance>;
  /** 시장가 주문 */
  order(side: "buy" | "sell", code: string, qty: number): Promise<OrderResult>;
}

/** 한국 주식 호가 단위 */
export function tickSize(price: number) {
  if (price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}

const roundTick = (price: number) => Math.max(1, Math.round(price / tickSize(price)) * tickSize(price));

function gauss() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── 🧪 연습 모드 ───────────────────────────────────────────
const SIM_BASE: Record<string, number> = {
  "005930": 72_000,
  "000660": 185_000,
  "035420": 190_000,
  "035720": 42_000,
  "005380": 230_000,
  "000270": 98_000,
  "068270": 175_000,
  "105560": 82_000,
  "055550": 52_000,
  "012330": 240_000,
};

type SimStock = { code: string; name: string; history: Candle[]; open: number; price: number; high: number; low: number; drift: number };

/**
 * 가짜 시장. 08:50부터 한 바퀴에 2분씩 흘러 약 3분 만에 하루 장이 끝난다.
 * 가격은 무작위로 움직이므로 결과는 매번 다르고, 실제 수익을 뜻하지 않는다.
 */
export class SimBroker implements Broker {
  kind = "sim" as const;
  label = "🧪 연습 모드";
  tickMs = 700;
  private clock = 8 * 60 + 50;
  private cash: number = TRADING.simCash;
  private held = new Map<string, Holding>();
  private stocks = new Map<string, SimStock>();

  constructor() {
    for (const { code, name } of TRADING.watchlist) {
      let close = SIM_BASE[code] ?? 50_000;
      const trend = (Math.random() - 0.5) * 0.008;
      const history: Candle[] = [];
      for (let d = 40; d >= 1; d--) {
        const open = close * (1 + gauss() * 0.006);
        const next = open * (1 + trend + gauss() * 0.018);
        const high = Math.max(open, next) * (1 + Math.random() * 0.012);
        const low = Math.min(open, next) * (1 - Math.random() * 0.012);
        history.push({ date: `D-${d}`, open: roundTick(open), high: roundTick(high), low: roundTick(low), close: roundTick(next), volume: 0 });
        close = next;
      }
      const open = roundTick(close * (1 + gauss() * 0.008));
      this.stocks.set(code, {
        code,
        name,
        history,
        open,
        price: open,
        high: open,
        low: open,
        // 종목마다 오늘 기울기가 다르다 — 오르는 날도, 내리는 날도 있다
        drift: (Math.random() - 0.5) * 0.0012,
      });
    }
  }

  minutes() {
    return this.clock;
  }

  today() {
    return "SIM";
  }

  closedReason() {
    return null;
  }

  advance() {
    if (this.clock >= 15 * 60 + 30) return;
    this.clock += 2;
    if (this.clock < 9 * 60) return;
    for (const s of this.stocks.values()) {
      const raw = s.price * (1 + s.drift + gauss() * 0.0022);
      s.price = roundTick(raw);
      s.high = Math.max(s.high, s.price);
      s.low = Math.min(s.low, s.price);
    }
  }

  async daily(code: string) {
    return this.stock(code).history;
  }

  async quote(code: string): Promise<Quote> {
    const s = this.stock(code);
    const prevClose = s.history[s.history.length - 1].close;
    const open = this.clock < 9 * 60 ? 0 : s.open;
    return { code, price: s.price, open, high: s.high, low: s.low, changePct: (s.price / prevClose - 1) * 100, volume: 0 };
  }

  async balance(): Promise<Balance> {
    const holdings = [...this.held.values()].map((h) => ({ ...h, price: this.stock(h.code).price }));
    return { cash: this.cash, holdings };
  }

  async order(side: "buy" | "sell", code: string, qty: number): Promise<OrderResult> {
    if (this.clock < 9 * 60 || this.clock >= 15 * 60 + 30) throw new Error("장 운영 시간이 아니에요");
    const s = this.stock(code);
    const amount = s.price * qty;
    if (side === "buy") {
      if (amount > this.cash) throw new Error("현금이 부족해요");
      this.cash -= amount;
      const prev = this.held.get(code);
      const total = (prev?.qty ?? 0) + qty;
      const avgPrice = prev ? (prev.avgPrice * prev.qty + amount) / total : s.price;
      this.held.set(code, { code, name: s.name, qty: total, avgPrice, price: s.price });
    } else {
      const prev = this.held.get(code);
      if (!prev || prev.qty < qty) throw new Error("가진 수량보다 많이 팔 수 없어요");
      this.cash += amount * (1 - TRADING.costPct / 100);
      if (prev.qty === qty) this.held.delete(code);
      else this.held.set(code, { ...prev, qty: prev.qty - qty });
    }
    return { orderNo: `SIM-${Date.now() % 100000}`, message: "가상 체결" };
  }

  private stock(code: string) {
    const s = this.stocks.get(code);
    if (!s) throw new Error(`연습 시장에 없는 종목: ${code}`);
    return s;
  }
}

// ── 📝/💰 한국투자증권 ─────────────────────────────────────
function seoulParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}${get("month")}${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/trade/${path}`, init);
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok || json.error) throw new Error(json.error ?? `HTTP ${response.status}`);
  return json;
}

export class KisBroker implements Broker {
  kind: BrokerKind;
  label: string;
  tickMs = 6_000;

  constructor(mode: "paper" | "real") {
    this.kind = mode;
    this.label = mode === "real" ? "💰 한국투자증권 실전" : "📝 한국투자증권 모의투자";
  }

  minutes() {
    return seoulParts().minutes;
  }

  today() {
    return seoulParts().date;
  }

  closedReason() {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(new Date());
    return day === "Sat" || day === "Sun" ? "오늘은 주말이라 장이 안 열려요. 평일에 다시 눌러주세요." : null;
  }

  advance() {}

  async daily(code: string) {
    const rows = await api<Candle[]>(`daily?code=${code}`);
    const today = this.today();
    return rows.filter((c) => c.date !== today);
  }

  quote(code: string) {
    return api<Quote>(`quote?code=${code}`);
  }

  balance() {
    return api<Balance>("balance");
  }

  order(side: "buy" | "sell", code: string, qty: number) {
    return api<OrderResult>("order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, code, qty }),
    });
  }
}

export type KisStatus = { configured: boolean; mode: "paper" | "real"; maxOrderKRW: number };

export async function fetchKisStatus(): Promise<KisStatus> {
  return api<KisStatus>("status");
}
