// 네이버 데이터랩 페이지에서 'NEW' 표시된 인기 키워드를 긁어오는 수집기.
// chrome.scripting.executeScript 로 데이터랩 탭 안에서 실행된다.
//
// ⚠️ 데이터랩은 공식 키워드 API 를 제공하지 않으므로 DOM 을 직접 읽는다.
//    네이버가 페이지 구조를 바꾸면 아래 선택자를 함께 조정해야 한다.
//    (실제 페이지를 열고 개발자도구로 선택자를 확인해 fine-tune 하는 것을 권장)
//
// 이 함수는 페이지 컨텍스트에서 통째로 실행되므로 외부 변수를 참조하지 않는다.
export function scrapeDataLab() {
  const results = [];
  const seen = new Set();

  // 'NEW' 뱃지를 가진 항목 주변에서 키워드 텍스트를 추출하는 휴리스틱.
  // 1) 텍스트가 정확히 'NEW' 인 요소를 찾는다.
  const candidates = Array.from(document.querySelectorAll('span, em, i, b, div'));
  for (const el of candidates) {
    const t = (el.textContent || '').trim();
    if (t !== 'NEW' && t.toUpperCase() !== 'NEW') continue;

    // NEW 뱃지가 속한 행(li/tr/a) 을 찾아 그 안의 키워드 텍스트를 추출
    const row = el.closest('li, tr, a, div[class*="rank"], div[class*="keyword"]');
    if (!row) continue;

    // 행 텍스트에서 'NEW', 숫자, 순위 등을 제거해 키워드만 남긴다
    let text = (row.textContent || '')
      .replace(/NEW/gi, '')
      .replace(/^\s*\d+\s*/, '') // 앞쪽 순위 숫자
      .trim();

    // 너무 길거나(설명 섞임) 빈 경우 제외
    if (!text || text.length > 30) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }

  return results;
}
