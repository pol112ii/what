// 경쟁력 계산기.
// 키워드마스터와 같은 방식: 비율 = 블로그 총 문서수 / 월간 검색량.
// 비율이 낮을수록(글은 적고 검색은 많음) 상위노출이 쉬운 "좋은 키워드".
// 화면에는 박성호님 방식대로 `비율 / 검색량` 으로 표시한다. (예: 0.002 / 61)

import { fetchSearchVolumes } from './naverAd.js';
import { fetchBlogDocCount } from './naverSearch.js';

// keywords: string[] → 각 키워드에 검색량/문서수/비율을 채워서 반환
// onProgress(done, total) 로 진행 상황을 전달한다.
export async function scoreKeywords(keywords, settings, onProgress) {
  const results = [];

  // 1) 검색광고 API 로 검색량 일괄 조회 (5개씩 끊어서)
  const volumes = {};
  for (let i = 0; i < keywords.length; i += 5) {
    const batch = keywords.slice(i, i + 5);
    try {
      const vol = await fetchSearchVolumes(batch, settings);
      Object.assign(volumes, vol);
    } catch (e) {
      // 한 배치가 실패해도 나머지는 계속 진행
      console.warn('검색량 조회 실패:', batch, e.message);
    }
    // 검색광고 API rate limit 회피용 짧은 대기
    await delay(250);
  }

  // 2) 키워드별 블로그 문서수 조회 후 비율 계산
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const noSpace = kw.replace(/\s+/g, '');
    const vol = volumes[noSpace] || volumes[kw] || { total: 0, compIdx: '-' };
    let docCount = 0;
    try {
      docCount = await fetchBlogDocCount(kw, settings);
    } catch (e) {
      console.warn('문서수 조회 실패:', kw, e.message);
    }

    const volume = vol.total || 0;
    // 검색량이 0이면 비율을 계산할 수 없으므로 매우 큰 값으로(=나쁨) 처리
    const ratio = volume > 0 ? docCount / volume : Infinity;

    results.push({
      keyword: kw,
      volume,
      docCount,
      ratio,
      compIdx: vol.compIdx,
      // 화면 표시용 문자열 (예: "0.002 / 61")
      label: `${formatRatio(ratio)} / ${formatVolume(volume)}`,
    });

    if (onProgress) onProgress(i + 1, keywords.length);
    await delay(120);
  }

  return results;
}

// 좋은 키워드만 필터 (설정 기준 적용)
export function filterGood(results, settings) {
  return results.filter(
    (r) => r.ratio <= settings.maxRatio && r.volume >= settings.minVolume
  );
}

function formatRatio(r) {
  if (!Number.isFinite(r)) return '∞';
  if (r < 0.001) return r.toFixed(4);
  return r.toFixed(3);
}

function formatVolume(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
