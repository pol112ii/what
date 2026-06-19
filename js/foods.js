// ===== 음식 관리: 로컬 음식 DB(FoodStore)에 추가 / 삭제 =====
const ffName = document.getElementById('ffName');
const ffCal = document.getElementById('ffCal');
const ffCat = document.getElementById('ffCat');
const foodAddBtn = document.getElementById('foodAddBtn');
const manageList = document.getElementById('manageList');
const countEl = document.getElementById('foodCount');

let foods = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadFoods() {
  manageList.innerHTML = '<li class="loading">불러오는 중…</li>';
  try {
    foods = await FoodStore.list();
    render();
  } catch (e) {
    manageList.innerHTML = '<li class="empty">불러오지 못했어요</li>';
  }
}

function render() {
  countEl.textContent = `등록된 음식 ${foods.length}개`;
  if (foods.length === 0) {
    manageList.innerHTML = '<li class="empty">등록된 음식이 없어요. 위에서 추가해보세요</li>';
    return;
  }
  manageList.innerHTML = '';
  foods.forEach(food => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="m-info">
        <div class="m-name">${escapeHtml(food.name)}</div>
        <div class="m-meta">${food.category ? escapeHtml(food.category) : '분류 없음'}</div>
      </div>
      <span class="m-cal">${food.per100g} kcal/100g</span>
      <button class="m-del" data-id="${food.id}" aria-label="삭제">✕</button>`;
    manageList.appendChild(li);
  });
}

async function addFood() {
  const name = ffName.value.trim();
  const per100g = Number(ffCal.value);
  const category = ffCat.value.trim();
  if (!name) { alert('음식 이름을 입력하세요'); ffName.focus(); return; }
  if (!per100g || per100g <= 0) { alert('100g당 칼로리를 입력하세요'); ffCal.focus(); return; }

  foodAddBtn.disabled = true;
  foodAddBtn.textContent = '추가 중…';
  try {
    await FoodStore.add({ name, per100g, category });
    ffName.value = '';
    ffCal.value = '';
    ffCat.value = '';
    ffName.focus();
    await loadFoods();
  } catch (e) {
    alert('추가에 실패했어요. 다시 시도해주세요.');
  } finally {
    foodAddBtn.disabled = false;
    foodAddBtn.textContent = '＋ 음식 추가';
  }
}

async function deleteFood(id, name) {
  if (!confirm(`"${name}"을(를) 삭제할까요?`)) return;
  try {
    await FoodStore.remove(id);
    foods = foods.filter(f => f.id !== id);
    render();
  } catch (e) {
    alert('삭제에 실패했어요.');
  }
}

foodAddBtn.addEventListener('click', addFood);
[ffName, ffCal, ffCat].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') addFood(); });
});
manageList.addEventListener('click', e => {
  const btn = e.target.closest('.m-del');
  if (btn) {
    const food = foods.find(f => f.id === btn.dataset.id);
    deleteFood(btn.dataset.id, food ? food.name : '');
  }
});

loadFoods();
