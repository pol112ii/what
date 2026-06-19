// ===== 칼로리 체크: 음식 검색 + 무게 입력 → 칼로리 계산 → 기록 추가 =====
const searchInput = document.getElementById('searchInput');
const resultsEl = document.getElementById('foodResults');
const calcCard = document.getElementById('calcCard');
const calcSelectedEl = document.getElementById('calcSelected');
const gramInput = document.getElementById('gramInput');
const calcKcalEl = document.getElementById('calcKcal');
const calcAddBtn = document.getElementById('calcAddBtn');
const toastEl = document.getElementById('toast');

let allFoods = [];        // DB에서 불러온 전체 음식
let filtered = [];        // 검색 결과
let selectedFood = null;  // { name, per100g, category }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// 음식 DB 불러오기
async function loadFoods() {
  resultsEl.innerHTML = '<li class="loading">음식 목록 불러오는 중…</li>';
  try {
    allFoods = await FoodStore.list();
    filtered = allFoods;
    renderResults();
  } catch (e) {
    resultsEl.innerHTML = '<li class="empty">목록을 불러오지 못했어요</li>';
  }
}

function renderResults() {
  if (filtered.length === 0) {
    resultsEl.innerHTML = '<li class="empty">검색 결과가 없어요. "음식 관리"에서 추가해보세요</li>';
    return;
  }
  resultsEl.innerHTML = '';
  filtered.forEach(food => {
    const li = document.createElement('li');
    li.dataset.id = food.id;
    if (selectedFood && selectedFood.id === food.id) li.classList.add('active');
    li.innerHTML = `
      <span><span class="food-name">${escapeHtml(food.name)}</span>${food.category ? `<span class="food-cat">${escapeHtml(food.category)}</span>` : ''}</span>
      <span class="food-per">${food.per100g} kcal/100g</span>`;
    resultsEl.appendChild(li);
  });
}

function search(q) {
  const query = q.trim().toLowerCase();
  filtered = query
    ? allFoods.filter(f => f.name.toLowerCase().includes(query))
    : allFoods;
  renderResults();
}

function calcKcal() {
  if (!selectedFood) return 0;
  const grams = Number(gramInput.value) || 0;
  return Math.round((selectedFood.per100g * grams) / 100);
}

function renderCalc() {
  if (!selectedFood) { calcCard.classList.add('hidden'); return; }
  calcCard.classList.remove('hidden');
  calcSelectedEl.textContent = `${selectedFood.name} (100g당 ${selectedFood.per100g}kcal)`;
  const kcal = calcKcal();
  calcKcalEl.textContent = kcal.toLocaleString();
  calcAddBtn.disabled = kcal <= 0;
}

// 이벤트
searchInput.addEventListener('input', () => search(searchInput.value));

resultsEl.addEventListener('click', e => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  selectedFood = allFoods.find(f => f.id === li.dataset.id);
  if (!gramInput.value) gramInput.value = 100;
  renderResults();
  renderCalc();
  gramInput.focus();
  gramInput.select();
});

gramInput.addEventListener('input', renderCalc);
gramInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !calcAddBtn.disabled) calcAddBtn.click();
});

calcAddBtn.addEventListener('click', () => {
  const kcal = calcKcal();
  if (!selectedFood || kcal <= 0) return;
  const grams = Number(gramInput.value);
  Store.addItem(`${selectedFood.name} ${grams}g`, kcal);
  showToast(`✅ ${selectedFood.name} ${kcal}kcal 추가됨`);
  // 초기화
  selectedFood = null;
  gramInput.value = '';
  searchInput.value = '';
  filtered = allFoods;
  renderResults();
  renderCalc();
});

loadFoods();
