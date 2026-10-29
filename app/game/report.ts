// 라이브 오피스의 하루 결과 → 보고서로 변환하고 서버(/api/report)로 발행한다
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY } from "../../company.config";

export type DayReport = {
  title: string;
  clock: string;
  phase: string;
  counts: { total: number; done: number; working: number; approval: number; blocked: number };
  highlights: string[];
  decisions: string[];
  risks: string[];
  next: string[];
  log: { time: string; text: string }[];
};

export type PublishResult = {
  notion: { ok: boolean; status: string; detail?: string; url?: string };
  discord: { ok: boolean; status: string; detail?: string };
  publishedAt: string;
};

export type IntegrationStatus = Record<
  string,
  { configured: boolean; label: string; need?: string }
>;

/** 자동매매 결과 요약 (트레이딩 데스크에서 넘겨받는다) */
export type TradingDigest = { summary: string; trades: string[]; holding: number };

export function buildReport(snap: Snapshot, trading?: TradingDigest): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = entries
    .filter(([, status]) => status === "연동 대기")
    .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연동"} 대기로 오늘 진행 불가`);

  if (trading) highlights.unshift(`자동매매 — ${trading.summary}`, ...trading.trades.slice(0, 10));

  const decisions = trading?.holding
    ? [`남은 보유 종목 ${trading.holding}개 — 증권사 앱에서 직접 확인 필요`]
    : ["오늘 대표 결정 사항 없음 (규칙대로 마감)"];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연동 완료되면 즉시 재가동`),
    "여러 날 결과를 모아 매매 규칙 점검 (규칙 변경은 모의투자로 먼저)",
  ];

  return {
    title: `${snap.clock} ${COMPANY.reportName} 일일 브리핑`,
    clock: snap.clock,
    phase: snap.phase,
    counts: {
      total: entries.length,
      done: snap.stats.done,
      working: snap.stats.working,
      approval: snap.stats.approval,
      blocked: snap.stats.blocked,
    },
    highlights,
    decisions,
    risks,
    next,
    log: [...snap.log].reverse().map((entry) => ({ time: entry.time, text: `${entry.icon} ${entry.text}` })),
  };
}

export async function publish(report: DayReport): Promise<PublishResult> {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`발행 실패 (HTTP ${response.status})`);
  return (await response.json()) as PublishResult;
}

export async function fetchIntegrations(): Promise<IntegrationStatus> {
  const response = await fetch("/api/integrations");
  if (!response.ok) throw new Error("연동 상태 조회 실패");
  return (await response.json()) as IntegrationStatus;
}
