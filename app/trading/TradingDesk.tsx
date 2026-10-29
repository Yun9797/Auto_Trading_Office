"use client";

import { useSyncExternalStore } from "react";
import { TRADING } from "../../company.config";
import type { AutoTrader, Phase } from "./autotrader";
import type { KisStatus } from "./brokers";

export type DeskMode = "sim" | "kis";

const PIPELINE: { label: string; phases: Phase[] }[] = [
  { label: "① 분석", phases: ["분석"] },
  { label: "② 전략", phases: ["전략"] },
  { label: "③ 매수·감시", phases: ["개장 대기", "매매 중"] },
  { label: "④ 매도·정리", phases: ["정리"] },
  { label: "⑤ 정산", phases: ["종료"] },
];

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value).toLocaleString("ko-KR")}원`;
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function TradingDesk({
  trader,
  kis,
  mode,
  setMode,
  onStart,
  officeRunning,
  realConfirmed,
  setRealConfirmed,
}: {
  trader: AutoTrader;
  kis: KisStatus | null;
  mode: DeskMode;
  setMode: (mode: DeskMode) => void;
  /** 사무실 하루 시작 (출근 → 분석 → … → 자동매매 → 정산) */
  onStart: () => void;
  officeRunning: boolean;
  realConfirmed: boolean;
  setRealConfirmed: (value: boolean) => void;
}) {
  const snap = useSyncExternalStore(trader.subscribe, trader.getSnapshot, trader.getSnapshot);
  const isReal = mode === "kis" && kis?.mode === "real";
  const activeStep = PIPELINE.findIndex((step) => step.phases.includes(snap.phase));
  const sells = snap.trades.filter((t) => t.side === "매도");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const total = snap.realized + snap.unrealized;

  return (
    <>
      <header className="win hero">
        <div className="win-bar">
          <span>💹 trading_desk.exe — 자동매매</span>
          <span className="window-controls" aria-hidden="true">
            —　▢　✕
          </span>
        </div>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="eyebrow">
              AUTO TRADING · {snap.running ? snap.brokerLabel : mode === "sim" ? "🧪 연습 모드" : kis?.mode === "real" ? "💰 실전" : "📝 모의투자"}
            </p>
            <h1>
              버튼 한 번이면 <em className="highlight">분석부터 정산까지</em>
            </h1>
            <p>
              김서연이 종목을 분석하고, 최아름이 전략을 세우고, 안도현이 사고팔고, 윤규아가 손실을 막고, 오재민이 정산해요.
            </p>
          </div>
          <div className="hero-actions">
            <div className="td-modes" role="group" aria-label="매매 방식">
              <button className={mode === "sim" ? "on" : ""} onClick={() => setMode("sim")} disabled={snap.running}>
                🧪 연습
              </button>
              <button
                className={mode === "kis" ? "on" : ""}
                onClick={() => setMode("kis")}
                disabled={snap.running || !kis?.configured}
                title={kis?.configured ? "" : ".dev.vars 에 한국투자증권 키를 넣으면 열려요"}
              >
                {kis?.mode === "real" ? "💰 실전" : "📝 모의투자"}
                {kis?.configured ? "" : " (미설정)"}
              </button>
            </div>
            {isReal && !snap.running ? (
              <label className="td-real-check">
                <input type="checkbox" checked={realConfirmed} onChange={(e) => setRealConfirmed(e.target.checked)} />
                진짜 돈으로 주문이 나가고, 손실이 날 수 있다는 걸 이해했어요
              </label>
            ) : null}
            {snap.running ? (
              <div className="td-stop-row">
                <button className="btn btn-ghost" onClick={() => trader.stop()}>
                  ⏸ 멈추기
                </button>
                <button className="btn td-danger" onClick={() => void trader.sellAllAndStop()}>
                  전량 매도 후 멈추기
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={onStart} disabled={officeRunning || (isReal && !realConfirmed)}>
                {officeRunning ? "정산·브리핑 중…" : "▶ 오늘 매매 시작하기"}
              </button>
            )}
            <span className="trust-copy">
              {mode === "sim"
                ? "가짜 시장·가짜 돈이에요. 약 3분이면 하루 장이 끝나요."
                : "이 탭이 열려 있는 동안만 돌아가요. 닫으면 멈춥니다."}
            </span>
          </div>
        </div>
      </header>

      <section className="td-pipeline" aria-label="진행 단계">
        {PIPELINE.map((step, index) => (
          <span key={step.label} className={index === activeStep ? "now" : activeStep > index ? "past" : ""}>
            {step.label}
          </span>
        ))}
        <b>
          {snap.clock} · {snap.phase}
          {snap.noNewBuys ? " · 새 매수 중단" : ""}
        </b>
      </section>

      <section className="summary-grid" aria-label="오늘 손익">
        <article className="metric yellow">
          <span>운용 자금</span>
          <strong className="td-num">{snap.capital ? won(snap.capital) : "—"}</strong>
          <small>CAPITAL</small>
        </article>
        <article className={`metric ${total >= 0 ? "mint" : "pink"}`}>
          <span>오늘 손익</span>
          <strong className="td-num">{signed(total)}</strong>
          <small>P&amp;L</small>
        </article>
        <article className={`metric ${snap.pnlPct >= 0 ? "mint" : "pink"}`}>
          <span>수익률 (목표 +{TRADING.dailyTargetPct}%)</span>
          <strong>{pct(snap.pnlPct)}</strong>
          <small>RETURN</small>
        </article>
        <article className="metric lav">
          <span>보유 / 최대</span>
          <strong>
            {snap.positions.length}/{TRADING.maxPositions}
          </strong>
          <small>POSITIONS</small>
        </article>
        <article className="metric white">
          <span>매도 승률</span>
          <strong>{sells.length ? `${wins}/${sells.length}` : "—"}</strong>
          <small>WIN</small>
        </article>
      </section>

      <section className="two-col td-cols">
        <section className="win">
          <div className="win-bar">
            <span>📦 positions — 보유 종목</span>
            <span className="window-controls">—　▢　✕</span>
          </div>
          <div className="win-body td-scroll">
            {snap.positions.length ? (
              <table className="td-table">
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>수량</th>
                    <th>매수가</th>
                    <th>현재가</th>
                    <th>수익률</th>
                    <th>익절 / 손절</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.positions.map((p) => {
                    const change = (p.last / p.entry - 1) * 100;
                    return (
                      <tr key={p.code}>
                        <td>
                          <b>{p.name}</b>
                          <small>{p.boughtAt} 매수</small>
                        </td>
                        <td>{p.qty}</td>
                        <td>{won(p.entry)}</td>
                        <td>{won(p.last)}</td>
                        <td className={change >= 0 ? "up" : "down"}>{pct(change)}</td>
                        <td>
                          {won(p.entry * (1 + TRADING.takeProfitPct / 100))}
                          <small>{won(p.entry * (1 - TRADING.stopLossPct / 100))}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="td-empty">{snap.running ? "돌파 신호를 기다리는 중이에요." : "아직 산 종목이 없어요."}</p>
            )}
          </div>
        </section>

        <section className="win">
          <div className="win-bar">
            <span>🧾 trades — 거래 내역</span>
            <span className="window-controls">—　▢　✕</span>
          </div>
          <div className="win-body td-scroll">
            {snap.trades.length ? (
              <ul className="td-trades">
                {snap.trades.map((t) => (
                  <li key={t.id}>
                    <b>{t.time}</b>
                    <span className={`mini-badge ${t.side === "매수" ? "yellow" : (t.pnl ?? 0) >= 0 ? "mint" : "lav"}`}>{t.side}</span>
                    <span>
                      {t.name} {t.qty}주 @ {won(t.price)}
                      <small>{t.reason}</small>
                    </span>
                    {t.pnl !== undefined ? <i className={t.pnl >= 0 ? "up" : "down"}>{signed(t.pnl)}</i> : <i />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-empty">거래가 생기면 여기에 쌓여요.</p>
            )}
          </div>
        </section>
      </section>

      <section className="two-col td-cols">
        <section className="win">
          <div className="win-bar">
            <span>🔎 analysis — 종목 분석</span>
            <span className="window-controls">—　▢　✕</span>
          </div>
          <div className="win-body td-scroll">
            {snap.signals.length ? (
              <table className="td-table">
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>현재가</th>
                    <th>돌파가</th>
                    <th>RSI</th>
                    <th>점수</th>
                    <th>판단</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.signals.map((s) => (
                    <tr key={s.code} title={s.reasons.join(" · ")}>
                      <td>
                        <b>{s.name}</b>
                        <small>{s.ma5 > s.ma20 ? "상승 추세" : "하락 추세"}</small>
                      </td>
                      <td>{won(s.price)}</td>
                      <td>{won(s.target)}</td>
                      <td>{s.rsi.toFixed(0)}</td>
                      <td>{s.score}</td>
                      <td>
                        <span className={`status-pill ${s.decision === "매수" ? "done" : s.decision === "관심" ? "approval" : "waiting"}`}>
                          {s.decision}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="td-empty">시작하면 감시 종목 {TRADING.watchlist.length}개를 분석해요.</p>
            )}
            {snap.skipped.length ? <p className="td-note">분석 못 한 종목: {snap.skipped.join(" / ")}</p> : null}
          </div>
        </section>

        <section className="win">
          <div className="win-bar">
            <span>📡 desk.log — 데스크 대화</span>
            <span className="window-controls">—　▢　✕</span>
          </div>
          <div className="win-body td-scroll">
            {snap.log.length ? (
              <ul className="feed-list">
                {snap.log.map((entry) => (
                  <li key={entry.id} className={entry.tone}>
                    <b>{entry.time}</b>
                    <i>{TRADING.desk[entry.role].name}</i>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="td-empty">데스크 직원들의 대화가 여기 떠요. 사무실 피드에도 같이 올라가요.</p>
            )}
          </div>
        </section>
      </section>

      <section className="win td-rules">
        <div className="win-bar">
          <span>🛡️ rules — 매매 규칙 (company.config.ts 에서 변경)</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <ul>
            <li>
              <b>사는 조건</b> 5일선 &gt; 20일선(상승 추세) + 오늘 가격이 &quot;시가 + 어제 변동폭 × {TRADING.breakoutK}&quot; 돌파 + RSI 75 미만
            </li>
            <li>
              <b>파는 조건</b> +{TRADING.takeProfitPct}% 익절 · -{TRADING.stopLossPct}% 손절 · {TRADING.closeAllTime} 남은 것 전부 매도
            </li>
            <li>
              <b>하루 한도</b> 확정 수익 +{TRADING.dailyTargetPct}% 면 새 매수 중단 · 손실 -{TRADING.dailyLossLimitPct}% 면 전부 팔고 종료
            </li>
            <li>
              <b>금액 한도</b> 최대 {TRADING.maxPositions}종목 · 종목당 {won(TRADING.maxOrderKRW)}
              {kis?.configured ? ` · 서버 주문 상한 ${won(kis.maxOrderKRW)}` : ""} · 원래 계좌에 있던 종목은 안 건드림
            </li>
          </ul>
          <p className="td-note">
            ⚠️ 목표 수익률은 &quot;목표&quot;일 뿐 보장이 아니에요. 손실 나는 날도 반드시 있어요. 실전은 모의투자로 충분히
            확인한 뒤 작은 금액으로 시작하세요. 수익률엔 수수료·세금 {TRADING.costPct}% 가정이 반영돼 있어요.
          </p>
        </div>
      </section>
    </>
  );
}
