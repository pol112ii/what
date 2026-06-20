// 네이버 데이터랩 페이지에서 'NEW' 표시된 인기 키워드를 긁어오는 수집기.
// chrome.scripting.executeScript 로 데이터랩 탭 안에서 실행된다.
//
// ⚠️ 데이터랩은 공식 키워드 API 를 제공하지 않으므로 DOM 을 직접 읽는다.
//    네이버가 페이지 구조를 바꾸면 아래 선택자를 함께 조정해야 한다.
//
// 반환: { keywords: string[], debug: {...} }  ← debug 로 무엇을 긁었는지 확인 가능.
// 이 함수는 페이지 컨텍스트에서 통째로 실행되므로 외부 변수를 참조하지 않는다.
export function scrapeDataLab() {
  const keywords = [];
  const seen = new Set();
  const debug = { url: location.href, newBadges: 0, rankItems: 0, methods: [] };

  const clean = (raw) =>
    (raw || '')
      .replace(/NEW/gi, '')
      .replace(/순위|급상승|인기검색어/g, '')
      .replace(/^\s*\d+\s*/, '') // 앞쪽 순위 숫자
      .replace(/\s+/g, ' ')
      .trim();

  const push = (text) => {
    const t = clean(text);
    if (!t || t.length > 30 || /^\d+$/.test(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    keywords.push(t);
  };

  // 방법 1: 'NEW' 뱃지 주변에서 키워드 추출
  const all = Array.from(document.querySelectorAll('span, em, i, b, strong, div'));
  for (const el of all) {
    const t = (el.textContent || '').trim();
    if (t.toUpperCase() !== 'NEW') continue;
    debug.newBadges++;
    const row = el.closest('li, tr, a, div[class*="rank"], div[class*="keyword"], div[class*="item"]');
    if (row) push(row.textContent);
  }
  if (keywords.length) debug.methods.push('new-badge');

  // 방법 2: 랭킹 리스트(ol>li, .rank_*) 에서 키워드 추출 (NEW 뱃지를 못 찾은 경우 보완)
  if (!keywords.length) {
    const rankItems = Array.from(
      document.querySelectorAll('ol li, ul[class*="rank"] li, [class*="rank_list"] li, [class*="keyword_list"] li')
    );
    debug.rankItems = rankItems.length;
    for (const li of rankItems) {
      // 링크 텍스트가 있으면 그것을 우선 사용
      const a = li.querySelector('a');
      push((a && a.textContent) || li.textContent);
    }
    if (keywords.length) debug.methods.push('rank-list');
  }

  debug.found = keywords.length;
  debug.sample = keywords.slice(0, 5);
  return { keywords, debug };
}
