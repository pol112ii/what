// 사이드패널 컨트롤러: 탭 전환, 키워드 목록, 수집/계산/정렬/선택, 설정 저장.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// 백그라운드로 메시지 보내고 결과를 받는 헬퍼
function send(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error('응답 없음'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.data);
    });
  });
}

// 화면 상태
let keywords = []; // { keyword, volume?, docCount?, ratio?, label?, isNew, selected, addedAt }
let sortMode = 'competition';

// ---------- 탭 전환 ----------
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'analytics') { loadWriteLog(); loadDrafts(); }
    if (tab.dataset.tab === 'settings') loadSettings();
    if (tab.dataset.tab === 'write') populateWriteKeywords();
  });
});

// ---------- 키워드 추가/수집 ----------
$('#kwSearch').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val) return;
  addKeyword(val, true);
  e.target.value = '';
  render();
});

$('#collectBtn').addEventListener('click', async () => {
  const btn = $('#collectBtn');
  btn.disabled = true;
  btn.textContent = '수집 중...';
  try {
    const { keywords: collected, debug } = await send('collectKeywords');
    if (!collected.length) {
      // 디버그 정보를 보여줘 원인 파악을 돕는다
      const d = debug ? ` (NEW뱃지 ${debug.newBadges}개, 랭킹항목 ${debug.rankItems}개 감지)` : '';
      setStatus('수집된 키워드가 없습니다. 데이터랩 페이지인지 확인하세요.' + d);
    } else {
      collected.forEach((kw) => addKeyword(kw, true));
      setStatus(`${collected.length}개 수집 완료${debug ? ' · ' + debug.methods.join(',') : ''}`);
      render();
    }
  } catch (e) {
    setStatus('수집 실패: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⟳ 수집';
  }
});

function addKeyword(kw, isNew) {
  if (keywords.some((k) => k.keyword === kw)) return;
  keywords.push({ keyword: kw, isNew: !!isNew, selected: false, addedAt: Date.now() });
}

// ---------- 경쟁력 계산 ----------
$('#scoreBtn').addEventListener('click', async () => {
  const targets = keywords.filter((k) => k.selected);
  const list = targets.length ? targets : keywords;
  if (!list.length) return setStatus('계산할 키워드가 없습니다.');

  const btn = $('#scoreBtn');
  btn.disabled = true;
  btn.textContent = '계산 중...';
  try {
    const { results } = await send('scoreKeywords', { keywords: list.map((k) => k.keyword) });
    // 결과를 기존 키워드에 병합
    const byKw = Object.fromEntries(results.map((r) => [r.keyword, r]));
    keywords = keywords.map((k) =>
      byKw[k.keyword] ? { ...k, ...byKw[k.keyword] } : k
    );
    setStatus(`${results.length}개 경쟁력 계산 완료`);
    render();
  } catch (e) {
    setStatus('계산 실패: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '선택 키워드 경쟁력 계산';
  }
});

// ---------- 정렬 ----------
$$('.filter').forEach((f) => {
  f.addEventListener('click', () => {
    $$('.filter').forEach((x) => x.classList.remove('active'));
    f.classList.add('active');
    sortMode = f.dataset.sort;
    render();
  });
});

function sortedKeywords() {
  const arr = [...keywords];
  switch (sortMode) {
    case 'alpha':
      return arr.sort((a, b) => a.keyword.localeCompare(b.keyword, 'ko'));
    case 'latest':
      return arr.sort((a, b) => b.addedAt - a.addedAt);
    case 'competition':
      // 비율 낮은 순(좋은 키워드 먼저). 미계산은 뒤로.
      return arr.sort((a, b) => {
        const ra = a.ratio ?? Infinity;
        const rb = b.ratio ?? Infinity;
        return ra - rb;
      });
    case 'category':
    default:
      return arr;
  }
}

// ---------- 렌더 ----------
function render() {
  const list = $('#kwList');
  const items = sortedKeywords();
  $('#kwCount').textContent = keywords.length;
  $('#selCount').textContent = `선택 ${keywords.filter((k) => k.selected).length}`;

  if (!items.length) {
    list.innerHTML = '<div class="empty">키워드가 없습니다. 데이터랩 페이지를 열고 <b>수집</b>을 누르거나,<br />검색창에 직접 입력 후 Enter 로 추가하세요.</div>';
    return;
  }

  list.innerHTML = '';
  items.forEach((k, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (k.selected ? ' selected' : '');
    row.innerHTML = `
      <input type="checkbox" ${k.selected ? 'checked' : ''} />
      <span class="num">${i + 1}</span>
      ${k.isNew ? '<span class="badge-new">NEW</span>' : ''}
      <span class="kw">${escapeHtml(k.keyword)}</span>
      ${k.label ? `<span class="badge-val">${k.label}</span>` : ''}
      <span class="time">${timeAgo(k.addedAt)}</span>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      k.selected = e.target.checked;
      row.classList.toggle('selected', k.selected);
      $('#selCount').textContent = `선택 ${keywords.filter((x) => x.selected).length}`;
    });
    list.appendChild(row);
  });
}

// ---------- 글쓰기(제미나이 본문 생성) ----------
let lastGen = null; // 마지막 생성 결과

function populateWriteKeywords() {
  const sel = $('#writeKw');
  // 선택된 키워드 우선, 없으면 전체. 경쟁력순으로 정렬해 노출.
  const selected = keywords.filter((k) => k.selected);
  const list = (selected.length ? selected : keywords)
    .slice()
    .sort((a, b) => (a.ratio ?? Infinity) - (b.ratio ?? Infinity));
  sel.innerHTML = '<option value="">키워드를 선택하세요</option>' +
    list.map((k) => `<option value="${escapeHtml(k.keyword)}">${escapeHtml(k.keyword)}${k.label ? ' · ' + k.label : ''}</option>`).join('');
}

$('#genBtn').addEventListener('click', async () => {
  const kw = $('#writeKw').value;
  if (!kw) return ($('#genMsg').textContent = '키워드를 먼저 선택하세요.');
  const btn = $('#genBtn');
  btn.disabled = true; btn.textContent = '생성 중...';
  $('#genMsg').textContent = '제미나이가 본문을 작성하는 중...';
  try {
    const art = await send('generateArticle', { keyword: kw });
    lastGen = art;
    $('#genResult').style.display = 'block';
    $('#genTitle').value = art.title || '';
    $('#genBody').value = art.body || '';
    renderImagePrompts(art.imagePrompts || []);
    $('#genMsg').textContent = '생성 완료 ✓';
    await send('logWrite', { keyword: kw });
  } catch (e) {
    $('#genMsg').textContent = '생성 실패: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = '✨ 생성';
  }
});

function renderImagePrompts(prompts) {
  const box = $('#imgPrompts');
  const labels = ['썸네일', '본문 이미지 1', '본문 이미지 2'];
  box.innerHTML = prompts.map((p, i) => `
    <div class="imgprompt">
      <div class="imgprompt-label">${labels[i] || '이미지 ' + (i + 1)}</div>
      <div class="imgprompt-text">${escapeHtml(p)}</div>
      <button class="copybtn" data-copytext="${escapeHtml(p)}">복사</button>
    </div>`).join('');
  box.querySelectorAll('.copybtn').forEach((b) => {
    b.addEventListener('click', () => copyText(b.dataset.copytext, b));
  });
}

// 제목/본문 복사 버튼
document.addEventListener('click', (e) => {
  const b = e.target.closest('.copybtn[data-copy]');
  if (!b) return;
  const map = { title: $('#genTitle').value, body: $('#genBody').value };
  copyText(map[b.dataset.copy] || '', b);
});

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '복사됨 ✓';
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

// ---------- 이미지 자동 생성 (3단계) ----------
$('#genImgBtn').addEventListener('click', async () => {
  if (!lastGen || !(lastGen.imagePrompts || []).length) return ($('#genMsg').textContent = '먼저 본문을 생성하세요.');
  const btn = $('#genImgBtn');
  btn.disabled = true; btn.textContent = '생성 중...';
  try {
    const imgs = await send('generateImages', { prompts: lastGen.imagePrompts, aspectRatios: ['1:1', '4:3', '4:3'] });
    renderImageResults(imgs);
    $('#genMsg').textContent = imgs.some((i) => i.manual)
      ? '수동 모드: 프롬프트를 제미나이 웹에 붙여넣어 생성하세요.'
      : '이미지 생성 완료 ✓';
  } catch (e) {
    $('#genMsg').textContent = '이미지 생성 실패: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = '이미지 생성';
  }
});

function renderImageResults(imgs) {
  const box = $('#imgResults');
  box.innerHTML = imgs.map((im) => {
    if (im.dataUrl) return `<a href="${im.dataUrl}" download="image.png"><img class="thumb" src="${im.dataUrl}" /></a>`;
    if (im.error) return `<div class="imgerr">생성 실패: ${escapeHtml(im.error)}</div>`;
    return '';
  }).join('');
}

// ---------- 블로그 입력/발행 (4단계) ----------
$('#fillBtn').addEventListener('click', () => doPublish(false));
$('#publishBtn').addEventListener('click', () => doPublish(true));

async function doPublish(publish) {
  const title = $('#genTitle').value;
  const body = $('#genBody').value;
  if (!body) return ($('#genMsg').textContent = '먼저 본문을 생성하세요.');
  $('#genMsg').textContent = publish ? '블로그 입력+발행 시도 중...' : '블로그에 입력 중...';
  try {
    const res = await send('publishToBlog', { title, body, publish });
    if (!res.editorReport) {
      $('#genMsg').textContent = '에디터를 찾지 못했습니다. 블로그 글쓰기 페이지가 열려 있는지 확인하세요.';
    } else {
      const steps = res.editorReport.steps.map((s) => Object.entries(s)[0].join(':')).join(', ');
      $('#genMsg').textContent = `입력 결과 — ${steps}`;
    }
  } catch (e) {
    $('#genMsg').textContent = '실패: ' + e.message;
  }
}

// ---------- 자동 스케줄러 (5단계) ----------
$('#autoRun').addEventListener('click', async () => {
  const targets = keywords.filter((k) => k.selected).map((k) => k.keyword);
  if (!targets.length) return setStatus('자동 글쓰기할 키워드를 체크하세요.');
  const min = parseInt($('#intervalMin').value, 10) || 10;
  const max = parseInt($('#intervalMax').value, 10) || 12;
  await send('startAuto', { keywords: targets, min, max, autoPublish: false });
  refreshAutoStatus();
});

$('#autoStop').addEventListener('click', async () => {
  await send('stopAuto');
  refreshAutoStatus();
});

async function refreshAutoStatus() {
  const st = await send('getAutoStatus');
  if (st.running) {
    const next = st.nextRunAt ? new Date(st.nextRunAt).toLocaleTimeString('ko') : '-';
    setStatus(`진행 중 · 큐 ${st.queue.length}개 남음 · 다음 ${next}`);
  } else {
    setStatus(st.queue && st.queue.length ? `중단됨 · 큐 ${st.queue.length}개 남음` : '대기 중');
  }
}

// ---------- 설정 ----------
async function loadSettings() {
  const s = await send('getSettings');
  ['searchClientId','searchClientSecret','adApiKey','adSecretKey','adCustomerId','geminiApiKey','geminiModel',
   'writeGuide','imagePromptGuide','thumbnailGuide','imageApi','maxRatio','minVolume']
    .forEach((id) => { if ($(`#${id}`)) $(`#${id}`).value = s[id] ?? ''; });
}

$('#saveSettings').addEventListener('click', async () => {
  const payload = {
    searchClientId: $('#searchClientId').value.trim(),
    searchClientSecret: $('#searchClientSecret').value.trim(),
    adApiKey: $('#adApiKey').value.trim(),
    adSecretKey: $('#adSecretKey').value.trim(),
    adCustomerId: $('#adCustomerId').value.trim(),
    geminiApiKey: $('#geminiApiKey').value.trim(),
    geminiModel: $('#geminiModel').value.trim() || 'gemini-2.5-flash',
    writeGuide: $('#writeGuide').value,
    imagePromptGuide: $('#imagePromptGuide').value,
    thumbnailGuide: $('#thumbnailGuide').value,
    imageApi: $('#imageApi').value,
    maxRatio: parseFloat($('#maxRatio').value) || 0.05,
    minVolume: parseInt($('#minVolume').value, 10) || 50,
  };
  await send('saveSettings', payload);
  $('#saveMsg').textContent = '저장되었습니다 ✓';
  setTimeout(() => ($('#saveMsg').textContent = ''), 2000);
});

// ---------- 분석(글쓰기 기록) ----------
async function loadWriteLog() {
  const state = await send('getState');
  const box = $('#writeLog');
  const log = state.writeLog || [];
  if (!log.length) { box.innerHTML = '<p class="muted">아직 기록이 없습니다.</p>'; return; }
  box.innerHTML = log
    .map((l) => `<div class="logitem">${escapeHtml(l.keyword)} <span class="muted">· ${new Date(l.at).toLocaleString('ko')}</span></div>`)
    .join('');
}

// ---------- 초안 목록 ----------
async function loadDrafts() {
  const drafts = await send('getDrafts');
  const box = $('#draftList');
  if (!drafts.length) { box.innerHTML = '<p class="muted">아직 초안이 없습니다.</p>'; return; }
  box.innerHTML = drafts.map((d) => `
    <div class="logitem">
      <b>${escapeHtml(d.title || d.keyword)}</b>
      <span class="muted">· ${escapeHtml(d.keyword)} · ${new Date(d.createdAt).toLocaleString('ko')}</span>
      <button class="copybtn" data-draft="${d.id}">본문 복사</button>
      <button class="copybtn" data-deldraft="${d.id}">삭제</button>
    </div>`).join('');
  box.querySelectorAll('[data-draft]').forEach((b) => b.addEventListener('click', () => {
    const d = drafts.find((x) => x.id == b.dataset.draft);
    if (d) copyText(`${d.title}\n\n${d.body}`, b);
  }));
  box.querySelectorAll('[data-deldraft]').forEach((b) => b.addEventListener('click', async () => {
    await send('deleteDraft', { id: Number(b.dataset.deldraft) });
    loadDrafts();
  }));
}

// ---------- 유틸 ----------
function setStatus(msg) { $('#autoStatus').textContent = msg; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

render();
refreshAutoStatus();
// 자동 진행 중이면 상태를 주기적으로 갱신
setInterval(refreshAutoStatus, 15000);
