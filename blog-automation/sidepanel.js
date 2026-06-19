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
    if (tab.dataset.tab === 'analytics') loadWriteLog();
    if (tab.dataset.tab === 'settings') loadSettings();
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
    const collected = await send('collectKeywords');
    if (!collected.length) {
      setStatus('수집된 키워드가 없습니다. 데이터랩 페이지인지 확인하세요.');
    } else {
      collected.forEach((kw) => addKeyword(kw, true));
      setStatus(`${collected.length}개 수집 완료`);
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

// ---------- 설정 ----------
async function loadSettings() {
  const s = await send('getSettings');
  ['searchClientId','searchClientSecret','adApiKey','adSecretKey','adCustomerId','maxRatio','minVolume']
    .forEach((id) => { if ($(`#${id}`)) $(`#${id}`).value = s[id] ?? ''; });
}

$('#saveSettings').addEventListener('click', async () => {
  const payload = {
    searchClientId: $('#searchClientId').value.trim(),
    searchClientSecret: $('#searchClientSecret').value.trim(),
    adApiKey: $('#adApiKey').value.trim(),
    adSecretKey: $('#adSecretKey').value.trim(),
    adCustomerId: $('#adCustomerId').value.trim(),
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
