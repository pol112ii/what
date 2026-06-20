// 크리에이터 어드바이저 페이지 "안에서" 실행되는 수집 함수.
// chrome.scripting.executeScript 로 creator-advisor.naver.com 탭에 주입한다.
// 같은 출처(same-origin)에서 fetch 하므로 로그인 쿠키가 자동으로 실린다.
//
// 페이지 컨텍스트에서 통째로 실행되므로 외부 변수를 참조하지 않고,
// 결과는 JSON 직렬화 가능한 객체로 반환한다. ({ ok, date, categories, keywords, error })
export async function collectTrendsInPage(opts) {
  const { date, limit = 20, service = 'naver_blog', onlyNew = false } = opts || {};
  const BASE = '/api/v6/trend';

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) throw new Error('AUTH');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  try {
    // 1) 카테고리 목록
    const catJson = await getJson(
      `${BASE}/category-inflow-ranks?contentType=text&date=${date}&interval=day&service=${service}`
    );
    const cats = catJson.data || [];

    // 2) 카테고리별 키워드 (3개씩 묶어 요청)
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
    return { ok: false, error: e.message };
  }
}
