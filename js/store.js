// ===== 공통 기록 저장소 (홈/칼로리체크/달력 페이지 공유) =====
// 오늘의 목표 + 먹은 기록을 localStorage에 저장하고,
// 날짜가 바뀔 때 그날의 달성 여부를 히스토리(달력용)에 기록합니다.
const Store = (() => {
  const STORAGE_KEY = 'calorie-check-v1';
  const HISTORY_KEY = 'calorie-history-v1';

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

  // ----- 달력 히스토리 -----
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveHistory(h) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  }

  // 하루가 지났을 때, 지난 날의 결과를 히스토리에 기록
  function recordDay(saved) {
    const eaten = (saved.items || []).reduce((sum, v) => sum + v.cal, 0);
    if (eaten <= 0) return; // 기록이 없는 날은 달력에 표시하지 않음
    const goal = saved.goal || 0;
    const h = loadHistory();
    h[saved.date] = { goal, eaten, success: goal > 0 && eaten <= goal };
    saveHistory(h);
  }

  function load() {
    let state = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.date !== todayString()) {
          // 날짜가 바뀌면: 지난 날 결과를 달력에 기록 → 목표 유지, 먹은 기록만 초기화
          recordDay(saved);
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

  // 달력에서 사용: 전체 히스토리(과거 확정분). load()로 날짜 롤오버 먼저 반영
  function getHistory() {
    load();
    return loadHistory();
  }

  // 특정 날짜의 상태 반환: 'success' | 'fail' | 'none'
  // 오늘은 진행 중이므로 현재까지의 상태(eaten 0이면 'none')를 실시간 반환
  function getDayStatus(dateStr) {
    if (dateStr === todayString()) {
      const { goal, eaten } = totals();
      if (eaten <= 0) return 'none';
      return goal > 0 && eaten <= goal ? 'success' : 'fail';
    }
    const rec = loadHistory()[dateStr];
    if (!rec) return 'none';
    return rec.success ? 'success' : 'fail';
  }

  return {
    todayString, todayLabel, getState, setGoal, addItem, removeItem, clearItems,
    totals, getHistory, getDayStatus
  };
})();
