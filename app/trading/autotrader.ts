// 자동매매 엔진 — 버튼 한 번에 분석 → 전략 → 매수 → 감시 → 매도 → 정산
// 브라우저 탭이 열려 있는 동안만 돈다. 탭을 닫으면 멈춘다 (보유 종목은 증권사 계좌에 그대로 남는다).
import { TRADING } from "../../company.config";
import type { Broker } from "./brokers";
import { checkDisclosures } from "./disclosures";
import { analyze, type Signal } from "./strategy";

export type Phase = "대기" | "분석" | "전략" | "개장 대기" | "매매 중" | "정리" | "종료" | "중지" | "오류";
export type DeskRole = keyof typeof TRADING.desk;

export type Position = { code: string; name: string; qty: number; entry: number; last: number; boughtAt: string };
export type Trade = {
  id: number;
  time: string;
  side: "매수" | "매도";
  code: string;
  name: string;
  qty: number;
  price: number;
  pnl?: number;
  reason: string;
};
export type DeskLog = { id: number; time: string; role: DeskRole; text: string; tone: "pink" | "mint" | "lav" | "yellow" };

export type TraderSnapshot = {
  running: boolean;
  phase: Phase;
  brokerLabel: string;
  brokerKind: Broker["kind"];
  clock: string;
  capital: number;
  cash: number;
  realized: number;
  unrealized: number;
  pnlPct: number;
  noNewBuys: boolean;
  positions: Position[];
  signals: Signal[];
  trades: Trade[];
  log: DeskLog[];
  skipped: string[];
  /** 위험 공시가 나서 오늘 사지 않는 종목 */
  blocked: string[];
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const OPEN = 9 * 60;
const FIRST_BUY = 9 * 60 + 5;
const LAST_BUY = toMin(TRADING.lastBuyTime);
const CLOSE_ALL = toMin(TRADING.closeAllTime);
const MARKET_END = 15 * 60 + 30;

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

type Saved = {
  day: string;
  kind: string;
  capital: number;
  realized: number;
  traded: string[];
  positions: Position[];
};

export class AutoTrader {
  private broker: Broker;
  private listeners = new Set<() => void>();
  private snap: TraderSnapshot;
  private timer: number | null = null;
  private seq = 0;
  private errors = 0;
  private history = new Map<string, Awaited<ReturnType<Broker["daily"]>>>();
  private traded = new Set<string>();
  /** 원래 계좌에 있던 종목 — 이 프로그램이 산 게 아니므로 절대 팔지 않는다 */
  private untouchable = new Set<string>();
  /** 위험 공시가 난 종목 — 오늘은 새로 사지 않는다 */
  private newsBlocked = new Set<string>();
  private positions = new Map<string, Position>();
  private rotate = 0;
  private announced = new Set<string>();
  /** 오늘 매매를 접은 이유 — 정해지면 15:30 장 마감까지 자리만 지키다 퇴근 */
  private wrapReason: string | null = null;
  /** 장 운영 시간에 한 번이라도 돌았는지 */
  private sawMarket = false;
  /** 사무실 화면과 연결 (말풍선·피드) */
  private onDesk: ((role: DeskRole, text: string, tone: DeskLog["tone"]) => void) | null = null;

  constructor(broker: Broker) {
    this.broker = broker;
    this.snap = this.blank();
  }

  get kind() {
    return this.broker.kind;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snap;

  setDeskHandler(handler: ((role: DeskRole, text: string, tone: DeskLog["tone"]) => void) | null) {
    this.onDesk = handler;
  }

  private blank(): TraderSnapshot {
    return {
      running: false,
      phase: "대기",
      brokerLabel: this.broker.label,
      brokerKind: this.broker.kind,
      clock: this.clockText(),
      capital: 0,
      cash: 0,
      realized: 0,
      unrealized: 0,
      pnlPct: 0,
      noNewBuys: false,
      positions: [],
      signals: [],
      trades: [],
      log: [],
      skipped: [],
      blocked: [],
    };
  }

  private clockText() {
    const m = this.broker.minutes();
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  private update(patch: Partial<TraderSnapshot>) {
    const positions = [...this.positions.values()];
    const unrealized = positions.reduce((sum, p) => sum + (p.last * (1 - TRADING.costPct / 100) - p.entry) * p.qty, 0);
    const realized = patch.realized ?? this.snap.realized;
    const capital = patch.capital ?? this.snap.capital;
    this.snap = {
      ...this.snap,
      ...patch,
      clock: this.clockText(),
      positions,
      unrealized,
      pnlPct: capital > 0 ? ((realized + unrealized) / capital) * 100 : 0,
    };
    for (const listener of this.listeners) listener();
    this.save();
  }

  private say(role: DeskRole, text: string, tone: DeskLog["tone"] = "pink") {
    const entry: DeskLog = { id: this.seq++, time: this.clockText(), role, text, tone };
    this.update({ log: [entry, ...this.snap.log].slice(0, 120) });
    this.onDesk?.(role, text, tone);
  }

  /** 장 시계 (자정부터 몇 분) */
  minutes() {
    return this.broker.minutes();
  }

  // ── 시작 / 중지 ──────────────────────────────────────────
  /**
   * 분석·전략까지 마친 뒤, release() 가 불릴 때까지 매매를 시작하지 않는다.
   * 사무실 장면(회의·리스크 점검)이 끝나고 장이 열리는 흐름을 맞추기 위함.
   */
  private gate: (() => void) | null = null;
  private released = true;

  holdUntilRelease() {
    this.released = false;
  }

  release() {
    this.released = true;
    this.gate?.();
    this.gate = null;
  }

  async start() {
    if (this.snap.running) return;
    this.errors = 0;
    this.update({ running: true, phase: "분석", noNewBuys: false });
    try {
      await this.prepare();
      if (!this.released) await new Promise<void>((resolve) => (this.gate = resolve));
      if (this.snap.running) this.schedule(0);
    } catch (error) {
      this.fail(error);
    }
  }

  stop(reason = "대표님 지시로 자동매매를 멈췄어요. 들고 있는 종목은 그대로 둡니다.") {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (!this.snap.running) return;
    this.update({ running: false, phase: "중지" });
    this.say("secretary", reason, "lav");
  }

  /** 이 프로그램이 산 종목을 전부 팔고 멈춘다 */
  async sellAllAndStop() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.update({ phase: "정리" });
    await this.liquidate("대표 지시 전량 매도");
    this.update({ running: false, phase: "중지" });
    this.say("secretary", `전량 매도 후 멈췄어요. ${this.summary()}`, "lav");
  }

  private schedule(delay = this.broker.tickMs) {
    this.timer = window.setTimeout(async () => {
      if (!this.snap.running) return;
      try {
        await this.step();
        this.errors = 0;
      } catch (error) {
        this.errors += 1;
        this.say("trader", `시세·주문 통신 오류: ${error instanceof Error ? error.message : String(error)}`, "lav");
        if (this.errors >= 5) return this.fail(new Error("연속 5번 오류가 나서 안전하게 멈춥니다"));
      }
      if (this.snap.running) this.schedule();
    }, delay);
  }

  private fail(error: unknown) {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.update({ running: false, phase: "오류" });
    this.say("secretary", `자동매매를 멈췄어요 — ${error instanceof Error ? error.message : String(error)}`, "lav");
  }

  // ── ① 분석 · ② 전략 ───────────────────────────────────────
  private async prepare() {
    const closed = this.broker.closedReason();
    if (closed) throw new Error(closed);
    const balance = await this.broker.balance();
    const restored = this.restore();
    this.untouchable = new Set(
      balance.holdings.filter((h) => !restored?.positions.some((p) => p.code === h.code)).map((h) => h.code),
    );

    if (restored) {
      for (const p of restored.positions) {
        const held = balance.holdings.find((h) => h.code === p.code);
        if (held) this.positions.set(p.code, { ...p, qty: Math.min(p.qty, held.qty), last: held.price || p.last });
      }
      this.traded = new Set(restored.traded);
      this.update({ capital: restored.capital, realized: restored.realized, cash: balance.cash });
      this.say("secretary", `오늘 하던 매매를 이어서 합니다. 관리 중인 종목 ${this.positions.size}개.`, "yellow");
    } else {
      const capital = Math.min(balance.cash, TRADING.maxPositions * TRADING.maxOrderKRW);
      this.update({ capital, realized: 0, cash: balance.cash, trades: [] });
      this.say("finance", `운용 자금 ${won(capital)}으로 시작합니다. (현금 ${won(balance.cash)} 중 한도까지만)`, "yellow");
    }
    if (this.untouchable.size) {
      this.say("risk", `원래 계좌에 있던 ${this.untouchable.size}개 종목은 건드리지 않아요.`, "lav");
    }
    if (this.snap.capital < 50_000) throw new Error("주문 가능한 현금이 너무 적어요 (5만 원 미만)");

    this.say("analyst", `감시 종목 ${TRADING.watchlist.length}개 일봉·시세 분석 시작할게요.`);
    const signals: Signal[] = [];
    const skipped: string[] = [];
    for (const stock of TRADING.watchlist) {
      try {
        const history = await this.broker.daily(stock.code);
        if (history.length < 20) throw new Error("일봉이 20일치보다 적음");
        this.history.set(stock.code, history);
        const quote = await this.broker.quote(stock.code);
        signals.push(analyze(stock, history, quote, TRADING.breakoutK));
      } catch (error) {
        skipped.push(`${stock.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    signals.sort((a, b) => b.score - a.score);
    this.update({ signals, skipped });
    if (!signals.length) throw new Error("분석할 수 있는 종목이 없어요");

    await this.screenDisclosures();
    this.update({ phase: "전략" });

    const uptrend = signals.filter((s) => s.ma5 > s.ma20);
    this.say(
      "analyst",
      `분석 끝. 상승 추세 ${uptrend.length}개 / 하락 추세 ${signals.length - uptrend.length}개. 1등은 ${signals[0].name}(${signals[0].score}점).`,
      "mint",
    );
    this.say(
      "strategist",
      `전략: 변동성 돌파(K=${TRADING.breakoutK}). 상승 추세 종목이 '시가+전일 변동폭×${TRADING.breakoutK}'를 넘으면 매수, +${TRADING.takeProfitPct}% 익절 / -${TRADING.stopLossPct}% 손절, ${TRADING.closeAllTime} 전량 정리.`,
    );
    this.say(
      "risk",
      `안전장치: 최대 ${TRADING.maxPositions}종목, 종목당 ${won(TRADING.maxOrderKRW)} 이하, 하루 -${TRADING.dailyLossLimitPct}% 손실이면 즉시 중단.`,
    );
  }

  /** 금융감독원 DART 공시에 위험 단어가 있으면 그 종목은 오늘 사지 않는다 */
  private async screenDisclosures() {
    try {
      const result = await checkDisclosures(TRADING.watchlist.map((s) => s.code));
      if (!result.configured) {
        this.say("analyst", "공시 점검은 DART 키가 없어서 건너뛰어요.", "lav");
        return;
      }
      this.newsBlocked = new Set(result.hits.map((h) => h.code));
      const blocked = result.hits.map((h) => `${h.name}: ${h.title}`);
      this.update({ blocked });
      for (const hit of result.hits) {
        this.say("risk", `${hit.name} 공시 '${hit.title}' (${hit.word}) — 오늘은 사지 않아요.`, "lav");
      }
      this.say(
        "analyst",
        `공시 점검 끝. 최근 ${TRADING.disclosure.lookbackDays}일 공시 ${result.total}건 중 위험 공시 ${result.hits.length}종목.` +
          (result.partial ? " (공시가 많아 일부만 확인했어요)" : ""),
        result.hits.length ? "lav" : "mint",
      );
    } catch (error) {
      this.say("analyst", `공시 점검 실패 — 오늘은 공시 확인 없이 진행해요 (${error instanceof Error ? error.message : String(error)})`, "lav");
    }
  }

  // ── ③ 매수 · ④ 감시 · ⑤ 매도 ─────────────────────────────
  private async step() {
    this.broker.advance();
    const now = this.broker.minutes();

    if (now < OPEN) {
      this.update({ phase: "개장 대기" });
      this.once("open-wait", () => this.say("trader", "09:00 장이 열리면 바로 감시 들어갑니다.", "lav"));
      return;
    }
    if (now >= MARKET_END) {
      if (!this.sawMarket) {
        this.once("closed", () => this.say("trader", "지금은 장 운영 시간(09:00~15:30)이 아니라 주문을 낼 수 없어요. 평일 장중에 다시 눌러주세요.", "lav"));
      }
      await this.finish(this.wrapReason ?? "장 마감");
      return;
    }
    this.sawMarket = true;
    // 오늘 매매는 접었고, 장이 닫힐 때까지 자리만 지킨다
    if (this.wrapReason) return;
    if (now >= CLOSE_ALL) {
      await this.wrapUp("장 마감 전 정리");
      return;
    }
    this.update({ phase: "매매 중" });

    // 들고 있는 종목: 익절 / 손절
    for (const pos of [...this.positions.values()]) {
      const q = await this.broker.quote(pos.code);
      pos.last = q.price;
      const change = (q.price / pos.entry - 1) * 100;
      if (change >= TRADING.takeProfitPct) await this.sell(pos, `익절 ${pct(change)}`);
      else if (change <= -TRADING.stopLossPct) await this.sell(pos, `손절 ${pct(change)}`);
    }
    this.update({});

    // 하루 안전장치
    const capital = this.snap.capital;
    if (this.snap.pnlPct <= -TRADING.dailyLossLimitPct) {
      this.say("risk", `오늘 손실 ${pct(this.snap.pnlPct)} — 한도 도달. 전부 팔고 오늘 매매 끝냅니다.`, "lav");
      await this.wrapUp("손실 한도");
      return;
    }
    if (!this.snap.noNewBuys && (this.snap.realized / capital) * 100 >= TRADING.dailyTargetPct) {
      this.update({ noNewBuys: true });
      this.say("strategist", `확정 수익 ${pct((this.snap.realized / capital) * 100)} — 오늘 목표 달성! 새 매수는 멈춰요.`, "mint");
    }

    // 새로 살 종목 찾기
    const canBuy = !this.snap.noNewBuys && now >= FIRST_BUY && now <= LAST_BUY && this.positions.size < TRADING.maxPositions;
    if (canBuy) await this.scanForEntries();
    else if (now > LAST_BUY) this.once("last-buy", () => this.say("strategist", `${TRADING.lastBuyTime} 지나서 새 매수는 끝. 남은 건 감시만 해요.`));

    if (now > LAST_BUY && this.positions.size === 0) await this.wrapUp("더 할 매매 없음");
  }

  private async scanForEntries() {
    const pool = this.snap.signals.filter(
      (s) =>
        s.ma5 > s.ma20 &&
        !this.traded.has(s.code) &&
        !this.positions.has(s.code) &&
        !this.untouchable.has(s.code) &&
        !this.newsBlocked.has(s.code),
    );
    if (!pool.length) return;
    // 실제 증권사는 호출 횟수 제한이 있어 한 바퀴에 3종목씩 돌아가며 본다
    const batch = this.broker.kind === "sim" ? pool : pool.slice(this.rotate % pool.length).concat(pool).slice(0, 3);
    this.rotate += 3;

    const refreshed = new Map<string, Signal>();
    for (const signal of batch) {
      if (this.positions.size >= TRADING.maxPositions) break;
      const history = this.history.get(signal.code);
      if (!history) continue;
      const quote = await this.broker.quote(signal.code);
      const next = analyze(signal, history, quote, TRADING.breakoutK);
      refreshed.set(signal.code, next);
      if (next.decision === "매수") await this.buy(next);
    }
    if (refreshed.size) {
      this.update({ signals: this.snap.signals.map((s) => refreshed.get(s.code) ?? s) });
    }
  }

  private async buy(signal: Signal) {
    const slots = TRADING.maxPositions - this.positions.size;
    const invested = [...this.positions.values()].reduce((sum, p) => sum + p.entry * p.qty, 0);
    const budget = Math.min(TRADING.maxOrderKRW, (this.snap.capital - invested) / slots, this.snap.capital / TRADING.maxPositions);
    const qty = Math.floor(budget / signal.price);
    if (qty < 1) {
      this.once(`small-${signal.code}`, () => this.say("risk", `${signal.name}은 1주 가격이 한도보다 비싸서 패스.`, "lav"));
      return;
    }

    this.traded.add(signal.code);
    this.say("trader", `${signal.name} ${qty}주 시장가 매수 주문 넣어요. (돌파가 ${won(signal.target)} 넘음)`);
    const result = await this.broker.order("buy", signal.code, qty);
    let entry = signal.price;
    let filled = qty;
    if (this.broker.kind !== "sim") {
      // 실제 체결가는 잔고에서 확인한다
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const held = (await this.broker.balance()).holdings.find((h) => h.code === signal.code);
      if (held) {
        entry = held.avgPrice || entry;
        filled = held.qty;
      } else this.say("trader", `${signal.name} 체결 확인이 늦어요. 주문가 기준으로 관리합니다.`, "lav");
    }
    this.positions.set(signal.code, { code: signal.code, name: signal.name, qty: filled, entry, last: signal.price, boughtAt: this.clockText() });
    this.record({ side: "매수", code: signal.code, name: signal.name, qty: filled, price: entry, reason: `돌파 매수 · ${result.message}` });
    this.say(
      "risk",
      `${signal.name} 익절가 ${won(entry * (1 + TRADING.takeProfitPct / 100))} / 손절가 ${won(entry * (1 - TRADING.stopLossPct / 100))} 걸어둘게요.`,
    );
  }

  private async sell(pos: Position, reason: string) {
    await this.broker.order("sell", pos.code, pos.qty);
    const pnl = (pos.last * (1 - TRADING.costPct / 100) - pos.entry) * pos.qty;
    this.positions.delete(pos.code);
    const realized = this.snap.realized + pnl;
    this.update({ realized });
    this.record({ side: "매도", code: pos.code, name: pos.name, qty: pos.qty, price: pos.last, pnl, reason });
    this.say(pnl >= 0 ? "finance" : "risk", `${pos.name} ${reason} 매도 — ${pnl >= 0 ? "+" : ""}${won(pnl)}`, pnl >= 0 ? "mint" : "lav");
  }

  private async liquidate(reason: string) {
    for (const pos of [...this.positions.values()]) {
      try {
        const q = await this.broker.quote(pos.code);
        pos.last = q.price;
        await this.sell(pos, reason);
      } catch (error) {
        this.say("trader", `${pos.name} 매도 실패 — 증권사 앱에서 직접 확인해주세요 (${error instanceof Error ? error.message : String(error)})`, "lav");
      }
    }
  }

  /** 오늘 매매 접기 — 다 팔고 새로 사지 않지만, 퇴근은 15:30 장 마감에 */
  private async wrapUp(reason: string) {
    if (this.wrapReason) return;
    this.wrapReason = reason;
    this.update({ phase: "정리", noNewBuys: true });
    if (this.positions.size) await this.liquidate(reason);
    this.say("trader", `${reason} — 오늘 매매는 여기까지. 15:30 장 마감까지 자리 지키다 퇴근할게요.`, "lav");
  }

  // ── ⑥ 정산 ───────────────────────────────────────────────
  private async finish(reason: string) {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.update({ phase: "정리" });
    if (this.positions.size) await this.liquidate(reason);
    this.update({ running: false, phase: "종료" });
    const wins = this.snap.trades.filter((t) => t.side === "매도" && (t.pnl ?? 0) > 0).length;
    const sells = this.snap.trades.filter((t) => t.side === "매도").length;
    this.say("finance", `정산: 매도 ${sells}건 중 ${wins}건 수익. ${this.summary()}`, this.snap.realized >= 0 ? "mint" : "lav");
    this.say(
      "secretary",
      sells === 0
        ? "대표님, 오늘은 조건에 맞는 종목이 없어 한 번도 사지 않았어요. 무리하지 않는 것도 전략이에요."
        : this.snap.realized >= 0
          ? `대표님, 오늘 매매 끝났어요. ${pct(this.snap.pnlPct)} 마감입니다.`
          : `대표님, 오늘은 ${pct(this.snap.pnlPct)} 손실로 마감했어요. 손절 규칙대로 지켰습니다.`,
      "yellow",
    );
  }

  /** 오늘 1순위 후보 한 줄 (사무실 회의용) */
  topPick() {
    const top = this.snap.signals[0];
    return top ? `${top.name}, ${top.score}점이에요. ${top.reasons[0] ?? ""}` : "아직 점수표가 없어요.";
  }

  summary() {
    return `확정 손익 ${this.snap.realized >= 0 ? "+" : ""}${won(this.snap.realized)} (${pct(this.snap.pnlPct)})`;
  }

  private record(trade: Omit<Trade, "id" | "time">) {
    this.update({ trades: [{ ...trade, id: this.seq++, time: this.clockText() }, ...this.snap.trades] });
  }

  private once(key: string, fn: () => void) {
    if (this.announced.has(key)) return;
    this.announced.add(key);
    fn();
  }

  // ── 새로고침해도 오늘 산 종목을 잊지 않게 (실제 증권사만) ──────────
  private storageKey() {
    return `auto-trader:${this.broker.kind}`;
  }

  private save() {
    if (this.broker.kind === "sim" || this.snap.capital <= 0) return;
    const saved: Saved = {
      day: this.broker.today(),
      kind: this.broker.kind,
      capital: this.snap.capital,
      realized: this.snap.realized,
      traded: [...this.traded],
      positions: [...this.positions.values()],
    };
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(saved));
    } catch {}
  }

  private restore(): Saved | null {
    if (this.broker.kind === "sim") return null;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey()) ?? "null") as Saved | null;
      return saved && saved.day === this.broker.today() ? saved : null;
    } catch {
      return null;
    }
  }
}
