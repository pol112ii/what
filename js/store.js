// ===== 공통 기록 저장소 (홈/칼로리체크 페이지 공유) =====
// 오늘의 목표 + 먹은 기록을 localStorage에 저장합니다.
const Store = (() => {
  const STORAGE_KEY = 'calorie-check-v1';

  function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayLabel() {
    const d = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  }

  function defaultState() {
    return { date: todayString(), goal: 2000, items: [] };
  }

  function load() {
    let state = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.date !== todayString()) {
          // 날짜가 바뀌면 목표는 유지, 먹은 기록만 초기화
          state.goal = saved.goal || 2000;
          state.items = [];
          save(state);
        } else {
          state = saved;
        }
      }
    } catch (e) {
      console.warn('저장 데이터 불러오기 실패', e);
    }
    return state;
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getState() { return load(); }

  function setGoal(goal) {
    const s = load();
    s.goal = Number(goal) || 0;
    save(s);
  }

  function addItem(name, cal) {
    const val = Number(cal);
    if (!val || val <= 0) return false;
    const s = load();
    s.items.push({ name: (name || '').trim(), cal: val });
    save(s);
    return true;
  }

  function removeItem(index) {
    const s = load();
    s.items.splice(index, 1);
    save(s);
  }

  function clearItems() {
    const s = load();
    s.items = [];
    save(s);
  }

  function totals() {
    const s = load();
    const eaten = s.items.reduce((sum, v) => sum + v.cal, 0);
    return { goal: s.goal, eaten, remaining: s.goal - eaten };
  }

  return { todayString, todayLabel, getState, setGoal, addItem, removeItem, clearItems, totals };
})();
