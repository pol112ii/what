// 설정과 상태를 chrome.storage.local 에 저장/로드하는 모듈.
// API 키 같은 민감 정보가 들어가므로 동기화(sync)가 아닌 local 에 저장한다.

const SETTINGS_KEY = 'ba-settings-v1';
const STATE_KEY = 'ba-state-v1';

// 기본 설정값. 설정 화면에서 채워 넣는다.
const DEFAULT_SETTINGS = {
  // 네이버 검색 API (openapi.naver.com) — 블로그 문서수 조회용
  searchClientId: '',
  searchClientSecret: '',
  // 네이버 검색광고 API (api.searchad.naver.com) — 월간 검색량 조회용
  adApiKey: '',
  adSecretKey: '',
  adCustomerId: '',
  // 제미나이(Gemini) API — 본문/이미지 프롬프트 생성용
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  // ----- 생성 지침(프롬프트) : 사용자가 직접 수정해 품질을 조정한다 -----
  // 글쓰기 지침: 포스팅 어조/구성 가이드라인
  writeGuide: `#작업 프로세스
0: 정보 수집 — 키워드의 검색 의도를 먼저 파악한다.
1: 제목 — 키워드를 자연스럽게 포함, 클릭을 유도(30자 내외).
2: 본문 — 한국어, 1500~2000자, 소제목(##) 4~6개로 구성한다.
   - 도입부에서 검색 의도를 짚고, 실질적이고 구체적인 정보를 제공한다.
   - 문단은 짧게, 가독성 좋게 작성한다.
   - 과장·허위 정보, 단정적 의료/법률 조언은 금지한다.
3: 마무리 — 자연스러운 마무리 문단으로 끝낸다.`,
  // 문단별(본문) 이미지 프롬프트 지침
  imagePromptGuide: `스타일: 실사 같은 고화질 사진 (Cinematic film still, photorealistic, 8k)을 기본으로 한다.
문단의 분위기를 반영한다.
실존 인물의 얼굴이나 유명 캐릭터는 절대 생성하지 않는다(이 경우 텍스트로 표현).
인물·배경 설정을 구체적으로 적고, 이미지 속 글자는 반드시 한국어로 한다.`,
  // 썸네일 작성 지침
  thumbnailGuide: `정사각형(1:1) 썸네일을 만든다.
전체 분위기는 밝고 시원하게, 여행/정보/가이드형 콘텐츠에 어울리는 고채도 스타일.
큼직한 한글 타이포그래피가 화면 중심을 차지하게 한다.
배경은 사진 콜라주처럼 구성하되, 글자가 가장 잘 보여야 한다.`,
  // 이미지 생성 방식 (실제 생성은 3단계에서 연결. 지금은 선택값 저장만)
  imageApi: 'manual', // manual=제미나이 웹에서 수동 | imagen4fast | imagen4 | nanobanana
  // 키워드 선정 기준 (경쟁력 = 문서수 / 검색량, 낮을수록 좋음)
  maxRatio: 0.05, // 이 비율 이하만 "괜찮은 키워드"로 표시
  minVolume: 50, // 월간 검색량 최소치
};

export async function getSettings() {
  const obj = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(obj[SETTINGS_KEY] || {}) };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getState() {
  const obj = await chrome.storage.local.get(STATE_KEY);
  return obj[STATE_KEY] || { keywords: [], lastCollectedAt: null, writeLog: [] };
}

export async function saveState(partial) {
  const current = await getState();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}
