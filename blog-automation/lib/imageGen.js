// 이미지 자동 생성 모듈 (3단계).
// 설정의 imageApi 값에 따라 Imagen 또는 나노바나나(Gemini Image)로 이미지를 생성한다.
// 반환: data URL(base64) 배열. 'manual' 이면 빈 배열(사용자가 제미나이 웹에서 직접 생성).

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 모델 매핑
const IMAGEN_MODELS = {
  imagen4fast: 'imagen-4.0-fast-generate-001',
  imagen4: 'imagen-4.0-generate-001',
};
const NANO_MODEL = 'gemini-2.5-flash-image';

// prompts: string[] (예: [썸네일, 본문1, 본문2])
// aspectRatios: string[] 각 이미지 비율 (예: ['1:1','4:3','4:3'])
// 반환: [{ prompt, dataUrl|null, error? }]
export async function generateImages(prompts, settings, aspectRatios = []) {
  const mode = settings.imageApi || 'manual';
  if (mode === 'manual') {
    // 수동 모드: 생성하지 않고 프롬프트만 돌려준다.
    return prompts.map((p) => ({ prompt: p, dataUrl: null, manual: true }));
  }
  if (!settings.geminiApiKey) {
    throw new Error('이미지 생성에는 제미나이 API 키가 필요합니다. 설정 탭에서 입력하세요.');
  }

  const out = [];
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const ratio = aspectRatios[i] || (i === 0 ? '1:1' : '4:3');
    try {
      const dataUrl =
        mode === 'nanobanana'
          ? await genNanoBanana(prompt, settings)
          : await genImagen(prompt, ratio, mode, settings);
      out.push({ prompt, dataUrl });
    } catch (e) {
      out.push({ prompt, dataUrl: null, error: e.message });
    }
  }
  return out;
}

// Imagen (:predict) — bytesBase64Encoded 반환
async function genImagen(prompt, aspectRatio, mode, settings) {
  const model = IMAGEN_MODELS[mode] || IMAGEN_MODELS.imagen4fast;
  const res = await fetch(`${BASE}/${model}:predict?key=${encodeURIComponent(settings.geminiApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio },
    }),
  });
  if (!res.ok) throw new Error(`Imagen ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('이미지 응답이 비어 있습니다.');
  return `data:image/png;base64,${b64}`;
}

// 나노바나나 (Gemini 2.5 Flash Image, generateContent) — inlineData 반환
async function genNanoBanana(prompt, settings) {
  const res = await fetch(`${BASE}/${NANO_MODEL}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`나노바나나 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error('이미지 응답이 비어 있습니다.');
  const mime = img.inlineData.mimeType || 'image/png';
  return `data:${mime};base64,${img.inlineData.data}`;
}
