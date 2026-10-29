/**
 * 금융감독원 DART 공시 조회 — 아침 분석 때 감시 종목에 위험한 공시가 났는지 확인하는 통로.
 *
 * 비밀값은 코드에 두지 않는다. 로컬은 `.dev.vars`, 배포는 `wrangler secret put`.
 *   DART_API_KEY   https://opendart.fss.or.kr 에서 무료로 받는 인증키 (40자리)
 *
 * ⚠️ DART 는 오래된 TLS 암호화만 받아서 Cloudflare 워커에서는 접속이 안 된다.
 *    개발 서버에서는 build/dart-relay-plugin.ts 가 Node 로 이 함수를 대신 돌린다.
 */

export type DartEnv = {
  DART_API_KEY?: string;
};

export type Disclosure = { code: string; name: string; title: string; date: string; url: string };

type DartList = {
  status?: string;
  message?: string;
  total_page?: number;
  list?: { stock_code?: string; corp_name?: string; report_nm?: string; rcept_dt?: string; rcept_no?: string }[];
};

/** 한 번에 너무 오래 걸리지 않게 페이지 수를 제한 (100건 × 60쪽) */
const MAX_PAGES = 60;

function seoulDate(daysAgo: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() - daysAgo * 86_400_000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

// 같은 조건이면 10분 동안 다시 묻지 않는다
let cache: { key: string; at: number; result: { items: Disclosure[]; partial: boolean } } | null = null;

async function recent(env: DartEnv, codes: Set<string>, days: number) {
  const begin = seoulDate(Math.max(0, days - 1));
  const end = seoulDate(0);
  const key = `${begin}-${end}-${[...codes].sort().join(",")}`;
  if (cache && cache.key === key && Date.now() - cache.at < 10 * 60_000) return cache.result;

  const items: Disclosure[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL("https://opendart.fss.or.kr/api/list.json");
    url.searchParams.set("crtfc_key", env.DART_API_KEY ?? "");
    url.searchParams.set("bgn_de", begin);
    url.searchParams.set("end_de", end);
    url.searchParams.set("page_no", String(page));
    url.searchParams.set("page_count", "100");
    const response = await fetch(url);
    const json = (await response.json().catch(() => ({}))) as DartList;
    if (json.status === "013") break; // 조회된 공시 없음
    if (!response.ok || json.status !== "000") {
      throw new Error(json.message?.trim() || `DART 호출 실패 (HTTP ${response.status})`);
    }
    for (const row of json.list ?? []) {
      const code = row.stock_code?.trim() ?? "";
      if (!codes.has(code)) continue;
      items.push({
        code,
        name: row.corp_name ?? code,
        title: (row.report_nm ?? "").replace(/\s+/g, " ").trim(),
        date: row.rcept_dt ?? "",
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.rcept_no ?? ""}`,
      });
    }
    totalPages = json.total_page ?? 1;
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGES);

  const result = { items, partial: totalPages > MAX_PAGES };
  cache = { key, at: Date.now(), result };
  return result;
}

/** /api/dart/disclosures?codes=005930,000660&days=4 — 키 값은 절대 내보내지 않는다 */
export async function handleDart(request: Request, env: DartEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dart/disclosures") return new Response("Not found", { status: 404 });
  if (!env.DART_API_KEY?.trim()) return Response.json({ configured: false, items: [], partial: false });

  const codes = new Set((url.searchParams.get("codes") ?? "").split(",").filter((c) => /^\d{6}$/.test(c)));
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 4, 1), 14);
  if (!codes.size) return Response.json({ error: "종목코드가 없어요" }, { status: 400 });

  try {
    return Response.json({ configured: true, ...(await recent(env, codes, days)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
