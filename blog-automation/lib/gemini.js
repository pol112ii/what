// 제미나이(Gemini) API 클라이언트.
// 선택한 키워드로 네이버 블로그용 본문과 이미지 프롬프트를 생성한다.
// 참고: https://ai.google.dev/api/generate-content

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 키워드 1개로 블로그 글(제목/본문/이미지 프롬프트)을 생성한다.
// 반환: { title, body, imagePrompts: string[] }
export async function generateArticle(keyword, settings) {
  const { geminiApiKey, geminiModel } = settings;
  if (!geminiApiKey) {
    throw new Error('제미나이 API 키가 비어 있습니다. 설정 탭에서 입력하세요.');
  }
  const model = geminiModel || 'gemini-2.5-flash';

  const prompt = buildPrompt(keyword, settings);

  const res = await fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`제미나이 API 오류 ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON 파싱 실패 시 본문 전체를 body 로라도 반환
    return { title: keyword, body: raw, imagePrompts: [] };
  }
  return {
    title: parsed.title || keyword,
    body: parsed.body || '',
    imagePrompts: Array.isArray(parsed.imagePrompts) ? parsed.imagePrompts : [],
  };
}

function buildPrompt(keyword, settings = {}) {
  const writeGuide = settings.writeGuide || '한국어 정보성 블로그 글을 자연스럽게 작성한다.';
  const imagePromptGuide = settings.imagePromptGuide || '문단 분위기에 맞는 고화질 사진 스타일.';
  const thumbnailGuide = settings.thumbnailGuide || '클릭을 유도하는 정사각형 썸네일.';

  return `너는 네이버 블로그 상위노출에 능한 한국어 블로그 작가다.
아래 키워드로 정보성 블로그 글 1편을 작성해라.

키워드: "${keyword}"

[글쓰기 지침]
${writeGuide}

[썸네일 작성 지침] (imagePrompts[0] 에 반영)
${thumbnailGuide}

[본문 이미지 프롬프트 지침] (imagePrompts[1], [2] 에 반영)
${imagePromptGuide}

출력 요구사항:
- imagePrompts 는 정확히 3개: [0]=썸네일용, [1],[2]=본문 삽입용.
- 각 이미지 프롬프트는 이미지 생성기에 바로 붙여넣을 수 있는 완성된 프롬프트로 작성.

반드시 아래 JSON 형식으로만 출력:
{
  "title": "제목",
  "body": "마크다운 본문 (## 소제목 포함)",
  "imagePrompts": ["썸네일 프롬프트", "본문이미지1 프롬프트", "본문이미지2 프롬프트"]
}`;
}
