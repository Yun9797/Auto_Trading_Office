// 공시 점검 — 서버(/api/dart)에서 최근 공시를 받아 위험 단어가 들어간 종목을 골라낸다
import { TRADING } from "../../company.config";

export type DisclosureHit = { code: string; name: string; title: string; word: string; date: string; url: string };

export type DisclosureCheck =
  | { configured: false }
  | { configured: true; hits: DisclosureHit[]; total: number; partial: boolean };

type DartReply = {
  configured?: boolean;
  items?: { code: string; name: string; title: string; date: string; url: string }[];
  partial?: boolean;
  error?: string;
};

export async function checkDisclosures(codes: string[]): Promise<DisclosureCheck> {
  const query = new URLSearchParams({ codes: codes.join(","), days: String(TRADING.disclosure.lookbackDays) });
  const response = await fetch(`/api/dart/disclosures?${query}`);
  const json = (await response.json().catch(() => ({}))) as DartReply;
  if (!response.ok || json.error) throw new Error(json.error ?? `HTTP ${response.status}`);
  if (!json.configured) return { configured: false };

  const items = json.items ?? [];
  const hits: DisclosureHit[] = [];
  for (const item of items) {
    const word = TRADING.disclosure.blockWords.find((w) => item.title.includes(w));
    if (word && !hits.some((h) => h.code === item.code)) hits.push({ ...item, word });
  }
  return { configured: true, hits, total: items.length, partial: Boolean(json.partial) };
}
