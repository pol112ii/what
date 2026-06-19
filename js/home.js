// ===== 홈: 오늘의 칼로리 =====
const goalEl = document.getElementById('goal');
const nameInput = document.getElementById('nameInput');
const calInput = document.getElementById('calInput');
const addBtn = document.getElementById('addBtn');
const remainingEl = document.getElementById('remaining');
const remainingBox = document.getElementById('remainingBox');
const remainingLabel = document.getElementById('remainingLabel');
const barFill = document.getElementById('barFill');
const listEl = document.getElementById('list');
const todayEl = document.getElementById('today');
const eatenSummary = document.getElementById('eatenSummary');
const resetBtn = document.getElementById('resetBtn');
const quickAddEl = document.querySelector('.quick-add');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  const state = Store.getState();
  const { goal, eaten, remaining } = Store.totals();

  goalEl.value = goal;
  todayEl.textContent = Store.todayLabel();
  remainingEl.textContent = remaining;
  remainingBox.classList.toggle('over', remaining < 0);
  remainingLabel.textContent = remaining < 0 ? '초과 칼로리' : '남은 칼로리';
  eatenSummary.textContent = `먹은 칼로리 ${eaten.toLocaleString()} kcal`;

  const percent = goal > 0 ? Math.min((eaten / goal) * 100, 100) : 0;
  barFill.style.width = percent + '%';
  barFill.style.background = remaining < 0 ? '#e53935' : '#4caf50';

  if (state.items.length === 0) {
    listEl.innerHTML = '<div class="empty">아직 먹은 게 없어요 🍽️</div>';
    return;
  }
  listEl.innerHTML = '';
  state.items.forEach((item, i) => {
    const li = document.createElement('li');
    const label = item.name ? escapeHtml(item.name) : '먹은 음식';
    li.innerHTML = `
      <span class="meal-name">${label}</span>
      <span class="cal">${item.cal.toLocaleString()} kcal</span>
      <button data-i="${i}" aria-label="삭제">✕</button>`;
    listEl.appendChild(li);
  });
}

function addFromInput() {
  if (Store.addItem(nameInput.value, calInput.value)) {
    nameInput.value = '';
    calInput.value = '';
    calInput.focus();
    render();
  }
}

addBtn.addEventListener('click', addFromInput);
calInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFromInput(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') calInput.focus(); });

goalEl.addEventListener('input', () => { Store.setGoal(goalEl.value); render(); });

quickAddEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-cal]');
  if (btn && Store.addItem('', btn.dataset.cal)) render();
});

listEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-i]');
  if (btn) { Store.removeItem(Number(btn.dataset.i)); render(); }
});

resetBtn.addEventListener('click', () => {
  const state = Store.getState();
  if (state.items.length === 0) return;
  if (confirm('오늘 먹은 기록을 모두 지울까요?')) { Store.clearItems(); render(); }
});

// 다른 탭에서 변경 시 동기화
window.addEventListener('focus', render);

render();
