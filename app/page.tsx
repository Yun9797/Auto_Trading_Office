"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import OfficeWorld from "./game/OfficeWorld";
import {
  buildReport,
  fetchIntegrations,
  publish,
  type IntegrationStatus,
  type PublishResult,
} from "./game/report";
import { Company, PHASES, type Agent, type DeptStatus, type Snapshot } from "./game/sim";
import { CEO, DEPT_BRIEF, DEPT_LEAD, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import { COMPANY, STORAGE_LINK, TRADING } from "../company.config";
import { AutoTrader, type TraderSnapshot } from "./trading/autotrader";
import { KisBroker, SimBroker, fetchKisStatus, type KisStatus } from "./trading/brokers";
import TradingDesk, { type DeskMode } from "./trading/TradingDesk";

type View = "live" | "dashboard" | "trading";

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const signedWon = (value: number) => `${value >= 0 ? "+" : ""}${won(value)}`;
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const statusClass: Record<DeptStatus, string> = {
  "완료": "done",
  "진행 중": "working",
  "승인 대기": "approval",
  "연동 대기": "blocked",
  "대기": "waiting",
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const AUTO_DAY_KEY = "auto-start-day";
const MARKET_OPEN = 9 * 60;
const MARKET_CLOSE = 15 * 60 + 30;

/** 지금 서울 날짜·시각 */
function seoulNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const md = `${get("month")}-${get("day")}`;
  return {
    date: `${get("year")}-${md}`,
    md,
    weekend: get("weekday") === "Sat" || get("weekday") === "Sun",
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    time: `${get("hour")}:${get("minute")}`,
  };
}

type SeoulNow = ReturnType<typeof seoulNow>;

const isHoliday = (now: SeoulNow) => TRADING.autoStart.holidays.some((h) => h === now.md || h === now.date);

/** 지금 장이 열려 있는지 */
const marketOpen = (now: SeoulNow) =>
  !now.weekend && !isHoliday(now) && now.minutes >= MARKET_OPEN && now.minutes < MARKET_CLOSE;

/** 시계 밑에 보여줄 장 상태 */
function marketStatus(now: SeoulNow) {
  if (now.weekend) return "휴장 · 주말";
  if (isHoliday(now)) return "휴장 · 공휴일";
  if (now.minutes < MARKET_OPEN) return "장 열리기 전 · 09:00 개장";
  if (now.minutes < MARKET_CLOSE) return "장 열림 · 15:30 마감";
  return "장 마감";
}

/** 실제 서울 시각 — 1초마다 갱신 */
const subscribeClock = (listener: () => void) => {
  const id = window.setInterval(listener, 1000);
  return () => window.clearInterval(id);
};
const readClock = () => {
  const now = seoulNow();
  return `${now.time}|${marketStatus(now)}`;
};

function readStore(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 브라우저 — 이번 창에서만 기억
  }
}

/** 링크만 걸려 있는 항목 (서버 연동과 무관) */
const integrations2Static = STORAGE_LINK
  ? [{ name: "결과물 보관함", status: "링크 연결", tone: "mint", href: STORAGE_LINK }]
  : [];

function PixelEmployee({ hair, shirt, accent }: { hair: string; shirt: string; accent: string }) {
  const style = {
    "--pixel-hair": hair,
    "--pixel-shirt": shirt,
    "--pixel-accent": accent,
  } as CSSProperties;
  return (
    <span className="pixel-employee" style={style} aria-hidden="true">
      <i className="pixel-shadow" />
      <i className="pixel-legs" />
      <i className="pixel-body" />
      <i className="pixel-arm left" />
      <i className="pixel-arm right" />
      <i className="pixel-face">
        <b className="pixel-eyes" />
      </i>
      <i className="pixel-hair" />
      <i className="pixel-headset" />
    </span>
  );
}

export default function Home() {
  const [engine] = useState(() => new Company());
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());
  const [view, setView] = useState<View>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [filter, setFilter] = useState<"전체" | DeptStatus>("전체");
  const [toast, setToast] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [publishState, setPublishState] = useState<{ busy: boolean; result: PublishResult | null; error: string }>({
    busy: false,
    result: null,
    error: "",
  });
  const publishedRef = useRef(false);
  const [kis, setKis] = useState<KisStatus | null>(null);
  const [deskMode, setDeskMode] = useState<DeskMode>("sim");
  const [trader, setTrader] = useState(() => new AutoTrader(new SimBroker()));
  const traderRef = useRef(trader);
  const tsnap = useSyncExternalStore(trader.subscribe, trader.getSnapshot, trader.getSnapshot);
  const tradeRunning = tsnap.running;
  const [realConfirmed, setRealConfirmed] = useState(false);
  const [clockTime, clockStatus] = useSyncExternalStore(subscribeClock, readClock, () => "--:--|").split("|");

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      acc += dt;
      if (acc >= 0.18) {
        acc = 0;
        setSnap(engine.snapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // 탭이 뒤에 있으면 화면 갱신(rAF)이 멈춘다 → 1초마다 밀린 시간만큼 장면을 진행
    const hidden = window.setInterval(() => {
      if (!document.hidden) return;
      const now = performance.now();
      let left = Math.min((now - last) / 1000, 60);
      last = now;
      while (left > 0) {
        engine.tick(Math.min(left, 0.05));
        left -= 0.05;
      }
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(hidden);
    };
  }, [engine]);

  useEffect(() => {
    engine.setBriefingHandler(() => setBriefing(true));
    return () => engine.setBriefingHandler(null);
  }, [engine]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const onSelect = useCallback((agent: Agent) => setSelectedId(agent.id), []);

  // 한국투자증권 키가 있는지 (값이 아니라 설정 여부만)
  useEffect(() => {
    fetchKisStatus()
      .then((status) => {
        setKis(status);
        if (status.configured) setDeskMode("kis");
      })
      .catch(() => setKis(null));
  }, []);

  // 사무실 하루 장면 ↔ 자동매매 엔진 연결 (장면이 실제 매매 진행을 기다린다)
  useEffect(() => {
    engine.setMarketBridge({
      begin: () => void traderRef.current.start(),
      analyzed: () => !["대기", "분석"].includes(traderRef.current.getSnapshot().phase),
      release: () => traderRef.current.release(),
      active: () => traderRef.current.getSnapshot().running,
      minutes: () => traderRef.current.minutes(),
      phase: () => traderRef.current.getSnapshot().phase,
      pick: () => traderRef.current.topPick(),
      summary: () => traderRef.current.summary(),
    });
    return () => engine.setMarketBridge(null);
  }, [engine]);

  // 자동매매 중에 탭을 닫으려 하면 한 번 붙잡는다
  useEffect(() => {
    if (!tradeRunning) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [tradeRunning]);

  /** 버튼 한 번 — 전원 출근 → 분석 → 전략 → 자동매매 → 정산 → 브리핑 */
  const startDay = useCallback(() => {
    if (snap.running || tradeRunning) return;
    if (deskMode === "kis" && kis?.mode === "real" && !realConfirmed) {
      setView("trading");
      showToast("실전 모드는 자동매매 탭에서 확인 체크를 먼저 해주세요");
      return;
    }
    // 장이 열려 있으면 연습 모드도 실제 시각을 따라가고, 장이 닫혀 있으면 빠르게 하루를 돌려 본다
    const broker =
      deskMode === "kis" && kis?.configured ? new KisBroker(kis.mode) : new SimBroker({ live: marketOpen(seoulNow()) });
    const next = new AutoTrader(broker);
    next.holdUntilRelease();
    // 트레이딩 데스크의 말 → 사무실 피드·말풍선·대표 지시창
    next.setDeskHandler((role, text, tone) => {
      const desk = TRADING.desk[role];
      engine.pushLog("💹", `${desk.name}: ${text}`, tone);
      const agent = engine.agentById.get(desk.staffId);
      if (agent) engine.say(agent, text.length > 34 ? `${text.slice(0, 33)}…` : text, 3.4);
      if (/매수 주문/.test(text)) engine.flashDept("reels", "매수 체결 확인");
      if (/매도 —/.test(text)) engine.flashDept("carousel", "매도 체결 확인");
      if (role === "secretary" || role === "finance" || /매수 주문|매도 —/.test(text)) {
        engine.pushChat("staff", desk.name, text);
      }
    });
    traderRef.current = next;
    setTrader(next);
    writeStore(AUTO_DAY_KEY, seoulNow().date);
    engine.start();
    setBriefing(false);
    showToast(`${broker.label} — 전원 출근, 오늘 매매를 시작해요`);
  }, [deskMode, engine, kis, realConfirmed, showToast, snap.running, tradeRunning]);

  // ⏰ 자동 출근 — 장이 열리면 알아서 시작 (하루 한 번, 15:30 장이 닫히면 정산·브리핑 후 퇴근)
  const startDayRef = useRef(startDay);
  useEffect(() => {
    startDayRef.current = startDay;
  }, [startDay]);
  useEffect(() => {
    const check = () => {
      const now = seoulNow();
      if (!marketOpen(now) || now.minutes < toMin(TRADING.autoStart.time) || now.minutes >= toMin(TRADING.lastBuyTime)) return;
      if (readStore(AUTO_DAY_KEY) === now.date || engine.snapshot().running) return;
      writeStore(AUTO_DAY_KEY, now.date);
      if (deskMode === "kis" && kis?.mode === "real" && !realConfirmed) {
        engine.pushLog("⏰", "자동 출근 건너뜀 — 실전 모드는 자동매매 탭에서 확인 체크가 필요해요", "lav");
        showToast("⏰ 자동 출근 건너뜀 — 실전 모드 확인 체크가 필요해요");
        return;
      }
      engine.pushLog("⏰", `자동 출근 — ${TRADING.autoStart.time} 출근 시간이에요`, "yellow");
      startDayRef.current();
    };
    check();
    const id = window.setInterval(check, 20_000);
    return () => window.clearInterval(id);
  }, [deskMode, engine, kis, realConfirmed, showToast]);

  // 연동 설정 여부를 서버에서 받아온다 (값이 아니라 설정 여부만)
  useEffect(() => {
    fetchIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
  }, []);

  const sendReport = useCallback(
    async (auto: boolean) => {
      setPublishState((state) => ({ ...state, busy: true, error: "" }));
      try {
        const t = traderRef.current.getSnapshot();
        const result = await publish(
          buildReport(engine.snapshot(), {
            summary: traderRef.current.summary(),
            trades: t.trades.map(
              (x) => `${x.time} ${x.side} ${x.name} ${x.qty}주 @ ${won(x.price)}${x.pnl === undefined ? "" : ` (${signedWon(x.pnl)})`}`,
            ),
            holding: t.positions.length,
          }),
        );
        setPublishState({ busy: false, result, error: "" });

        const parts: string[] = [];
        parts.push(result.notion.ok ? "Notion 저장 완료" : `Notion ${result.notion.detail ?? "실패"}`);
        parts.push(result.discord.ok ? "Discord 전송 완료" : `Discord ${result.discord.detail ?? "실패"}`);
        engine.pushLog(
          result.notion.ok && result.discord.ok ? "📤" : "⚠️",
          `완료 보고 발행 — ${parts.join(" / ")}`,
          result.notion.ok && result.discord.ok ? "mint" : "lav",
        );
        engine.pushChat("staff", "김세리", `보고서 발행 결과입니다.\n· ${parts.join("\n· ")}`);
        if (!auto) showToast(result.notion.ok || result.discord.ok ? "보고서를 발행했어요" : "발행 실패 — 연동 설정 필요");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPublishState({ busy: false, result: null, error: message });
        engine.pushLog("⚠️", `완료 보고 발행 실패 — ${message}`, "lav");
        if (!auto) showToast("발행 실패 — 연동 설정을 확인해주세요");
      }
    },
    [engine, showToast],
  );

  // 하루가 끝나면 자동으로 한 번 발행한다
  useEffect(() => {
    if (snap.dayComplete && !publishedRef.current) {
      publishedRef.current = true;
      void sendReport(true);
    }
    if (!snap.dayComplete && snap.running) publishedRef.current = false;
  }, [snap.dayComplete, snap.running, sendReport]);

  const askAgent = useCallback(
    (agent: Agent) => {
      engine.command(`${agent.name} 지금 뭐해?`);
      setSelectedId(null);
      window.setTimeout(
        () => document.getElementById("ceo-console")?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60,
      );
    },
    [engine],
  );

  const teams = useMemo(
    () =>
      DEPT_ROOMS.map((room) => {
        const lead = DEPT_LEAD[room.id];
        const status = snap.deptStatus[room.id] ?? "대기";
        return {
          id: room.id,
          icon: room.icon,
          name: room.name,
          room: room.short,
          lead,
          status,
          ...DEPT_BRIEF[room.id],
        };
      }),
    [snap.deptStatus],
  );

  const filteredTeams = filter === "전체" ? teams : teams.filter((team) => team.status === filter);
  const selected = selectedId ? engine.agentById.get(selectedId) ?? null : null;
  const onDuty = engine.agents.filter((a) => a.status !== "출근 전").length;

  return (
    <main className="page-shell">
      <div className="wrap">
        <nav className="app-nav" aria-label="AI Company 화면 전환">
          <div className="brand-chip">
            <span>{COMPANY.logoLetter}</span>
            <b>{COMPANY.name}</b>
          </div>
          <div className="nav-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>
              🎮 라이브 오피스
            </button>
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              📊 대시보드
            </button>
            <button className={view === "trading" ? "active" : ""} onClick={() => setView("trading")}>
              💹 자동매매{tradeRunning ? " ●" : ""}
            </button>
          </div>
        </nav>

        {view === "trading" ? (
          <TradingDesk
            trader={trader}
            kis={kis}
            mode={deskMode}
            setMode={setDeskMode}
            onStart={startDay}
            officeRunning={snap.running}
            realConfirmed={realConfirmed}
            setRealConfirmed={setRealConfirmed}
          />
        ) : view === "live" ? (
          <LiveView
            engine={engine}
            snap={snap}
            follow={follow}
            setFollow={setFollow}
            selectedId={selectedId}
            onSelect={onSelect}
            onStart={startDay}
            tsnap={tsnap}
            onOpenTrading={() => setView("trading")}
            onDuty={onDuty}
            onPublish={() => void sendReport(false)}
            clockTime={clockTime}
            clockStatus={clockStatus}
            publishBusy={publishState.busy}
            publishResult={publishState.result}
          />
        ) : (
          <DashboardView
            teams={teams}
            filteredTeams={filteredTeams}
            filter={filter}
            setFilter={setFilter}
            snap={snap}
            onStart={startDay}
            tsnap={tsnap}
            kis={kis}
            onSelect={(id) => setSelectedId(id)}
            integrations={integrations}
            publishResult={publishState.result}
          />
        )}
      </div>

      {selected ? (
        <ProfileModal
          agent={selected}
          onClose={() => setSelectedId(null)}
          onAsk={(agent) => {
            setView("live");
            askAgent(agent);
          }}
        />
      ) : null}
      {briefing ? <BriefingModal snap={snap} tsnap={tsnap} onClose={() => setBriefing(false)} /> : null}
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}

function LiveView({
  engine,
  snap,
  follow,
  setFollow,
  selectedId,
  onSelect,
  onStart,
  tsnap,
  onOpenTrading,
  onDuty,
  onPublish,
  publishBusy,
  publishResult,
  clockTime,
  clockStatus,
}: {
  engine: Company;
  snap: Snapshot;
  follow: boolean;
  setFollow: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onStart: () => void;
  tsnap: TraderSnapshot;
  onOpenTrading: () => void;
  onDuty: number;
  onPublish: () => void;
  publishBusy: boolean;
  publishResult: PublishResult | null;
  clockTime: string;
  clockStatus: string;
}) {
  const progress = Math.round((snap.phaseIndex / (PHASES.length - 1)) * 100);

  return (
    <>
      <header className="live-hero">
        <div>
          <p className="eyebrow">LIVE TRADING OFFICE · 32 AI STAFF · {tsnap.brokerLabel}</p>
          <h1>
            {COMPANY.titlePrefix} <em className="highlight">{COMPANY.titleAccent}</em>
          </h1>
          <p>버튼 한 번이면 출근 → 시장 분석 → 회의 → 전략 → 리스크 점검 → 자동매매 → 정산 → 브리핑까지 알아서 돌아가요.</p>
        </div>
        <div className="live-clock">
          <span>SEOUL</span>
          <b>{clockTime}</b>
          <small>{clockStatus}</small>
        </div>
      </header>

      <section className="live-bar">
        <button className="btn btn-primary" onClick={onStart} disabled={snap.running}>
          {snap.running ? "트레이딩룸 가동 중…" : snap.dayComplete ? "내일 장도 시작하기" : "▶ 오늘 매매 시작하기"}
        </button>
        <span
          className="btn btn-ghost on"
          title="장이 열리면 이 창이 열려 있는 한 알아서 출근하고, 15:30 장이 닫히면 정산 후 퇴근해요. 주말·공휴일은 쉬어요."
        >
          ⏰ 자동 출퇴근 · 장 시간 {TRADING.autoStart.time}~15:30
        </span>
        <button className="btn btn-ghost" onClick={() => engine.togglePause()}>
          {snap.paused ? "▶ 재생" : "⏸ 일시정지"}
        </button>
        <div className="speed-wrap">
          <span className="speed-label" title="시뮬레이션 전체(걷기·업무·대사)가 함께 빨라져요. 실제 외부 작업 속도와는 무관합니다.">
            재생 속도
          </span>
          <div className="speed-group" role="group" aria-label="재생 속도">
            {[1, 2, 4].map((value) => (
              <button
                key={value}
                className={!snap.turbo && snap.speed === value ? "on" : ""}
                onClick={() => engine.setSpeed(value)}
                title={value === 1 ? "말풍선 읽기·화면녹화용" : value === 4 ? "결과만 빠르게" : "기본"}
              >
                {value}x
              </button>
            ))}
            <button
              className={`skip ${snap.turbo ? "on" : ""}`}
              onClick={() => engine.skipToDecision()}
              disabled={!snap.running || snap.phase.startsWith("자동매매")}
              title="사무실 장면을 장 시작(또는 업무 종료)까지 빠르게 넘깁니다. 실제 매매 속도와는 무관해요."
            >
              {snap.turbo ? "건너뛰는 중…" : "⏭ 장 시작까지"}
            </button>
          </div>
        </div>
        <button className={`btn btn-ghost ${follow ? "on" : ""}`} onClick={() => setFollow(!follow)}>
          🎥 자동 추적 {follow ? "ON" : "OFF"}
        </button>
        <button
          className={`btn btn-ghost publish-btn ${publishResult?.notion.ok || publishResult?.discord.ok ? "sent" : ""}`}
          onClick={onPublish}
          disabled={publishBusy}
          title="완료 보고를 Notion에 저장하고 같은 내용을 Discord로 보냅니다"
        >
          {publishBusy ? "발행 중…" : "📤 보고 발행"}
        </button>
        <div className="live-progress">
          <span>
            {snap.phase} · {progress}%
          </span>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
        </div>
        <div className="live-counts">
          <span className="lc on-duty">근무 {onDuty}</span>
          <span className="lc done">완료 {snap.stats.done}</span>
          <span className="lc working">진행 {snap.stats.working}</span>
          <span className="lc blocked">연동대기 {snap.stats.blocked}</span>
        </div>
      </section>

      <section className="live-grid">
        <OfficeWorld engine={engine} snap={snap} selectedId={selectedId} follow={follow} onSelect={onSelect} />

        <aside className="live-rail">
          <CeoConsole engine={engine} snap={snap} />

          <section className="win rail-card" id="trade-card">
            <div className="win-bar">
              <span>💹 trading.now</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className={`win-body approval-body ${tsnap.running ? "pending" : ""}`}>
              <div className="approval-top">
                <span className={`mini-badge ${tsnap.running ? "yellow" : "mint"}`}>{tsnap.brokerLabel}</span>
                <span className={`score ${tsnap.running ? "blink" : ""}`}>{tsnap.phase}</span>
              </div>
              <h3>
                오늘 <span className={tsnap.pnlPct >= 0 ? "up" : "down"}>{pct(tsnap.pnlPct)}</span>
              </h3>
              <p>
                보유 {tsnap.positions.length}/{TRADING.maxPositions}종목 · 거래 {tsnap.trades.length}건 · 확정 손익{" "}
                {signedWon(tsnap.realized)}
              </p>
              {tsnap.positions.length ? (
                <div className="reason-list">
                  {tsnap.positions.map((p) => (
                    <span key={p.code}>
                      {p.name} {pct((p.last / p.entry - 1) * 100)}
                    </span>
                  ))}
                </div>
              ) : null}
              <button className="btn approve-button" onClick={onOpenTrading}>
                자동매매 화면 열기
              </button>
            </div>
          </section>

          <section className="win rail-card feed-card">
            <div className="win-bar">
              <span>📡 live.feed</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body feed-body">
              {snap.meetingTitle ? <div className="feed-now">💬 회의 진행 중 — {snap.meetingTitle}</div> : null}
              <ul className="feed-list">
                {snap.log.map((entry) => (
                  <li key={entry.id} className={entry.tone}>
                    <b>{entry.time}</b>
                    <i>{entry.icon}</i>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="win rail-card">
            <div className="win-bar">
              <span>👥 staff.roster</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body roster-body">
              {DEPT_ROOMS.map((room) => (
                <div className="roster-dept" key={room.id}>
                  <p>
                    <b>
                      {room.icon} {room.name}
                    </b>
                    <i className={`rm-dot ${statusClass[snap.deptStatus[room.id] ?? "대기"]}`} />
                  </p>
                  <div className="roster-chips">
                    {STAFF.filter((s) => s.deptId === room.id).map((seed) => {
                      const agent = engine.agentById.get(seed.id);
                      return (
                        <button
                          key={seed.id}
                          className={`roster-chip ${selectedId === seed.id ? "on" : ""}`}
                          onClick={() => agent && onSelect(agent)}
                        >
                          <i style={{ background: seed.shirt, borderColor: seed.hair }} />
                          {seed.name}
                          <small>{agent?.status ?? "출근 전"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

const QUICK_ORDERS = [
  { label: "현황 보고", command: "현황 보고해줘" },
  { label: "리스크팀?", command: "리스크팀 지금 뭐해?" },
  { label: "회의 소집", command: "전 부서 회의 소집" },
  { label: "지금 브리핑", command: "지금 브리핑 올라와" },
  { label: "집중 모드", command: "집중 모드" },
  { label: "속도 올려", command: "속도 좀 올려줘" },
];

function CeoConsole({ engine, snap }: { engine: Company; snap: Snapshot }) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const count = snap.chat.length;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    engine.command(value);
    setDraft("");
  };

  return (
    <section className="win rail-card console-card" id="ceo-console">
      <div className="win-bar">
        <span>🎤 ceo.console — 대표 지시창</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body console-body">
        <div className="console-status">
          <span className={`mini-badge ${snap.focusMode ? "yellow" : "mint"}`}>
            {snap.focusMode ? "집중 모드 ON" : "평시 운영"}
          </span>
          {snap.busyWithOrder ? <span className="mini-badge lav">지시 처리 중…</span> : null}
        </div>

        <div className="console-log" ref={logRef}>
          {snap.chat.map((entry) => (
            <div key={entry.id} className={`console-line ${entry.from}`}>
              <b>{entry.from === "ceo" ? "대표님" : entry.name}</b>
              <p>{entry.text}</p>
              <small>{entry.time}</small>
            </div>
          ))}
        </div>

        <div className="console-quick">
          {QUICK_ORDERS.map((item) => (
            <button key={item.label} onClick={() => send(item.command)}>
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="console-input"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="예: 감시팀 지금 뭐해? / 현황 보고"
            aria-label="대표 지시 입력"
          />
          <button type="submit">지시</button>
        </form>
      </div>
    </section>
  );
}

function ProfileModal({
  agent,
  onClose,
  onAsk,
}: {
  agent: Agent;
  onClose: () => void;
  onAsk: (agent: Agent) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} 프로필`}
      >
        <div className="win-bar">
          <span>👤 employee_profile.exe</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body employee-profile">
          <div className="profile-top">
            <PixelEmployee hair={agent.hair} shirt={agent.shirt} accent={agent.accent} />
            <div>
              <span className="status-pill working">{agent.status}</span>
              <h2>
                {agent.name}
                {agent.callsign ? <small> · {agent.callsign}</small> : null}
              </h2>
              <p>{agent.role}</p>
            </div>
          </div>
          <div className="profile-task">
            <span className="tiny-label">지금 하는 일</span>
            <strong>{agent.taskLabel}</strong>
            {agent.anim === "type" ? (
              <span className="profile-progress">
                <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
              </span>
            ) : null}
          </div>
          <div className="report-box">
            <span className="tiny-label">한마디</span>
            <strong>{agent.speech ?? agent.thoughts[0]}</strong>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" onClick={() => onAsk(agent)}>
              🎤 지금 뭐 하는지 물어보기
            </button>
            <button className="text-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BriefingModal({ snap, tsnap, onClose }: { snap: Snapshot; tsnap: TraderSnapshot; onClose: () => void }) {
  const sells = tsnap.trades.filter((t) => t.side === "매도");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="김비서 브리핑"
      >
        <div className="win-bar">
          <span>📋 kim_secretary.brief</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">{snap.clock} · 김세리 비서실장 최종 브리핑</p>
          <h3>대표님, 오늘 매매가 마감됐어요.</h3>
          <ul>
            <li>
              <span className={`dot ${tsnap.pnlPct >= 0 ? "green" : "yellow"}`} />
              오늘 손익 {signedWon(tsnap.realized + tsnap.unrealized)} ({pct(tsnap.pnlPct)}) · {tsnap.brokerLabel}
            </li>
            <li>
              <span className="dot green" />
              {sells.length ? `매도 ${sells.length}건 중 ${wins}건 수익` : "조건 맞는 종목이 없어 매매 없이 마감"}
            </li>
            <li>
              <span className="dot gray" />
              남은 보유 종목 {tsnap.positions.length}개 {tsnap.positions.length ? "— 증권사 앱에서 확인해주세요" : "— 전부 정리됨"}
            </li>
          </ul>
          <div className="decision-box">
            <span className="tiny-label">오늘 대표님이 결정할 것</span>
            <strong>없습니다. 규칙대로 마감했어요. 하루 결과보다 여러 날 흐름을 봐주세요 📈</strong>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

type TeamRow = {
  id: string;
  icon: string;
  name: string;
  room: string;
  lead: (typeof DEPT_LEAD)[string];
  status: DeptStatus;
  task: string;
  report: string;
};

function DashboardView({
  teams,
  filteredTeams,
  filter,
  setFilter,
  snap,
  onStart,
  tsnap,
  kis,
  onSelect,
  integrations,
  publishResult,
}: {
  teams: TeamRow[];
  filteredTeams: TeamRow[];
  filter: "전체" | DeptStatus;
  setFilter: (value: "전체" | DeptStatus) => void;
  snap: Snapshot;
  onStart: () => void;
  tsnap: TraderSnapshot;
  kis: KisStatus | null;
  onSelect: (id: string) => void;
  integrations: IntegrationStatus | null;
  publishResult: PublishResult | null;
}) {
  // 서버가 알려준 실제 설정 상태로 표시한다 (연결됐다고 거짓 보고하지 않는다)
  const liveRows = integrations
    ? [
        {
          name: "Notion 저장",
          status: publishResult?.notion.ok
            ? "저장 성공"
            : integrations.notion?.configured
              ? "키 설정됨"
              : "키 미설정",
          tone: publishResult?.notion.ok ? "mint" : integrations.notion?.configured ? "yellow" : "lav",
          href: "",
        },
        {
          name: "Discord 전송",
          status: publishResult?.discord.ok
            ? "전송 성공"
            : integrations.discord?.configured
              ? "웹훅 설정됨"
              : "웹훅 미설정",
          tone: publishResult?.discord.ok ? "mint" : integrations.discord?.configured ? "yellow" : "lav",
          href: "",
        },
        { name: "Instagram", status: integrations.instagram?.need ?? "연동 대기", tone: "lav", href: "" },
        { name: "Gmail", status: integrations.gmail?.need ?? "연동 대기", tone: "lav", href: "" },
        { name: "재무 파일", status: integrations.finance?.need ?? "자료 대기", tone: "lav", href: "" },
      ]
    : [];
  const brokerRow = {
    name: "증권사 (한국투자증권)",
    status: kis?.configured ? (kis.mode === "real" ? "실전 키 설정됨" : "모의투자 키 설정됨") : "미설정 · 연습 모드",
    tone: kis?.configured ? (kis.mode === "real" ? "yellow" : "mint") : "lav",
    href: "",
  };
  const rows = [brokerRow, ...integrations2Static, ...liveRows];
  const sells = tsnap.trades.filter((t) => t.side === "매도");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;

  return (
    <>
      <header className="win hero">
        <div className="win-bar">
          <span>🎀 {COMPANY.windowLabel}</span>
          <span className="window-controls" aria-hidden="true">
            —　▢　✕
          </span>
        </div>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="eyebrow">TODAY · ONE CLICK AUTO TRADING</p>
            <h1>
              오늘 트레이딩룸이 어떻게 움직이는지 <em className="highlight">한눈에</em> 보여드려요
            </h1>
            <p>규칙은 대표님, 실행은 AI. 12개 팀 32명이 분석부터 매매·정산·브리핑까지 한 흐름으로 돌려요.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onStart} disabled={snap.running}>
              {snap.running ? "트레이딩룸 가동 중…" : "▶ 오늘 매매 시작하기"}
            </button>
            <span className="trust-copy">실전(진짜 돈) 주문은 확인 체크를 한 뒤에만 나가요</span>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="오늘 업무 요약">
        <article className="metric yellow">
          <span>AI 직원</span>
          <strong>32</strong>
          <small>STAFF</small>
        </article>
        <article className="metric mint">
          <span>완료</span>
          <strong>{snap.stats.done}</strong>
          <small>DONE</small>
        </article>
        <article className="metric pink">
          <span>진행 중</span>
          <strong>{snap.stats.working}</strong>
          <small>WORKING</small>
        </article>
        <article className={`metric ${tsnap.pnlPct >= 0 ? "lav" : "pink"}`}>
          <span>오늘 수익률</span>
          <strong>{pct(tsnap.pnlPct)}</strong>
          <small>RETURN</small>
        </article>
        <article className="metric white">
          <span>매도 승률</span>
          <strong>{sells.length ? `${wins}/${sells.length}` : "—"}</strong>
          <small>WIN</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="side-stack">
          <section className="win">
            <div className="win-bar">
              <span>⚡ automation.status</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="schedule-card">
                <div>
                  <span className="tiny-label">실행 방식</span>
                  <strong>버튼 한 번 · 딸깍</strong>
                  <p>이 화면이 열려 있는 동안 자동으로 진행돼요</p>
                </div>
                <span className="toggle-on">{tsnap.running ? "ON" : "대기"}</span>
              </div>
              <div className="flow-list">
                {PHASES.slice(1, 12).map((item, index) => (
                  <div className={`flow-row ${snap.phaseIndex > index + 1 ? "past" : ""}`} key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{item}</b>
                    <i>{snap.phaseIndex === index + 1 ? "●" : snap.phaseIndex > index + 1 ? "✓" : "·"}</i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🔗 integrations.link</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body integration-list">
              {rows.map((item) =>
                item.href ? (
                  <a key={item.name} href={item.href} target="_blank" rel="noreferrer" className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </a>
                ) : (
                  <div key={item.name} className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </div>
                ),
              )}
            </div>
          </section>
        </aside>

        <div className="main-stack">
          <section className="win">
            <div className="win-bar">
              <span>🏢 team_office.board</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LIVE OFFICE</p>
                  <h2>12개 부서 · 팀장 12명 근무 현황</h2>
                </div>
                <div className="filter-tabs" role="group" aria-label="팀 상태 필터">
                  {(["전체", "진행 중", "완료", "승인 대기", "연동 대기"] as const).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="team-grid">
                {filteredTeams.map((team) => (
                  <button className="team-card" key={team.id} onClick={() => onSelect(team.lead.id)}>
                    <span className={`status-dot ${statusClass[team.status]}`} aria-hidden="true" />
                    <span className="mini-pixel">
                      <PixelEmployee hair={team.lead.hair} shirt={team.lead.shirt} accent={team.lead.accent} />
                    </span>
                    <span className="team-copy">
                      <b>
                        {team.lead.name} · {team.name}
                      </b>
                      <small>{team.task}</small>
                    </span>
                    <span className={`status-pill ${statusClass[team.status]}`}>{team.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="two-col">
            <section className="win">
              <div className="win-bar">
                <span>💹 trading.summary</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body approval-body">
                <div className="approval-top">
                  <span className="mini-badge yellow">{tsnap.brokerLabel}</span>
                  <span className="score">{tsnap.phase}</span>
                </div>
                <h3>
                  오늘 손익 <span className={tsnap.pnlPct >= 0 ? "up" : "down"}>{signedWon(tsnap.realized + tsnap.unrealized)}</span>
                </h3>
                <p>
                  운용 자금 {tsnap.capital ? won(tsnap.capital) : "—"} · 수익률 {pct(tsnap.pnlPct)} (목표 +{TRADING.dailyTargetPct}%) ·
                  보유 {tsnap.positions.length}종목
                </p>
                <button className="btn approve-button" onClick={onStart} disabled={snap.running}>
                  {snap.running ? "자동매매 진행 중" : "▶ 오늘 매매 시작하기"}
                </button>
              </div>
            </section>

            <section className="win secretary">
              <div className="win-bar">
                <span>📋 kim_secretary.brief</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body">
                <p className="brief-date">{snap.clock} 현재</p>
                <h3>{snap.dayComplete ? "대표님, 오늘 매매가 마감됐어요." : "대표님, 현재 진행 상황이에요."}</h3>
                <ul>
                  <li>
                    <span className="dot green" />
                    {snap.phase || "출근 전"} — 완료 {snap.stats.done}팀
                  </li>
                  <li>
                    <span className={`dot ${tsnap.pnlPct >= 0 ? "green" : "yellow"}`} />
                    {sells.length ? `매도 ${sells.length}건 중 ${wins}건 수익` : "아직 매도 없음"}
                  </li>
                  <li>
                    <span className="dot gray" />
                    {kis?.configured ? "증권사 연결됨" : "증권사 미연결 — 연습 시장으로 운영 중"}
                  </li>
                </ul>
                <div className="decision-box">
                  <span className="tiny-label">대표님이 할 일</span>
                  <strong>
                    {snap.running
                      ? "없어요. 규칙대로 돌아가는 중이에요."
                      : snap.dayComplete
                        ? "결과만 확인하시면 돼요."
                        : "‘오늘 매매 시작하기’ 한 번만 눌러주세요."}
                  </strong>
                </div>
              </div>
            </section>
          </section>
        </div>
      </section>

      <section className="win storage">
        <div className="win-bar">
          <span>📦 result_storage</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECENT TRADES</p>
              <h2>오늘 거래 내역</h2>
            </div>
            {STORAGE_LINK ? (
              <a className="btn btn-small" href={STORAGE_LINK} target="_blank" rel="noreferrer">
                보관함 열기
              </a>
            ) : null}
          </div>
          <div className="result-table">
            <div className="result-row header">
              <span>종목</span>
              <span>구분</span>
              <span>가격·수량</span>
              <span>손익</span>
            </div>
            {tsnap.trades.length ? (
              tsnap.trades.slice(0, 8).map((t) => (
                <div className="result-row" key={t.id}>
                  <b>
                    {t.time} {t.name}
                  </b>
                  <span>{t.side}</span>
                  <span>
                    {won(t.price)} × {t.qty}
                  </span>
                  <span className={t.pnl === undefined ? "" : t.pnl >= 0 ? "up" : "down"}>
                    {t.pnl === undefined ? "—" : signedWon(t.pnl)}
                  </span>
                </div>
              ))
            ) : (
              <div className="result-row">
                <b>아직 거래가 없어요</b>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="dash-note">
        대표 {CEO.name}({CEO.callsign}) · AI 직원 {teams.length}개 부서 32명 · 이 화면은 라이브 오피스·자동매매와 같은
        상태를 공유해요. 수익은 보장되지 않아요.
      </p>
    </>
  );
}
