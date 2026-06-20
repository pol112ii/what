// 네이버 검색광고 API 클라이언트.
// keywordstool 로 키워드의 월간 검색량(PC+모바일)과 경쟁정도를 가져온다.
// 인증: X-Timestamp / X-API-KEY / X-Customer / X-Signature(HMAC-SHA256) 헤더 필요.
// 참고: https://naver.github.io/searchad-apidoc/

const BASE_URL = 'https://api.searchad.naver.com';

// HMAC-SHA256 서명 생성 (Web Crypto). 서명 메시지 = `${timestamp}.${method}.${uri}`
async function sign(timestamp, method, uri, secretKey) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const msg = `${timestamp}.${method}.${uri}`;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  // base64 인코딩
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// 키워드들의 월간 검색량을 조회한다. (한 번에 최대 5개 권장)
// keywords: string[]  →  { [keyword]: { pc, mobile, total, compIdx } }
export async function fetchSearchVolumes(keywords, settings) {
  const { adApiKey, adSecretKey, adCustomerId } = settings;
  if (!adApiKey || !adSecretKey || !adCustomerId) {
    throw new Error('검색광고 API 설정(키/시크릿/Customer ID)이 비어 있습니다. 설정 탭에서 입력하세요.');
  }

  const method = 'GET';
  const uri = '/keywordstool';
  const timestamp = String(Date.now());
  const signature = await sign(timestamp, method, uri, adSecretKey);

  // 검색광고 API 는 키워드의 공백을 제거해서 보내야 정상 동작한다.
  const hintKeywords = keywords.map((k) => k.replace(/\s+/g, '')).join(',');
  const url = `${BASE_URL}${uri}?hintKeywords=${encodeURIComponent(hintKeywords)}&showDetail=1`;

  const res = await fetch(url, {
    method,
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': adApiKey,
      'X-Customer': adCustomerId,
      'X-Signature': signature,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`검색광고 API 오류 ${res.status}: ${text}`);
  }

  const data = await res.json();
  const out = {};
  for (const row of data.keywordList || []) {
    // '< 10' 같은 문자열이 올 수 있어 숫자로 정규화
    const toNum = (v) => {
      if (typeof v === 'number') return v;
      const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const pc = toNum(row.monthlyPcQcCnt);
    const mobile = toNum(row.monthlyMobileQcCnt);
    // 공백 제거 + 대문자로 정규화한 키로 저장 (API 는 영어를 대문자로 반환)
    out[normalizeKey(row.relKeyword)] = {
      pc,
      mobile,
      total: pc + mobile,
      compIdx: row.compIdx, // '낮음' | '중간' | '높음'
    };
  }
  return out;
}

// 키워드 매칭용 정규화: 공백 제거 + 대문자
export function normalizeKey(s) {
  return String(s).replace(/\s+/g, '').toUpperCase();
}
