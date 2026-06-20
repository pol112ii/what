// 크리에이터 어드바이저 페이지 "안에서" 실행되는 수집 함수.
// chrome.scripting.executeScript({ world: 'MAIN' }) 로 주입되어,
// 페이지가 직접 호출하는 것과 동일한 컨텍스트(쿠키/헤더)로 fetch 한다.
//
// opts.dates: 시도할 날짜 후보 배열(최신순). 데이터가 없으면 다음 날짜로 폴백.
// 반환(JSON 직렬화 가능): { ok, date, categories, keywords } 또는 { ok:false, error, status, body }
export async function collectTrendsInPage(opts) {
  const { dates = [], limit = 20, service = 'naver_blog', onlyNew = false } = opts || {};
  const BASE = '/api/v6/trend';

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      err.body = (body || '').slice(0, 150);
      throw err;
    }
    return res.json();
  }

  let lastError = { error: 'unknown' };

  for (const date of dates) {
    try {
      const catJson = await getJson(
        `${BASE}/category-inflow-ranks?contentType=text&date=${date}&interval=day&service=${service}`
      );
      const cats = catJson.data || [];
      if (!cats.length) {
        lastError = { error: 'empty-categories', date };
        continue; // 이 날짜는 데이터 없음 → 다음 후보
      }

      const keywords = [];
      for (let i = 0; i < cats.length; i += 3) {
        const batch = cats.slice(i, i + 3);
        const c = batch.map(encodeURIComponent).join('%2C');
        try {
          const j = await getJson(
            `${BASE}/category?categories=${c}&contentType=text&date=${date}&hasRankChange=true&interval=day&limit=${limit}&service=${service}`
          );
          for (const cat of j.data || []) {
            for (const q of cat.queryList || []) {
              keywords.push({
                keyword: q.query,
                category: cat.category,
                rank: q.rank,
                rankChange: q.rankChange,
                trendRatio: q.ratio,
                isNew: q.rankChange === null,
              });
            }
          }
        } catch (e) {
          // 한 배치 실패는 건너뜀
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      const out = onlyNew ? keywords.filter((k) => k.isNew) : keywords;
      return { ok: true, date, categories: cats, keywords: out };
    } catch (e) {
      lastError = { error: e.message, status: e.status, body: e.body, date };
      // 인증 실패는 날짜를 바꿔도 소용없으므로 즉시 중단
      if (e.status === 401 || e.status === 403) break;
    }
  }

  return { ok: false, ...lastError };
}
