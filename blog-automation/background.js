// 서비스 워커: 사이드패널 ↔ 네이버 API/탭 사이의 중계자 + 자동 스케줄러.
// API 호출은 여기(백그라운드)에서 해야 host_permissions 로 CORS 를 우회할 수 있다.

import { getSettings, saveSettings, getState, saveState } from './lib/storage.js';
import { scoreKeywords, filterGood } from './lib/competition.js';
import { scrapeDataLab } from './lib/datalabCollector.js';
import { defaultDate } from './lib/creatorAdvisor.js';
import { collectTrendsInPage } from './lib/creatorAdvisorInPage.js';
import { generateArticle } from './lib/gemini.js';
import { generateImages } from './lib/imageGen.js';
import { fillEditor, clickPublish } from './lib/blogWriter.js';

const ALARM = 'ba-auto-write';

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

// 자동 스케줄러 알람
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM) await runOnce();
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !/datalab\.naver\.com/.test(tab.url || '')) {
        throw new Error('네이버 데이터랩(datalab.naver.com) 페이지를 먼저 연 뒤 다시 시도하세요.');
      }
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeDataLab,
      });
      const keywords = result?.keywords || [];
      await saveState({ lastCollectedAt: Date.now() });
      // debug 정보도 함께 반환 (수집이 안 될 때 원인 파악용)
      return { keywords, debug: result?.debug || null };
    }

    case 'collectTrends': {
      // 크리에이터 어드바이저 탭 "안에서" 수집 실행 → 로그인 쿠키 자동 적용
      const opts = msg.payload || {};
      const date = opts.date || defaultDate();
      const result = await collectTrendsViaTab({ ...opts, date });
      await saveState({ lastCollectedAt: Date.now() });
      return result;
    }

    case 'scoreKeywords': {
      const settings = await getSettings();
      const results = await scoreKeywords(msg.payload.keywords, settings);
      const state = await saveState({ keywords: results });
      return { results, good: filterGood(results, settings), state };
    }

    case 'generateArticle': {
      const settings = await getSettings();
      return generateArticle(msg.payload.keyword, settings);
    }

    case 'generateImages': {
      // prompts 배열로 이미지 생성 (설정의 imageApi 방식 사용)
      const settings = await getSettings();
      return generateImages(msg.payload.prompts, settings, msg.payload.aspectRatios);
    }

    case 'publishToBlog': {
      // 현재 블로그 글쓰기 탭에 제목/본문 입력 (+옵션 발행)
      return publishToBlog(msg.payload);
    }

    case 'saveDraft': {
      // 생성 결과를 초안으로 저장
      const state = await getState();
      const draft = { id: Date.now(), createdAt: Date.now(), status: 'draft', ...msg.payload };
      const drafts = [draft, ...(state.drafts || [])].slice(0, 200);
      await saveState({ drafts });
      return drafts;
    }
    case 'getDrafts':
      return (await getState()).drafts || [];
    case 'deleteDraft': {
      const state = await getState();
      const drafts = (state.drafts || []).filter((d) => d.id !== msg.payload.id);
      await saveState({ drafts });
      return drafts;
    }

    case 'logWrite': {
      const state = await getState();
      const writeLog = [
        { keyword: msg.payload.keyword, at: Date.now() },
        ...(state.writeLog || []),
      ].slice(0, 500);
      await saveState({ writeLog });
      return writeLog;
    }

    // ----- 자동 스케줄러 -----
    case 'startAuto': {
      const { keywords, min, max, autoPublish } = msg.payload;
      await saveState({
        autoQueue: keywords || [],
        autoRunning: true,
        autoConfig: { min: min || 10, max: max || 12, autoPublish: !!autoPublish },
        nextRunAt: Date.now() + 2000,
      });
      // 첫 작업은 바로 실행
      runOnce();
      return getAutoStatus();
    }
    case 'stopAuto': {
      await chrome.alarms.clear(ALARM);
      await saveState({ autoRunning: false, nextRunAt: null });
      return getAutoStatus();
    }
    case 'getAutoStatus':
      return getAutoStatus();

    default:
      throw new Error(`알 수 없는 요청: ${msg.type}`);
  }
}

async function getAutoStatus() {
  const s = await getState();
  return {
    running: !!s.autoRunning,
    queue: s.autoQueue || [],
    nextRunAt: s.nextRunAt || null,
    config: s.autoConfig || null,
  };
}

// 큐에서 키워드 하나를 꺼내 생성→(옵션)발행→초안 저장→다음 예약
async function runOnce() {
  const settings = await getSettings();
  let state = await getState();
  if (!state.autoRunning) return;

  const queue = state.autoQueue || [];
  if (!queue.length) {
    await saveState({ autoRunning: false, nextRunAt: null });
    notify('자동 글쓰기 완료', '큐의 모든 키워드를 처리했습니다.');
    return;
  }

  const keyword = queue[0];
  const restQueue = queue.slice(1);
  await saveState({ autoQueue: restQueue });

  try {
    // 1) 본문 생성
    const art = await generateArticle(keyword, settings);
    // 2) 이미지 생성 (수동 모드면 빈 결과)
    let images = [];
    try {
      images = await generateImages(art.imagePrompts || [], settings, ['1:1', '4:3', '4:3']);
    } catch (e) {
      console.warn('이미지 생성 실패:', e.message);
    }
    // 3) 초안 저장
    const draft = {
      id: Date.now(), createdAt: Date.now(), status: 'draft',
      keyword, title: art.title, body: art.body, imagePrompts: art.imagePrompts, images,
    };
    const drafts = [draft, ...(state.drafts || [])].slice(0, 200);
    await saveState({ drafts });
    // 4) 기록
    await handle({ type: 'logWrite', payload: { keyword } });

    // 5) 자동 발행 옵션
    if (state.autoConfig?.autoPublish) {
      try {
        await publishToBlog({ title: art.title, body: art.body, publish: true });
      } catch (e) {
        console.warn('자동 발행 실패:', e.message);
      }
    }
    notify('초안 생성됨', `"${keyword}" 글이 준비되었습니다.`);
  } catch (e) {
    notify('생성 실패', `"${keyword}": ${e.message}`);
  }

  // 6) 다음 작업 예약 (남은 큐가 있을 때만)
  state = await getState();
  if (state.autoRunning && (state.autoQueue || []).length) {
    const { min, max } = state.autoConfig || { min: 10, max: 12 };
    const delayMin = randBetween(min, max);
    const when = Date.now() + delayMin * 60 * 1000;
    await chrome.alarms.create(ALARM, { when });
    await saveState({ nextRunAt: when });
  } else {
    await saveState({ autoRunning: false, nextRunAt: null });
    if (state.autoRunning) notify('자동 글쓰기 완료', '큐의 모든 키워드를 처리했습니다.');
  }
}

// 블로그 글쓰기 탭에 입력/발행
async function publishToBlog({ title, body, publish }) {
  const tabs = await chrome.tabs.query({ url: ['https://blog.naver.com/*'] });
  // 활성 탭 우선, 없으면 첫 블로그 탭
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = (active && /blog\.naver\.com/.test(active.url || '')) ? active : tabs[0];
  if (!tab) {
    throw new Error('네이버 블로그 글쓰기 페이지를 먼저 연 뒤 다시 시도하세요.');
  }

  // 에디터가 iframe 안에 있으므로 모든 프레임에서 실행
  const fillReports = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: fillEditor,
    args: [{ title, body }],
  });
  const editorReport = fillReports.map((r) => r.result).find((r) => r && r.isEditor) || null;

  let publishReport = null;
  if (publish) {
    const pubReports = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: clickPublish,
      args: [true],
    });
    publishReport = pubReports.map((r) => r.result).find((r) => r && r.steps?.length) || null;
  }

  return { editorReport, publishReport, tabId: tab.id };
}

// 크리에이터 어드바이저 탭을 찾거나(없으면 새로 열고) 그 안에서 수집 실행
async function collectTrendsViaTab(opts) {
  const URLMATCH = 'https://creator-advisor.naver.com/*';
  let tabs = await chrome.tabs.query({ url: URLMATCH });
  let tab = tabs[0];
  let createdTab = false;

  if (!tab) {
    // 열린 탭이 없으면 백그라운드로 하나 연다
    tab = await chrome.tabs.create({ url: 'https://creator-advisor.naver.com/', active: false });
    createdTab = true;
    await waitForTabComplete(tab.id);
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectTrendsInPage,
      args: [opts],
    });
    if (!result) throw new Error('수집 응답이 없습니다.');
    if (!result.ok) {
      if (result.error === 'AUTH') {
        throw new Error('로그인이 필요합니다. 네이버에 로그인했는지, 크리에이터 어드바이저 접근 권한이 있는지 확인하세요.');
      }
      throw new Error('수집 실패: ' + result.error);
    }
    return result;
  } finally {
    // 우리가 연 탭이면 정리
    if (createdTab) {
      try { await chrome.tabs.remove(tab.id); } catch { /* 무시 */ }
    }
  }
}

// 탭 로딩 완료 대기 (최대 15초)
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message,
    });
  } catch {
    /* 알림 권한 없으면 무시 */
  }
}
