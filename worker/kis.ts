/**
 * 한국투자증권(KIS) Open API 연결 — 트레이딩 데스크가 시세를 읽고 주문을 넣는 통로.
 *
 * 비밀값은 코드에 두지 않는다. 로컬은 `.dev.vars`, 배포는 `wrangler secret put`.
 *   KIS_APP_KEY        앱키
 *   KIS_APP_SECRET     앱시크릿
 *   KIS_ACCOUNT_NO     계좌번호 "12345678-01" (앞 8자리-뒤 2자리)
 *   KIS_MODE           "paper"(모의투자, 기본) 또는 "real"(실전 — 진짜 돈)
 *   KIS_MAX_ORDER_KRW  한 번 주문 상한(원). 화면 설정과 별개로 서버가 한 번 더 막는다. 기본 1,000,000
 */

export type KisEnv = {
  KIS_APP_KEY?: string;
  KIS_APP_SECRET?: string;
  KIS_ACCOUNT_NO?: string;
  KIS_MODE?: string;
  KIS_MAX_ORDER_KRW?: string;
};

type Mode = "paper" | "real";

const BASE: Record<Mode, string> = {
  real: "https://openapi.koreainvestment.com:9443",
  paper: "https://openapivts.koreainvestment.com:29443",
};

/** 주문 TR — 실전 T, 모의 V */
const TR = {
  buy: { real: "TTTC0012U", paper: "VTTC0012U" },
  sell: { real: "TTTC0011U", paper: "VTTC0011U" },
  balance: { real: "TTTC8434R", paper: "VTTC8434R" },
} as const;

function modeOf(env: KisEnv): Mode {
  return env.KIS_MODE?.trim().toLowerCase() === "real" ? "real" : "paper";
}

function configured(env: KisEnv) {
  return Boolean(env.KIS_APP_KEY && env.KIS_APP_SECRET && /^\d{8}-?\d{2}$/.test(env.KIS_ACCOUNT_NO?.trim() ?? ""));
}

function account(env: KisEnv) {
  const digits = (env.KIS_ACCOUNT_NO ?? "").replace(/\D/g, "");
  return { CANO: digits.slice(0, 8), ACNT_PRDT_CD: digits.slice(8, 10) };
}

// ── 토큰 캐시 (발급은 1분에 1번 제한이라 하루짜리 토큰을 재사용한다) ──
let token: { value: string; mode: Mode; expires: number } | null = null;

async function accessToken(env: KisEnv): Promise<string> {
  const mode = modeOf(env);
  if (token && token.mode === mode && token.expires > Date.now() + 60_000) return token.value;

  const response = await fetch(`${BASE[mode]}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? `토큰 발급 실패 (HTTP ${response.status})`);
  }
  token = { value: json.access_token, mode, expires: Date.now() + (json.expires_in ?? 86_400) * 1000 };
  return token.value;
}

// ── 호출 간격 제한 (모의투자는 초당 2건 안팎이라 순서대로 줄 세운다) ──
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 550 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    return job();
  });
  queue = run.catch(() => undefined);
  return run;
}

type KisResponse = { rt_cd?: string; msg1?: string; output?: unknown; output1?: unknown; output2?: unknown };

async function call(
  env: KisEnv,
  path: string,
  trId: string,
  init: { query?: Record<string, string>; body?: Record<string, string> },
): Promise<KisResponse> {
  return throttled(async () => {
    const mode = modeOf(env);
    const url = new URL(`${BASE[mode]}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);

    const response = await fetch(url, {
      method: init.body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        authorization: `Bearer ${await accessToken(env)}`,
        appkey: env.KIS_APP_KEY ?? "",
        appsecret: env.KIS_APP_SECRET ?? "",
        tr_id: trId,
        custtype: "P",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await response.json().catch(() => ({}))) as KisResponse;
    if (!response.ok || json.rt_cd !== "0") {
      throw new Error(json.msg1?.trim() || `KIS 호출 실패 (HTTP ${response.status})`);
    }
    return json;
  });
}

const num = (value: unknown) => Number(value ?? 0) || 0;

async function quote(env: KisEnv, code: string) {
  const json = await call(env, "/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
    query: { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
  });
  const o = json.output as Record<string, string>;
  return {
    code,
    price: num(o.stck_prpr),
    open: num(o.stck_oprc),
    high: num(o.stck_hgpr),
    low: num(o.stck_lwpr),
    changePct: num(o.prdy_ctrt),
    volume: num(o.acml_vol),
  };
}

/** 일봉 (오래된 날 → 최근 날 순서). 장중이면 마지막 줄이 오늘이다 */
async function daily(env: KisEnv, code: string) {
  const json = await call(env, "/uapi/domestic-stock/v1/quotations/inquire-daily-price", "FHKST01010400", {
    query: { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code, FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "0" },
  });
  const rows = (json.output as Record<string, string>[]) ?? [];
  return rows
    .map((r) => ({
      date: r.stck_bsop_date,
      open: num(r.stck_oprc),
      high: num(r.stck_hgpr),
      low: num(r.stck_lwpr),
      close: num(r.stck_clpr),
      volume: num(r.acml_vol),
    }))
    .filter((c) => c.close > 0)
    .reverse();
}

async function balance(env: KisEnv) {
  const mode = modeOf(env);
  const json = await call(env, "/uapi/domestic-stock/v1/trading/inquire-balance", TR.balance[mode], {
    query: {
      ...account(env),
      AFHR_FLPR_YN: "N",
      OFL_YN: "",
      INQR_DVSN: "02",
      UNPR_DVSN: "01",
      FUND_STTL_ICLD_YN: "N",
      FNCG_AMT_AUTO_RDPT_YN: "N",
      PRCS_DVSN: "00",
      CTX_AREA_FK100: "",
      CTX_AREA_NK100: "",
    },
  });
  const holdings = ((json.output1 as Record<string, string>[]) ?? [])
    .map((h) => ({
      code: h.pdno,
      name: h.prdt_name,
      qty: num(h.hldg_qty),
      avgPrice: num(h.pchs_avg_pric),
      price: num(h.prpr),
    }))
    .filter((h) => h.qty > 0);
  const summary = ((json.output2 as Record<string, string>[]) ?? [])[0] ?? {};
  // 가수도정산금액(D+2 예수금)이 당일 매도 대금까지 반영돼 주문 가능 현금에 가깝다
  const cash = num(summary.prvs_rcdl_excc_amt) || num(summary.dnca_tot_amt);
  return { cash, holdings };
}

async function order(env: KisEnv, side: "buy" | "sell", code: string, qty: number) {
  if (!/^\d{6}$/.test(code)) throw new Error("종목코드는 6자리 숫자여야 해요");
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("수량이 올바르지 않아요");

  if (side === "buy") {
    // 화면 설정과 별개로 서버에서 한 번 더 금액 상한을 지킨다
    const cap = num(env.KIS_MAX_ORDER_KRW) || 1_000_000;
    const { price } = await quote(env, code);
    if (price * qty > cap) {
      throw new Error(`주문 금액 ${Math.round(price * qty).toLocaleString()}원이 서버 상한 ${cap.toLocaleString()}원을 넘어요`);
    }
  }

  const mode = modeOf(env);
  const json = await call(env, "/uapi/domestic-stock/v1/trading/order-cash", TR[side][mode], {
    body: {
      ...account(env),
      PDNO: code,
      ORD_DVSN: "01", // 시장가
      ORD_QTY: String(qty),
      ORD_UNPR: "0",
    },
  });
  const output = (json.output ?? {}) as Record<string, string>;
  return { ok: true, orderNo: output.ODNO ?? "", message: json.msg1?.trim() ?? "주문 접수" };
}

/** 키 값은 절대 내보내지 않고, 설정 여부와 모드만 알려준다 */
export function kisStatus(env: KisEnv) {
  return {
    configured: configured(env),
    mode: modeOf(env),
    maxOrderKRW: num(env.KIS_MAX_ORDER_KRW) || 1_000_000,
  };
}

/** /api/trade/* 요청 처리 */
export async function handleTrade(request: Request, env: KisEnv): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.replace("/api/trade/", "");

  if (action === "status") return Response.json(kisStatus(env));
  if (!configured(env)) {
    return Response.json({ error: "한국투자증권 키가 설정되지 않았어요 (.dev.vars)" }, { status: 400 });
  }

  try {
    const code = url.searchParams.get("code") ?? "";
    if (action === "quote") return Response.json(await quote(env, code));
    if (action === "daily") return Response.json(await daily(env, code));
    if (action === "balance") return Response.json(await balance(env));
    if (action === "order") {
      if (request.method !== "POST") return new Response("POST only", { status: 405 });
      const body = (await request.json()) as { side?: string; code?: string; qty?: number };
      if (body.side !== "buy" && body.side !== "sell") throw new Error("side는 buy 또는 sell");
      return Response.json(await order(env, body.side, body.code ?? "", Number(body.qty)));
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
