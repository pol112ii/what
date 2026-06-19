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
