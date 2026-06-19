// ===== 음식 DB (로컬 JSON 시드 + localStorage 저장) =====
// 최초 실행 시 data/foods.json 의 기본 음식으로 시드하고,
// 이후 사용자가 추가/삭제한 내용은 localStorage 에 영구 저장합니다.
// (정적 JSON 파일은 브라우저에서 직접 쓸 수 없으므로 변경분은 localStorage 에 보관)
const FoodStore = (() => {
  const STORAGE_KEY = 'calorie-foods-v1';
  const SEED_URL = 'data/foods.json';

  // file:// 등으로 열어 fetch 가 막힐 때를 대비한 내장 기본 데이터
  const FALLBACK_SEED = [
    { name: '흰쌀밥', per100g: 130, category: '밥' },
    { name: '현미밥', per100g: 112, category: '밥' },
    { name: '닭가슴살', per100g: 165, category: '단백질' },
    { name: '삶은 계란', per100g: 155, category: '단백질' },
    { name: '두부', per100g: 84, category: '단백질' },
    { name: '연어', per100g: 208, category: '단백질' },
    { name: '소고기(살코기)', per100g: 250, category: '단백질' },
    { name: '돼지고기(삼겹살)', per100g: 331, category: '단백질' },
    { name: '고구마', per100g: 128, category: '탄수화물' },
    { name: '오트밀', per100g: 68, category: '곡물' },
    { name: '식빵', per100g: 265, category: '빵' },
    { name: '김밥', per100g: 150, category: '분식' },
    { name: '바나나', per100g: 89, category: '과일' },
    { name: '사과', per100g: 52, category: '과일' },
    { name: '아보카도', per100g: 160, category: '과일' },
    { name: '우유', per100g: 65, category: '유제품' },
    { name: '그릭요거트', per100g: 59, category: '유제품' },
    { name: '브로콜리', per100g: 34, category: '채소' },
    { name: '방울토마토', per100g: 18, category: '채소' },
    { name: '김치', per100g: 15, category: '반찬' }
  ];

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(foods) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
  }

  function normalize(raw) {
    return {
      id: raw.id || uid(),
      name: (raw.name || '').trim(),
      per100g: Number(raw.per100g) || 0,
      category: (raw.category || '').trim()
    };
  }

  // 최초 1회: 기본 음식 데이터로 시드
  async function ensureSeeded() {
    const existing = read();
    if (existing) return existing;

    let seed = FALLBACK_SEED;
    try {
      const res = await fetch(SEED_URL, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length) seed = json;
      }
    } catch (e) {
      // fetch 실패 시 내장 기본 데이터 사용
    }
    const foods = seed.map(normalize);
    write(foods);
    return foods;
  }

  // 전체 음식 목록 (이름순 정렬)
  async function list() {
    const foods = await ensureSeeded();
    return foods.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  // 음식 추가
  async function add({ name, per100g, category }) {
    const foods = await ensureSeeded();
    const food = normalize({ name, per100g, category });
    foods.push(food);
    write(foods);
    return food;
  }

  // 음식 삭제
  async function remove(id) {
    const foods = await ensureSeeded();
    write(foods.filter(f => f.id !== id));
  }

  return { list, add, remove };
})();
