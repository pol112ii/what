// 서비스 워커: 사이드패널 ↔ 네이버 API 사이의 중계자.
// API 호출은 여기(백그라운드)에서 해야 host_permissions 로 CORS 를 우회할 수 있다.

import { getSettings, saveSettings, getState, saveState } from './lib/storage.js';
import { scoreKeywords, filterGood } from './lib/competition.js';
import { scrapeDataLab } from './lib/datalabCollector.js';
import { generateArticle } from './lib/gemini.js';

// 아이콘 클릭 시 사이드패널 열기
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 사이드패널에서 오는 메시지 처리
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // 비동기 응답 유지
});

async function handle(msg) {
  switch (msg.type) {
    case 'getSettings':
      return getSettings();
    case 'saveSettings':
      return saveSettings(msg.payload);
    case 'getState':
      return getState();

    case 'collectKeywords': {
      // 현재 활성 탭(데이터랩)에서 키워드 긁어오기
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !/datalab\.naver\.com/.test(tab.url || '')) {
        throw new Error('네이버 데이터랩(datalab.naver.com) 페이지를 먼저 연 뒤 다시 시도하세요.');
      }
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeDataLab,
      });
      const keywords = result || [];
      await saveState({ lastCollectedAt: Date.now() });
      return keywords;
    }

    case 'scoreKeywords': {
      // 키워드 배열을 받아 경쟁력 계산
      const settings = await getSettings();
      const results = await scoreKeywords(msg.payload.keywords, settings);
      const state = await saveState({ keywords: results });
      return { results, good: filterGood(results, settings), state };
    }

    case 'generateArticle': {
      // 키워드 1개로 제미나이가 본문 + 이미지 프롬프트 생성
      const settings = await getSettings();
      return generateArticle(msg.payload.keyword, settings);
    }

    case 'logWrite': {
      // 글쓰기 기록 남기기
      const state = await getState();
      const writeLog = [
        { keyword: msg.payload.keyword, at: Date.now() },
        ...(state.writeLog || []),
      ].slice(0, 500);
      await saveState({ writeLog });
      return writeLog;
    }

    default:
      throw new Error(`알 수 없는 요청: ${msg.type}`);
  }
}
