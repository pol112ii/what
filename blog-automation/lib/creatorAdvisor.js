// 네이버 크리에이터 어드바이저(Creator Advisor) 트렌드 API 클라이언트.
// 로그인 세션 쿠키로 인증되므로, 로그인만 되어 있으면 페이지를 열지 않아도
// 백그라운드에서 카테고리별 트렌드 키워드를 받아온다. (credentials: 'include')
//
// 엔드포인트(실제 캡처로 확인):
//  - 카테고리 목록: /api/v6/trend/category-inflow-ranks
//  - 카테고리별 키워드: /api/v6/trend/category?categories=A,B,C&...&limit=20
//
// 데이터 구조:
//  키워드 = { query, ratio, rank, rankChange }  (rankChange === null 이면 신규진입 = NEW)

const BASE = 'https://creator-advisor.naver.com/api/v6/trend';

// 로컬(사용자 PC) 기준 어제 날짜. 트렌드 데이터는 보통 전일까지 제공된다.
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

// 시도할 날짜 후보 (어제부터 과거로 n일). 데이터 지연 대비 폴백용.
export function candidateDates(n = 3) {
  const out = [];
  const base = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

async function getJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401 || res.status === 403) {
    throw new Error('로그인이 필요합니다. 네이버에 로그인한 뒤 다시 시도하세요.');
  }
  if (!res.ok) throw new Error(`요청 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// 32개 카테고리 목록
export async function fetchCategories(date = defaultDate(), service = 'naver_blog') {
  const url = `${BASE}/category-inflow-ranks?contentType=text&date=${date}&interval=day&service=${service}`;
  const json = await getJson(url);
  return json.data || [];
}

// 카테고리별 키워드 (페이지처럼 3개씩 묶어 요청)
export async function fetchCategoryKeywords(categories, date = defaultDate(), service = 'naver_blog', limit = 20) {
  const out = [];
  for (let i = 0; i < categories.length; i += 3) {
    const batch = categories.slice(i, i + 3);
    const cats = batch.map(encodeURIComponent).join('%2C'); // 콤마(%2C)로 연결
    const url = `${BASE}/category?categories=${cats}&contentType=text&date=${date}&hasRankChange=true&interval=day&limit=${limit}&service=${service}`;
    try {
      const json = await getJson(url);
      for (const c of json.data || []) {
        for (const q of c.queryList || []) {
          out.push({
            keyword: q.query,
            category: c.category,
            rank: q.rank,
            rankChange: q.rankChange,
            trendRatio: q.ratio,
            isNew: q.rankChange === null, // 신규 진입 = NEW
          });
        }
      }
    } catch (e) {
      console.warn('카테고리 키워드 조회 실패:', batch, e.message);
    }
    await delay(200); // 과도한 요청 방지
  }
  return out;
}

// 전체 수집: 카테고리 목록 → 카테고리별 키워드
// options: { date, service, limit, categories(지정 시 그 카테고리만), onlyNew }
export async function collectTrends(options = {}) {
  const date = options.date || defaultDate();
  const service = options.service || 'naver_blog';
  const limit = options.limit || 20;
  const cats = options.categories?.length ? options.categories : await fetchCategories(date, service);
  let keywords = await fetchCategoryKeywords(cats, date, service, limit);
  if (options.onlyNew) keywords = keywords.filter((k) => k.isNew);
  return { date, categories: cats, keywords };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
