// 네이버 블로그 글쓰기(스마트에디터 ONE) 자동 입력/발행 모듈 (4단계).
// 아래 함수들은 chrome.scripting.executeScript({ func, args }) 로
// 블로그 글쓰기 탭의 '에디터 iframe' 안에서 실행된다. (target.allFrames: true)
//
// ⚠️ 스마트에디터는 DOM 구조가 자주 바뀌고 보안 정책이 강하다.
//    아래 선택자/방식은 방어적으로 작성했으나, 실제 페이지를 보며
//    개발자도구로 fine-tune 해야 할 가능성이 높다. 각 단계는 결과(report)를 반환한다.

// 에디터 프레임 여부 판단 (제목/본문 편집영역이 있는 프레임에서만 동작)
function isEditorFrame() {
  return !!document.querySelector(
    '.se-section-documentTitle, .se-title-text, [contenteditable="true"]'
  );
}

// 제목 + 본문을 채운다. payload = { title, body }
// body 는 마크다운 → 문단 텍스트로 단순 변환해서 넣는다.
export function fillEditor(payload) {
  const report = { frame: location.href, isEditor: isEditorFrame(), steps: [] };
  if (!report.isEditor) return report;

  const log = (k, v) => report.steps.push({ [k]: v });

  // ----- 제목 -----
  try {
    const titleEl =
      document.querySelector('.se-section-documentTitle [contenteditable="true"]') ||
      document.querySelector('.se-title-text [contenteditable="true"]') ||
      document.querySelector('.se-documentTitle [contenteditable="true"]');
    if (titleEl) {
      titleEl.focus();
      setEditableText(titleEl, payload.title || '');
      log('title', 'ok');
    } else {
      log('title', 'not-found');
    }
  } catch (e) {
    log('title', 'error:' + e.message);
  }

  // ----- 본문 -----
  try {
    const paragraphs = mdToParagraphs(payload.body || '');
    const bodyEl =
      document.querySelector('.se-component .se-text-paragraph[contenteditable="true"]') ||
      document.querySelector('.se-main-container [contenteditable="true"]') ||
      Array.from(document.querySelectorAll('[contenteditable="true"]')).find(
        (el) => !el.closest('.se-section-documentTitle, .se-title-text')
      );
    if (bodyEl) {
      bodyEl.focus();
      // 문단 사이 줄바꿈 2개로 합쳐서 한 번에 삽입 (가장 호환성 높은 방식)
      insertTextAtCursor(bodyEl, paragraphs.join('\n\n'));
      log('body', `ok(${paragraphs.length}문단)`);
    } else {
      log('body', 'not-found');
    }
  } catch (e) {
    log('body', 'error:' + e.message);
  }

  return report;
}

// 발행 버튼 클릭 (2단계: '발행' 패널 열기 → 확인 '발행')
// confirm=true 면 확인 버튼까지 누른다. 기본은 패널만 열어 사용자가 최종 확인.
export function clickPublish(confirm) {
  const report = { steps: [] };
  const byText = (texts) =>
    Array.from(document.querySelectorAll('button, a')).find((b) => {
      const t = (b.textContent || '').replace(/\s/g, '');
      return texts.some((x) => t === x || t.includes(x));
    });

  // 1) 우상단 '발행' 버튼
  const openBtn =
    document.querySelector('.publish_btn__m9KHH') ||
    document.querySelector('[class*="publish_btn"]') ||
    byText(['발행']);
  if (!openBtn) {
    report.steps.push({ openPublish: 'not-found' });
    return report;
  }
  openBtn.click();
  report.steps.push({ openPublish: 'clicked' });

  if (!confirm) return report;

  // 2) 패널의 최종 '발행' 확인 버튼 (약간의 지연 후 탐색)
  // executeScript 단발 실행이라 setTimeout 결과는 못 받지만, 클릭은 시도된다.
  setTimeout(() => {
    const confirmBtn =
      document.querySelector('.confirm_btn__WEaBq') ||
      document.querySelector('[class*="confirm_btn"]') ||
      byText(['발행']);
    if (confirmBtn) confirmBtn.click();
  }, 800);
  report.steps.push({ confirmPublish: 'scheduled' });
  return report;
}

// ---------- 내부 헬퍼 (페이지 컨텍스트에서 실행) ----------

// contenteditable 에 텍스트 세팅 (기존 내용 비우고 입력)
function setEditableText(el, text) {
  el.textContent = '';
  insertTextAtCursor(el, text);
}

// 커서 위치에 텍스트 삽입 + input 이벤트 디스패치 (에디터가 인식하도록)
function insertTextAtCursor(el, text) {
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.addRange(range);
  // execCommand 가 막힌 환경 대비: 우선 insertText 시도, 실패 시 textContent
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    el.textContent = (el.textContent || '') + text;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
}

// 마크다운 → 문단 배열 (## 소제목은 텍스트로, 빈 줄로 문단 구분)
function mdToParagraphs(md) {
  return md
    .replace(/^#{1,6}\s*/gm, '') // 헤딩 기호 제거(텍스트만 유지)
    .replace(/\*\*(.*?)\*\*/g, '$1') // 굵게 기호 제거
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
