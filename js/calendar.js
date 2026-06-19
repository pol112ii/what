// ===== 성취 달력: 일별 목표 달성 여부(O/X) 표시 =====
const calTitle = document.getElementById('calTitle');
const calGrid = document.getElementById('calGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const statSuccess = document.getElementById('statSuccess');
const statFail = document.getElementById('statFail');
const statRate = document.getElementById('statRate');

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth(); // 0-11

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function render() {
  calTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  calMonthLabel.textContent = `${viewMonth + 1}월 성취`;

  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0(일)~6(토)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayKey = Store.todayString();

  let success = 0;
  let fail = 0;
  calGrid.innerHTML = '';

  // 1일 앞 빈 칸
  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty-cell';
    calGrid.appendChild(cell);
  }

  // 날짜 칸
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(viewYear, viewMonth, d);
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const status = Store.getDayStatus(key); // 'success' | 'fail' | 'none'

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dow === 0) cell.classList.add('sun');
    if (dow === 6) cell.classList.add('sat');
    if (key === todayKey) cell.classList.add('today');

    let mark = '';
    if (status === 'success') { cell.classList.add('success'); mark = 'O'; success++; }
    else if (status === 'fail') { cell.classList.add('fail'); mark = 'X'; fail++; }

    cell.innerHTML = `<span class="cal-day">${d}</span>` +
      (mark ? `<span class="cal-mark">${mark}</span>` : '<span class="cal-mark"></span>');
    calGrid.appendChild(cell);
  }

  const total = success + fail;
  statSuccess.textContent = success;
  statFail.textContent = fail;
  statRate.textContent = total > 0 ? Math.round((success / total) * 100) + '%' : '0%';
}

document.getElementById('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  render();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
});

// 다른 탭에서 돌아오면 최신 상태 반영
window.addEventListener('focus', render);

render();
