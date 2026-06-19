// 네이버 검색 API (openapi.naver.com) 클라이언트.
// 키워드로 블로그를 검색해 '총 문서수(total)'를 가져온다.
// 경쟁력 계산에서 분자(발행된 글 수)로 쓰인다.
// 참고: https://developers.naver.com/docs/serviceapi/search/blog/blog.md

const BLOG_URL = 'https://openapi.naver.com/v1/search/blog.json';

// 키워드 1개의 블로그 총 문서수를 반환한다.
export async function fetchBlogDocCount(keyword, settings) {
  const { searchClientId, searchClientSecret } = settings;
  if (!searchClientId || !searchClientSecret) {
    throw new Error('검색 API 설정(Client ID/Secret)이 비어 있습니다. 설정 탭에서 입력하세요.');
  }

  const url = `${BLOG_URL}?query=${encodeURIComponent(keyword)}&display=1`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': searchClientId,
      'X-Naver-Client-Secret': searchClientSecret,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`검색 API 오류 ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.total || 0;
}
