// ============================================================
//  나의 AI 회사 설정 — 여기 한 파일만 고치면 됩니다
// ============================================================
//  회사 이름, 부서 이름, 직원 이름·성격·머리색까지 전부 여기 있어요.
//  다른 파일은 건드리지 않아도 됩니다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id(research, brand, ...)는 절대 바꾸지 마세요. 시뮬레이션 엔진이
//      이 id로 움직입니다. 바꾸면 캐릭터가 길을 잃어요.
//      → 바꿔도 되는 건 name(부서 이름) · icon · short 입니다.
//   2. 부서는 12개를 유지하세요. 사무실 배치가 4열 3행 = 12칸 고정입니다.
//      안 쓰는 부서는 지우지 말고 이름만 바꿔서 쓰세요.
//
//  직원 수는 자유롭게 늘리고 줄여도 됩니다. 한 팀에 팀장(lead) 1명은 두세요.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "AUTO B.S",
  /** 헤더 로고 배지에 들어갈 글자 1개 (이모지도 됩니다) */
  logoLetter: "B",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "Auto",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "B.S Office",
  /** 브라우저 탭 제목 */
  pageTitle: "Auto B.S — AI 자동매매 오피스",
  /** 검색·공유될 때 뜨는 설명 */
  description: "버튼 한 번에 12개 AI 팀이 분석·전략·매매·정산까지 돌리는 주식 자동매매 오피스",
  /** 창 하단 파일명 느낌의 라벨 */
  windowLabel: "auto_bs.exe — 트레이딩룸",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "Auto B.S",
} as const;

/** 대표(나) — 사무실 대표실에 앉아 있는 캐릭터 */
export const CEO_PROFILE = {
  name: "김대표",
  callsign: "대표님",
  role: "대표 · 매매 규칙 결정",
  hair: "#42283a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "규칙은 내가 정하고, 실행은 AI가 해요.",
    "손절 규칙만 지키면 오래 간다.",
    "하루 결과에 흔들리지 말자.",
  ],
};

/**
 * 부서 12개.
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "시장분석팀",
    short: "market.lab",
    icon: "🔎",
    task: "감시 종목 일봉·시세 분석",
    report: "추세·RSI·변동폭으로 종목별 점수표를 만들어요.",
  },
  {
    id: "brand",
    name: "수급·뉴스팀",
    short: "flow.watch",
    icon: "📰",
    task: "거래량·수급·뉴스 이상 신호 점검",
    report: "갑자기 튀는 종목은 따로 표시해둬요.",
  },
  {
    id: "strategy1",
    name: "전략팀",
    short: "strategy.room",
    icon: "🧠",
    task: "돌파가·익절가·손절가 계산",
    report: "규칙에 맞는 종목만 매수 후보로 올려요.",
  },
  {
    id: "qa",
    name: "리스크관리팀",
    short: "risk.guard",
    icon: "🛡️",
    task: "종목 수·금액·손실 한도 점검",
    report: "손절선 없이 들어가는 매매는 없습니다.",
  },
  {
    id: "strategy2",
    name: "실시간 감시팀",
    short: "live.monitor",
    icon: "👀",
    task: "보유 종목 실시간 감시",
    report: "익절가·손절가 닿는 순간 바로 알려요.",
  },
  {
    id: "reels",
    name: "매수 데스크",
    short: "buy.desk",
    icon: "🟥",
    task: "매수 체결 확인",
    report: "체결가를 확인하고 손절·익절가를 걸어요.",
  },
  {
    id: "carousel",
    name: "매도 데스크",
    short: "sell.desk",
    icon: "🟦",
    task: "매도 체결 확인",
    report: "판 가격과 손익을 바로 기록해요.",
  },
  {
    id: "partner",
    name: "증권사 연동팀",
    short: "broker.api",
    icon: "🔌",
    task: "증권사 연결·잔고 확인",
    report: "연결 상태와 주문 가능 현금을 확인해요.",
  },
  {
    id: "finance",
    name: "손익정산팀",
    short: "pnl.xls",
    icon: "🧾",
    task: "체결 내역·손익 정산",
    report: "수수료·세금까지 빼고 진짜 손익만 적어요.",
  },
  {
    id: "review",
    name: "매매복기팀",
    short: "review.data",
    icon: "📈",
    task: "오늘 매매 복기·학습점 기록",
    report: "잘된 매매와 실수한 매매를 나눠 남겨요.",
  },
  {
    id: "ops",
    name: "주문집행팀",
    short: "order.ops",
    icon: "⚡",
    task: "주문 집행·체결 확인",
    report: "주문 실패하면 다시 확인하고 로그를 남겨요.",
  },
  {
    id: "secretary",
    name: "비서실",
    short: "secretary.hq",
    icon: "📋",
    task: "오늘 손익 브리핑",
    report: "오늘 결과를 한 줄로 정리해 드려요.",
  },
] as const;

/**
 * 직원 명단.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 시장분석팀
  { dept: "research", rank: "lead", name: "김서연", role: "시장분석 팀장", callsign: "김애널",
    colors: ["#6b3d34", "#fff3b0", "#ff8fc0"],
    thoughts: ["5일선이 20일선 위에 있나부터 본다.", "RSI 75 넘으면 과열이에요.", "어제 변동폭이 오늘 기준선이 돼요."] },
  { dept: "research", rank: "member", name: "오태윤", role: "차트 분석",
    colors: ["#2f2a3d", "#c9b8ff", "#b8f0dd"],
    thoughts: ["일봉 20일치 다 받아왔어요.", "추세가 꺾인 종목은 후보에서 뺍니다."] },
  { dept: "research", rank: "member", name: "하은채", role: "종목 스크리닝",
    colors: ["#8a4a3c", "#b8f0dd", "#ff8fc0"],
    thoughts: ["거래 적은 종목은 안 봐요.", "점수표 정렬 다시 할게요."] },

  // ② 수급·뉴스팀
  { dept: "brand", rank: "lead", name: "박보라", role: "수급·뉴스 팀장", callsign: "박수급",
    colors: ["#372b4a", "#c9b8ff", "#c9b8ff"],
    thoughts: ["거래량 없이 오르는 건 의심해요.", "공시 나온 종목은 한 번 더 봐요."] },
  { dept: "brand", rank: "member", name: "신재원", role: "거래량 추적",
    colors: ["#3c3a4f", "#ffe6f2", "#c9b8ff"],
    thoughts: ["평소보다 거래량 3배면 표시.", "외국인이 사고 있나 볼게요."] },
  { dept: "brand", rank: "member", name: "임다혜", role: "뉴스 체크",
    colors: ["#5a3450", "#fff3b0", "#ff8fc0"],
    thoughts: ["루머 기사는 근거로 안 써요.", "장 시작 전 헤드라인 정리 중."] },

  // ③ 전략팀
  { dept: "strategy1", rank: "lead", name: "최아름", role: "전략 팀장", callsign: "최전략",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"],
    thoughts: ["돌파 가격 넘을 때만 들어가요.", "추격 매수는 원칙 위반이에요.", "익절 +2%, 손절 -1.5% 고정."] },
  { dept: "strategy1", rank: "member", name: "정유진", role: "진입 조건 설계",
    colors: ["#7b4a2f", "#b8f0dd", "#ff8fc0"],
    thoughts: ["K값 0.5가 무난해요.", "시가가 너무 높게 뜨면 조심."] },
  { dept: "strategy1", rank: "member", name: "배시현", role: "청산 조건 설계",
    colors: ["#2c2638", "#fff3b0", "#c9b8ff"],
    thoughts: ["15:15엔 무조건 다 정리.", "목표 수익 나면 욕심 안 내요."] },

  // ④ 리스크관리팀
  { dept: "qa", rank: "lead", name: "윤규아", role: "리스크관리 팀장", callsign: "윤리스",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"],
    thoughts: ["하루 -2%면 그날은 끝이에요.", "손절은 망설이면 더 커져요."] },
  { dept: "qa", rank: "member", name: "강태오", role: "한도 관리",
    colors: ["#463227", "#ffe6f2", "#b8f0dd"],
    thoughts: ["한 종목에 몰빵 금지.", "최대 3종목까지만."] },
  { dept: "qa", rank: "member", name: "문세라", role: "계좌 보호",
    colors: ["#6c3a55", "#c9b8ff", "#fff3b0"],
    thoughts: ["원래 들고 있던 주식은 손 안 대요.", "주문 금액 상한 다시 확인."] },

  // ⑤ 실시간 감시팀
  { dept: "strategy2", rank: "lead", name: "한도빈", role: "실시간 감시 팀장", callsign: "한감시",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"],
    thoughts: ["익절가까지 얼마 안 남았어요.", "손절선 근처면 바로 알릴게요."] },
  { dept: "strategy2", rank: "member", name: "조민서", role: "호가 감시",
    colors: ["#33304a", "#ff8fc0", "#b8f0dd"],
    thoughts: ["호가 얇아지면 주의.", "갑자기 꺾이면 바로 보고."] },
  { dept: "strategy2", rank: "member", name: "백가온", role: "보유 종목 감시",
    colors: ["#5d3a2c", "#b8f0dd", "#c9b8ff"],
    thoughts: ["수익률 계속 갱신 중.", "고점 대비 얼마 빠졌지?"] },

  // ⑥ 매수 데스크
  { dept: "reels", rank: "lead", name: "송리원", role: "매수 데스크 팀장", callsign: "송매수",
    colors: ["#2c2638", "#ff8fc0", "#ff8fc0"],
    thoughts: ["체결가 확인이 먼저예요.", "신호 없으면 안 사요."] },
  { dept: "reels", rank: "member", name: "권지호", role: "매수 체결 확인",
    colors: ["#4a3a2a", "#fff3b0", "#b8f0dd"],
    thoughts: ["시장가 체결 슬리피지 체크.", "수량 맞는지 다시 확인."] },
  { dept: "reels", rank: "member", name: "유세아", role: "매수 기록",
    colors: ["#7a3f58", "#c9b8ff", "#ff8fc0"],
    thoughts: ["매수 시각 기록해둘게요.", "손절가 같이 적어둬요."] },

  // ⑦ 매도 데스크
  { dept: "carousel", rank: "lead", name: "이가림", role: "매도 데스크 팀장", callsign: "이매도",
    colors: ["#d88d68", "#c9b8ff", "#c9b8ff"],
    thoughts: ["팔 땐 망설이지 않아요.", "익절이든 손절이든 규칙대로."] },
  { dept: "carousel", rank: "member", name: "남주하", role: "매도 체결 확인",
    colors: ["#3a2f4d", "#ffe6f2", "#ff8fc0"],
    thoughts: ["매도 수량 전부 나갔나 확인.", "미체결 남으면 바로 보고."] },
  { dept: "carousel", rank: "member", name: "표하늘", role: "손익 기록",
    colors: ["#274a44", "#fff3b0", "#b8f0dd"],
    thoughts: ["세금·수수료 빼고 적어요.", "손실도 숨기지 않고 기록."] },

  // ⑧ 증권사 연동팀
  { dept: "partner", rank: "lead", name: "정파랑", role: "증권사 연동 팀장", callsign: "정연동",
    colors: ["#563a32", "#b8f0dd", "#b8f0dd"],
    thoughts: ["키 없으면 연습 시장으로 돌려요.", "연결 안 된 걸 됐다고 안 해요."] },
  { dept: "partner", rank: "member", name: "구예성", role: "API 모니터링",
    colors: ["#452d3f", "#c9b8ff", "#fff3b0"],
    thoughts: ["호출 간격 지켜야 안 막혀요.", "토큰 만료 시간 체크."] },

  // ⑨ 손익정산팀
  { dept: "finance", rank: "lead", name: "오재민", role: "손익정산 팀장", callsign: "오정산",
    colors: ["#313b56", "#fff3b0", "#fff3b0"],
    thoughts: ["확정 손익이랑 평가 손익은 따로.", "운용 자금 대비 몇 %인지 볼게요."] },
  { dept: "finance", rank: "member", name: "심우진", role: "체결 내역 정리",
    colors: ["#4b3b2c", "#b8f0dd", "#c9b8ff"],
    thoughts: ["체결 내역 한 줄씩 맞춰봐요.", "숫자 안 맞으면 다시 조회."] },

  // ⑩ 매매복기팀
  { dept: "review", rank: "lead", name: "강성아", role: "매매복기 팀장", callsign: "강복기",
    colors: ["#9c5c72", "#ff8fc0", "#ff8fc0"],
    thoughts: ["승률보다 손익비가 중요해요.", "손절한 이유도 기록해요."] },
  { dept: "review", rank: "member", name: "마지훈", role: "성과 통계",
    colors: ["#2e3a4a", "#ffe6f2", "#b8f0dd"],
    thoughts: ["며칠치 쌓여야 의미가 있어요.", "하루 결과로 판단 안 해요."] },
  { dept: "review", rank: "member", name: "여름", role: "학습점 정리",
    colors: ["#6b4a2f", "#c9b8ff", "#fff3b0"],
    thoughts: ["반복할 패턴 1개, 버릴 패턴 1개.", "규칙 바꿀 땐 모의투자부터."] },

  // ⑪ 주문집행팀
  { dept: "ops", rank: "lead", name: "안도현", role: "주문집행 팀장", callsign: "안주문",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"],
    thoughts: ["주문 접수번호 확인했어요.", "실패하면 다시 확인하고 로그 남겨요."] },
  { dept: "ops", rank: "member", name: "천유나", role: "체결 모니터링",
    colors: ["#573049", "#fff3b0", "#ff8fc0"],
    thoughts: ["체결 안 된 걸 체결됐다고 안 써요.", "잔고랑 주문 수량 대조 중."] },

  // ⑫ 비서실
  { dept: "secretary", rank: "lead", name: "김세리", role: "비서실장", callsign: "김비서",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"],
    thoughts: ["오늘 손익만 딱 정리해 드릴게요.", "중복 설명은 다 지워요."] },
  { dept: "secretary", rank: "member", name: "홍보람", role: "브리핑 정리",
    colors: ["#334a3a", "#ffe6f2", "#fff3b0"],
    thoughts: ["거래 내역 시간순으로 묶을게요.", "손실 난 건 먼저 보고해요."] },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시됩니다.
 * 자동매매 오피스는 증권사 키가 없으면 연습 시장으로 돌아가므로 기본값은 비어 있어요.
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {};

/**
 * 결과 보관함 링크 (Notion 등). 비워두면 화면에서 링크 버튼이 숨겨집니다.
 * 예: "https://www.notion.so/내페이지주소"
 */
export const STORAGE_LINK = "";

// ============================================================
//  💹 주식 자동매매 (트레이딩 데스크)
// ============================================================
//  "자동매매 시작" 버튼 하나로 분석 → 전략 → 매수 → 감시 → 매도 → 정산까지 돌아갑니다.
//
//  연결 방식은 .dev.vars 에 따라 자동으로 정해져요.
//   · 아무것도 안 넣으면  → 🧪 연습 모드 (가짜 시장 · 가짜 돈 1,000만 원)
//   · 한국투자증권 키 + KIS_MODE=paper → 📝 모의투자 (진짜 시세 · 가짜 돈)
//   · 한국투자증권 키 + KIS_MODE=real  → 💰 실전 (진짜 돈!) — 화면에서 한 번 더 확인받아요
//
//  ⚠️ 어떤 전략도 수익을 보장하지 않습니다. 아래 숫자는 "목표"와 "안전장치"예요.
// ============================================================
export const TRADING = {
  /** 감시할 종목 (6자리 종목코드). 거래량 많은 대형주 위주가 안전해요 */
  watchlist: [
    { code: "005930", name: "삼성전자" },
    { code: "000660", name: "SK하이닉스" },
    { code: "035420", name: "NAVER" },
    { code: "035720", name: "카카오" },
    { code: "005380", name: "현대차" },
    { code: "000270", name: "기아" },
    { code: "068270", name: "셀트리온" },
    { code: "105560", name: "KB금융" },
    { code: "055550", name: "신한지주" },
    { code: "012330", name: "현대모비스" },
  ],
  /** 익절: 산 가격보다 이만큼(%) 오르면 판다 */
  takeProfitPct: 2,
  /** 손절: 산 가격보다 이만큼(%) 내리면 판다 */
  stopLossPct: 1.5,
  /** 오늘 수익이 이만큼(%) 나면 새로 사지 않고 남은 것만 정리 */
  dailyTargetPct: 1.5,
  /** 오늘 손실이 이만큼(%) 나면 전부 팔고 그날 매매 중단 */
  dailyLossLimitPct: 2,
  /** 동시에 들고 있을 최대 종목 수 */
  maxPositions: 3,
  /** 한 종목에 넣을 최대 금액(원). 실전에선 작게 시작하세요 */
  maxOrderKRW: 1_000_000,
  /** 이 시각(장중) 이후엔 새로 사지 않음 */
  lastBuyTime: "14:30",
  /** 이 시각에 들고 있는 건 전부 판다 (다음 날로 안 넘김) */
  closeAllTime: "15:15",
  /**
   * ⏰ 자동 출근 — 평일 장이 열리는 이 시각(서울)이 되면 창이 열려 있는 한 알아서 "오늘 매매 시작".
   * closeAllTime 에 들고 있는 걸 정리하고, 15:30 장이 닫히면 정산·브리핑 후 퇴근. 항상 켜져 있어요.
   * holidays: 쉬는 날. "MM-DD" 는 매년, "YYYY-MM-DD" 는 그 해만 (설·추석·대체공휴일은 해마다 직접 추가)
   */
  autoStart: {
    time: "09:00",
    holidays: ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25", "12-31"] as string[],
  },
  /**
   * 📰 공시 점검 — 아침 분석 때 금융감독원 DART 공시를 보고, 아래 단어가 제목에 들어간 공시가 난 종목은 그날 사지 않아요.
   * DART 키(.dev.vars 의 DART_API_KEY)가 없으면 건너뛰어요. 이미 산 종목을 팔지는 않아요.
   * lookbackDays: 오늘 포함 며칠치 공시를 볼지 (주말을 넘기려면 4 이상)
   */
  disclosure: {
    lookbackDays: 4,
    blockWords: [
      // 주식 수가 늘어나는 일 (주가가 묽어짐)
      "유상증자",
      "전환사채",
      "신주인수권부사채",
      "교환사채",
      "주식관련사채",
      "감자",
      // 상장·거래가 위험한 일
      "관리종목",
      "거래정지",
      "상장폐지",
      "상장적격성",
      "감사의견",
      "자본잠식",
      "불성실공시",
      // 돈이 막히거나 회사가 흔들리는 일
      "회생",
      "파산",
      "부도",
      "기한이익상실",
      "채무불이행",
      "영업정지",
      "생산중단",
      "계약해지",
      "최대주주변경",
      "회사분할",
      // 사건·사고·제재
      "횡령",
      "배임",
      "소송",
      "기소",
      "과징금",
      "벌금",
      // 소문·이상 급등락 (거래소 경고)
      "풍문",
      "조회공시",
      "투자주의",
      "투자경고",
      "투자위험",
      "단기과열",
      "공매도과열",
    ] as string[],
  },
  /** 변동성 돌파 계수 — 클수록 확실히 오를 때만 산다 (0.4~0.6 권장) */
  breakoutK: 0.5,
  /** 매도할 때 빠지는 수수료+세금 가정(%) — 수익 계산에 반영 */
  costPct: 0.23,
  /** 연습 모드 시작 자금 */
  simCash: 10_000_000,
  /** 트레이딩 데스크 담당자 (사무실 직원 이름과 연결됩니다) */
  desk: {
    analyst: { staffId: "research-lead", name: "김서연", role: "시장 분석" },
    strategist: { staffId: "strategy1-lead", name: "최아름", role: "전략 수립" },
    risk: { staffId: "qa-lead", name: "윤규아", role: "리스크 관리" },
    trader: { staffId: "ops-lead", name: "안도현", role: "주문 집행" },
    finance: { staffId: "finance-lead", name: "오재민", role: "손익 정산" },
    secretary: { staffId: "secretary-lead", name: "김세리", role: "보고" },
  },
};
