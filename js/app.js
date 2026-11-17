// 영농노트 — 정적 SPA (해시 라우팅). 데이터: data/crops.json (scripts/build-data.mjs 가 생성)
const $app = document.getElementById('app');
const KINDS = { sow: '파종', nursery: '육묘', plant: '심기', manage: '관리', fert: '비료', pest: '방제', harvest: '수확', etc: '기타' };
const CAT_ORDER = ['논농사', '밭농사', '채소', '과수', '화훼', '버섯', '약초', '사료작물', '축산'];
const XUN = ['상순', '중순', '하순'];
const XUN_DAYS = ['1~10일', '11~20일', '21일~말일'];
// 첫 방문 때 큰 버튼으로 바로 고를 수 있게 내놓는 작목 (농작업일정 cntntsNo)
const QUICK = [30697, 30600, 30618, 30611, 30633, 30715, 30699, 30701, 30714, 30663, 30669, 30662];
// 흔히 쓰는 다른 이름 → 농사로 표기
const ALIAS = { 꼬추: '고추', 나락: '벼', 쌀: '벼', 도라지: '길경', 마: '산약', 체리: '양앵두', 키위: '참다래', 귤: '감귤', 밀감: '감귤', 깻잎: '들깨', 강냉이: '옥수수', 옥시기: '옥수수', 정구지: '부추', 무우: '무', 상치: '상추', 대파: '파', 소: '한우', 닭: '계', 염소: '흑염소', 감: '단감' };

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('yn:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('yn:' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
let favs = new Set(store.get('favs', []));
const saveFavs = () => store.set('favs', [...favs]);

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d }));
const kg = (n) => fmt(n, Math.abs(n) >= 100 ? 0 : 1); // 100kg 이상은 정수로
const today = () => new Date();
const xunOf = (d) => (d.getDate() <= 10 ? 1 : d.getDate() <= 20 ? 2 : 3);
const slot = (m, p) => (m - 1) * 3 + (p - 1); // 0..35
const nowSlot = () => slot(today().getMonth() + 1, xunOf(today()));
const slotName = (x) => `${Math.floor(x / 3) + 1}월 ${XUN[x % 3]}`;
const fullName = (c) => c.name + (c.type ? ` (${c.type})` : '');
const isFav = (c) => favs.has(String(c.id));

// ---------- 내 설정: 지역, 날씨 위치, 글자 크기 ----------
const settings = () => ({ region: '', regionAuto: false, big: false, loc: null, ...store.get('settings', {}) });
const setSetting = (o) => store.set('settings', { ...settings(), ...o });
const REGION_LIST = ['중부', '남부', '제주', '고랭지'];
const REGIONS = {
  중부: /중부|중북부|북부|중남부|평지|전국|그 외/,
  남부: /남부|이남|해안|난지|호남|영남|전남|경남|평지|전국|그 외/,
  제주: /제주|난지|해안|전국|그 외/,
  고랭지: /고랭지|고령지|산간|전국/,
};
// 작목 일정에 내 지역 표시가 하나라도 있으면, 다른 지역으로 표시된 작업은 뺀다.
// 내 지역 표시가 전혀 없는 작목(그 지역 자료가 없는 작목)은 모두 보여 준다. 지역 표시가 없는 작업은 늘 보인다.
function regionFilter(items) {
  const reg = settings().region;
  if (!reg) return items;
  const re = REGIONS[reg];
  if (!items.some((s) => s.region && re.test(s.region))) return items;
  return items.filter((s) => !s.region || re.test(s.region));
}
function applyBig() {
  const big = settings().big;
  document.documentElement.classList.toggle('big', big);
  document.querySelectorAll('[data-big]').forEach((b) => { b.setAttribute('aria-pressed', big); b.textContent = big ? '글자 보통' : '글자 크게'; });
}

// ---------- 할 일 완료 표시 ----------
const doneMap = () => store.get('done', {});
// 같은 작업이라도 해마다 따로 체크한다. 해를 넘는 작업(11월~2월 등)은 시작한 해로 묶는다.
function taskKey(c, s, r, x) {
  let y = today().getFullYear() - (x > nowSlot() ? 1 : 0);
  if (r[0] > r[1] && x <= r[1]) y -= 1;
  return `${y}|${c.id}|${s.task}|${s.region || ''}`;
}
const isDone = (k) => !!doneMap()[k];
const isoDay = (d = today()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // 날짜 입력란 형식
const workOf = (s) => ({ sow: '파종', nursery: '육묘', plant: '정식·이앙', fert: '비료', pest: '방제', harvest: '수확' }[s.kind]
  || (/전정|유인|순지르기|적심|솎/.test(s.task) ? '전정·유인' : /물|관수|배수/.test(s.task) ? '물 관리' : /제초|김매기/.test(s.task) ? '제초' : /경운|로터리|정지|밭갈|이랑/.test(s.task) ? '경운·정지' : '기타'));

// ---------- 날씨 (Open-Meteo, 키 없음) ----------
const CITIES = [['서울', 37.57, 126.98], ['인천', 37.46, 126.71], ['경기 수원', 37.26, 127.03], ['경기 이천', 37.27, 127.44], ['강원 춘천', 37.88, 127.73], ['강원 강릉', 37.75, 128.88], ['강원 평창(고랭지)', 37.37, 128.39], ['충북 청주', 36.64, 127.49], ['충북 충주', 36.99, 127.93], ['충남 천안', 36.81, 127.11], ['충남 논산', 36.19, 127.1], ['대전', 36.35, 127.38], ['세종', 36.48, 127.29], ['전북 전주', 35.82, 127.15], ['전북 김제', 35.8, 126.88], ['광주', 35.16, 126.85], ['전남 나주', 35.02, 126.71], ['전남 해남', 34.57, 126.6], ['경북 안동', 36.57, 128.73], ['경북 상주', 36.41, 128.16], ['대구', 35.87, 128.6], ['경남 진주', 35.18, 128.11], ['경남 밀양', 35.5, 128.75], ['울산', 35.54, 129.31], ['부산', 35.18, 129.08], ['제주', 33.5, 126.53], ['서귀포', 33.25, 126.56]];
const WX_RULES = [
  { name: '서리·저온', test: (d, i) => d.temperature_2m_min[i] <= 2, label: (d, i) => `최저 ${fmt(d.temperature_2m_min[i], 0)}℃`, re: /저온|서리|한파|언피해|동해|혹한|냉해|한풍|추위/ },
  { name: '폭염', test: (d, i) => d.temperature_2m_max[i] >= 33, label: (d, i) => `최고 ${fmt(d.temperature_2m_max[i], 0)}℃`, re: /고온|폭염|더위|일소/ },
  { name: '많은 비', test: (d, i) => d.precipitation_sum[i] >= 30, label: (d, i) => `비 ${fmt(d.precipitation_sum[i], 0)}mm`, re: /호우|장마|습해|태풍|침수|잦은 비|강우/ },
  { name: '강한 바람', test: (d, i) => d.wind_speed_10m_max[i] >= 12, label: (d, i) => `바람 초속 ${fmt(d.wind_speed_10m_max[i], 0)}m`, re: /태풍|강풍|바람|쓰러짐|도복|풍해/ },
];
const DAYS = ['오늘', '내일', '모레', '글피'];
async function getWeather(loc, force) {
  const c = store.get('wx', null);
  if (!force && c && c.lat === loc.lat && c.lon === loc.lon && Date.now() - c.at < 2 * 3600e3 && c.day === isoDay() && c.v === 2) return c;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max&hourly=precipitation_probability,precipitation,wind_speed_10m&timezone=Asia%2FSeoul&forecast_days=4&wind_speed_unit=ms`;
  const res = await fetch(u);
  const j = await res.json();
  if (!j.daily) throw new Error(j.reason || '날씨 자료가 없습니다');
  const w = { v: 2, at: Date.now(), day: isoDay(), lat: loc.lat, lon: loc.lon, elevation: j.elevation, daily: j.daily, hourly: j.hourly };
  store.set('wx', w);
  return w;
}
const cityOpts = () => `<option value="">시·군 고르기</option>${CITIES.map(([n], i) => `<option value="${i}">${n}</option>`).join('')}`;
const wxSetup = () => `<h2>날씨 경보</h2>
  <p>농장 위치를 정하면 앞으로 나흘 동안 서리·폭염·많은 비·강한 바람 예보가 있을 때 내 작목의 대책을 여기 띄워 드립니다.</p>
  <div class="row"><button class="btn" data-geo>지금 있는 곳으로</button><select data-city aria-label="가까운 시·군">${cityOpts()}</select></div>
  <p class="sub">위치는 이 기기에만 저장됩니다. 날씨를 받을 때 대략의 좌표만 Open-Meteo로 보냅니다.</p>`;
function wxHtml(w, loc) {
  const d = w.daily;
  const n = Math.min(4, d.time.length);
  const alerts = [];
  for (const rule of WX_RULES) { for (let i = 0; i < n; i++) if (rule.test(d, i)) { alerts.push({ rule, i }); break; } }
  const warnDay = (i) => WX_RULES.some((r) => r.test(d, i));
  const crops = myCrops();
  return `<h2>날씨 <small>${esc(loc.name)} 기준</small></h2>
  <div class="wx-days">${Array.from({ length: n }, (_, i) => `<div class="wx-day${warnDay(i) ? ' warn' : ''}"><span>${DAYS[i]}</span><b>${fmt(d.temperature_2m_min[i], 0)}° / ${fmt(d.temperature_2m_max[i], 0)}°</b><span>${d.precipitation_sum[i] >= 1 ? `비 ${fmt(d.precipitation_sum[i], 0)}mm` : '비 없음'}</span></div>`).join('')}</div>
  ${alerts.length ? alerts.map(({ rule, i }) => {
    const hits = crops.flatMap((c) => (c.disasters || []).filter((r) => rule.re.test(r.risk)).slice(0, 1).map((r) => ({ c, r }))).slice(0, 4);
    return `<details class="wx-alert"><summary><b>${DAYS[i]} ${rule.label(d, i)} · ${rule.name} 주의</b><span>${hits.length ? `내 작목 대책 ${hits.length}개 보기` : '내 작목 자료에 대책 없음'}</span></summary>
      ${hits.map(({ c, r }) => `<a class="wx-crop" href="#/crop/${c.id}?s=risk"><b>${esc(shortName(c))} · ${esc(r.risk)}</b><span>${esc((r.measures || []).slice(0, 3).join(' · '))}</span></a>`).join('')}</details>`;
  }).join('') : '<p class="wx-ok">앞으로 나흘 서리·폭염·많은 비·강한 바람 예보는 없습니다.</p>'}
  ${sprayHtml(w)}
  <p class="sub">${new Date(w.at).getHours()}시 ${String(new Date(w.at).getMinutes()).padStart(2, '0')}분에 받은 예보 · <button class="linkish" data-wx-change>위치 바꾸기</button> · 날씨 자료 <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>`;
}
function paintWxBanner(w) {
  const el = document.querySelector('[data-wx-banner]');
  if (!el) return;
  const d = w.daily;
  const n = Math.min(4, d.time.length);
  const hits = [];
  for (const rule of WX_RULES) for (let i = 0; i < n; i++) if (rule.test(d, i)) { hits.push(`${DAYS[i]} ${rule.name}`); break; }
  el.innerHTML = hits.length ? `<a class="wx-banner" href="#/?s=wx"><b>${hits.join(', ')} 예보</b><span>내 작목 대책 보기</span></a>` : '';
}
async function paintWeather(force) {
  const box = document.querySelector('[data-weather]');
  if (!box) return;
  const loc = settings().loc;
  if (!loc) { box.innerHTML = wxSetup(); return; }
  const c = store.get('wx', null);
  if (c && c.lat === loc.lat && c.lon === loc.lon && c.day === isoDay()) { box.innerHTML = wxHtml(c, loc); paintWxBanner(c); }
  else box.innerHTML = `<h2>날씨 <small>${esc(loc.name)} 기준</small></h2><p class="sub">예보를 받는 중입니다…</p>`;
  try {
    const w = await getWeather(loc, force);
    if (!document.contains(box)) return;
    box.innerHTML = wxHtml(w, loc);
    paintWxBanner(w);
    const st = settings();
    if (st.regionAuto && w.elevation >= 400 && st.region !== '고랭지') { setSetting({ region: '고랭지' }); toast(`농장 위치의 해발이 약 ${fmt(w.elevation, 0)}m라 지역을 <b>고랭지</b>로 맞췄습니다. <a href="#/links?s=settings">바꾸기</a>`); }
  } catch (e) {
    if (!document.contains(box)) return;
    if (!(c && c.lat === loc.lat && c.lon === loc.lon)) box.innerHTML = `<h2>날씨 <small>${esc(loc.name)} 기준</small></h2><p class="sub">예보를 받지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤 다시 받아 주세요. <button class="linkish" data-wx-retry>다시 받기</button> · <button class="linkish" data-wx-change>위치 바꾸기</button></p>`;
  }
}
function setLoc(loc) {
  const st = settings();
  const o = { loc };
  if (!st.region || st.regionAuto) { o.region = loc.lat < 34 ? '제주' : loc.lat < 36.1 ? '남부' : '중부'; o.regionAuto = true; }
  setSetting(o);
  store.set('wx', null);
  const y = window.scrollY; render(); window.scrollTo(0, y);
  toast(`날씨 위치를 <b>${esc(loc.name)}</b>(으)로 정했습니다.${o.regionAuto ? ` 지역은 <b>${o.region}</b>(으)로 맞췄습니다. <a href="#/links?s=settings">바꾸기</a>` : ''}`);
}
const regionChips = () => { const cur = settings().region; return `<div class="chips">${REGION_LIST.map((r) => `<button class="chip ${cur === r ? 'on' : ''}" data-region="${r}" aria-pressed="${cur === r}">${r}</button>`).join('')}<button class="chip ${cur ? '' : 'on'}" data-region="" aria-pressed="${!cur}">모든 지역</button></div>`; };
// 작업 줄처럼 좁은 자리에서는 긴 작형 나열을 줄인다
const shortName = (c) => c.name + (c.type && c.type.length <= 10 ? ` (${c.type})` : '');
const bare = (c) => c.name.replace(/\(.*?\)/g, '');

// 일정 항목 → [시작 slot, 끝 slot] (기간 없으면 null)
function range(s) {
  if (!s.start?.m) return null;
  const a = slot(s.start.m, s.start.p || 1);
  const e = s.end?.m ? s.end : s.start;
  const b = slot(e.m, e.p || (s.end?.m ? 3 : s.start.p || 3));
  return [a, b];
}
function covers(r, x) { return r && (r[0] <= r[1] ? x >= r[0] && x <= r[1] : x >= r[0] || x <= r[1]); }
function periodText(s) {
  if (!s.start?.m) return '';
  const one = (t) => `${t.m}월${t.p ? ' ' + XUN[t.p - 1] : ''}`;
  const a = one(s.start);
  const b = s.end?.m ? one(s.end) : a;
  return a === b ? a : `${a}~${b}`;
}
const whenText = (s) => s.text || periodText(s);
const hasDates = (c) => (c.schedule || []).some((s) => s.start?.m);
// 작업 종류 → 작목 화면에서 열어 줄 섹션
const sectionOf = (k) => (k === 'fert' ? 'fert' : k === 'pest' ? 'pest' : 'stage');

// ---------- data ----------
let CROPS = [];
let BY_ID = new Map();
async function load() {
  const res = await fetch('data/crops.json');
  if (!res.ok) throw new Error('데이터를 불러오지 못했습니다');
  const data = await res.json();
  CROPS = data.crops;
  BY_ID = new Map(CROPS.map((c) => [String(c.id), c]));
  return data;
}
const catSort = (a, b) => (CAT_ORDER.indexOf(a[0]) + 99) % 99 - (CAT_ORDER.indexOf(b[0]) + 99) % 99;
const cats = () => {
  const m = new Map();
  for (const c of CROPS) m.set(c.category, (m.get(c.category) || 0) + 1);
  return [...m.entries()].sort(catSort);
};
const myCrops = () => CROPS.filter(isFav);

// 이름 먼저(앞 글자 → 포함), 이름에서 못 찾을 때만 작형에서 찾는다
function searchCrops(raw, cat) {
  const pool = CROPS.filter((c) => !cat || c.category === cat);
  const term = raw.trim().replace(/\s+/g, '');
  if (!term) return { list: pool, alias: null };
  const run = (t) => {
    const starts = pool.filter((c) => bare(c).startsWith(t));
    const inc = pool.filter((c) => !bare(c).startsWith(t) && bare(c).includes(t));
    const paren = pool.filter((c) => !bare(c).includes(t) && c.name.includes(t) && t.length >= 2 && !/재배$/.test(t));
    return [...starts, ...inc, ...paren];
  };
  let list = run(term);
  let alias = null;
  if (!list.length && ALIAS[term]) { alias = ALIAS[term]; list = run(alias); }
  if (!list.length && term.length >= 2) list = pool.filter((c) => (c.type || '').includes(term));
  return { list, alias };
}
function nearCrops(term) {
  const chars = [...new Set(term)];
  return CROPS.map((c) => ({ c, n: chars.filter((ch) => c.name.includes(ch)).length })).filter((o) => o.n).sort((a, b) => b.n - a.n).slice(0, 6).map((o) => o.c);
}

// ---------- shared pieces ----------
const favBtn = (c, long) => `<button class="fav${long ? ' btn' : ''}" data-fav="${c.id}" aria-pressed="${isFav(c)}" aria-label="${esc(fullName(c))} ${isFav(c) ? '내 작목에서 빼기' : '내 작목에 담기'}">${isFav(c) ? (long ? '내 작목에 담김 · 빼기' : '담김') : (long ? '내 작목에 담기' : '담기')}</button>`;
const cropCard = (c) => `<div class="crop-card-w"><a class="crop-card" href="#/crop/${c.id}"><b>${esc(c.name)}</b><span>${esc(c.type || c.category)}</span>${hasDates(c) ? '' : '<span class="nodate">달력 자료 없음</span>'}</a>${favBtn(c)}</div>`;
const kindTag = (k) => `<span class="tag kind" data-kind="${esc(k || 'etc')}">${KINDS[k] || '기타'}</span>`;
const estTag = (s) => (s.est ? ' <span class="tag plain" title="원문 본문의 시기 문구에서 읽어 넣은 날짜">추정</span>' : '');

function tasksAt(crops, x) {
  const out = [];
  for (const c of crops) for (const s of regionFilter(c.schedule || [])) {
    const r = range(s);
    if (covers(r, x)) out.push({ c, s, r, x, key: taskKey(c, s, r, x), ending: r[1] === x, starting: r[0] === x });
  }
  const ord = Object.keys(KINDS);
  return out.sort((a, b) => b.ending - a.ending || ord.indexOf(a.s.kind) - ord.indexOf(b.s.kind));
}
// 지난 두 순 안에 기간이 끝났는데 완료 표시가 없는 작업
function missedTasks(crops, x) {
  const prev = [(x + 35) % 36, (x + 34) % 36];
  const out = [];
  for (const c of crops) for (const s of regionFilter(c.schedule || [])) {
    const r = range(s);
    if (!r || covers(r, x) || !prev.includes(r[1])) continue;
    const key = taskKey(c, s, r, r[1]);
    if (!isDone(key)) out.push({ c, s, r, x: r[1], key, missed: true });
  }
  return out;
}
function todoList(list, mark, check) {
  return list.map(({ c, s, x, ending, starting, missed }) => {
    const link = `<a class="todo-link" href="#/crop/${c.id}?s=${sectionOf(s.kind)}">
      ${kindTag(s.kind)}
      <div><b>${esc(s.task)}</b>${s.region ? ` <span class="tag plain">${esc(s.region)}</span>` : ''}${estTag(s)}
      <div class="todo-crop">${esc(shortName(c))}</div>
      <div class="when">${esc(whenText(s))}${missed ? ' · <span class="ending">지난 순에 끝남</span>' : !mark ? '' : ending ? ' · <span class="ending">이번 순까지</span>' : starting ? ' · 이번 순 시작' : ''}</div></div>
    </a>`;
    return `<div class="todo-item linked">${link}${check ? `<button class="done-btn" data-done="${c.id}|${c.schedule.indexOf(s)}|${x}" aria-label="${esc(shortName(c))} ${esc(s.task)} 완료">완료</button>` : ''}</div>`;
  }).join('');
}

// ---------- 홈 ----------
function yearFrag(x) {
  const mine = myCrops();
  const all = tasksAt(mine.length ? mine : CROPS, x);
  const crops = new Set(all.map((t) => t.c.id)).size;
  const now = nowSlot();
  const m = Math.floor(x / 3) + 1;
  return {
    title: slotName(x),
    rel: x === now ? '지금' : x === (now + 1) % 36 ? '다음 순' : XUN_DAYS[x % 3],
    count: all.length ? `${mine.length ? '내 작목' : '전체 작목'} ${crops}개에 작업 ${all.length}건` : '날짜가 적힌 작업이 없습니다',
    html: all.length
      ? todoList(all.slice(0, 6)) + (all.length > 6 ? `<a class="todo-item more" href="#/calendar?m=${m}&x=${(x % 3) + 1}"><b>${slotName(x)} 작업 ${all.length}건 모두 보기</b></a>` : '')
      : `<div class="todo-item"><div><b>이 순에는 날짜가 적힌 작업이 없습니다</b><div class="when">농사로 원문에 시기가 그림으로만 실린 작업은 달력에 나오지 않습니다. 작목 화면의 작업 방법을 함께 보세요.</div></div></div>`,
  };
}
function viewHome() {
  const d = today();
  const x = nowSlot();
  const mine = myCrops();
  const act = activePlantings();
  const rest = mine.filter((c) => !act.some((p) => String(p.cropId) === String(c.id)));
  const all = tasksAt(rest, x);
  const tasks = all.filter((t) => !isDone(t.key));
  const doneNow = all.filter((t) => isDone(t.key));
  const missed = missedTasks(rest, x);
  const st = settings();
  const noData = rest.filter((c) => !hasDates(c));
  const quiet = rest.filter((c) => hasDates(c) && !all.some((t) => t.c.id === c.id));
  const yx = store.get('yearSlot', null) ?? (x + 1) % 36;
  const yf = yearFrag(yx);
  const area = store.get('area', { v: 300, u: 'pyeong' });
  const py = Math.round((toM2(area.v, area.u) || 300 * PY) / PY);
  const quick = QUICK.map((id) => BY_ID.get(String(id))).filter(Boolean);
  return `<div class="home${mine.length ? ' has-crops' : ''}">
    <section class="hero">
      <div class="hero-copy">
        <h1>${d.getMonth() + 1}월 ${XUN[xunOf(d) - 1]},<br>밭에서 할 일</h1>
        <p>오늘은 ${d.getMonth() + 1}월 ${d.getDate()}일. 한 달을 열흘씩 나눈 상순·중순·하순 가운데 <b>${XUN[xunOf(d) - 1]}(${XUN_DAYS[xunOf(d) - 1]})</b>입니다.</p>
        <form class="search-big" data-search role="search">
          <input type="search" name="q" placeholder="작목 이름 (고추, 사과, 벼)" aria-label="작목 검색" autocomplete="off" enterkeyhint="search">
          <button class="btn" type="submit">찾기</button>
        </form>
      </div>
      <div class="stage">
        ${mine.length ? '<div data-wx-banner></div>' : ''}
        ${act.length ? `<h2>내 농사 ${act.length}곳</h2><div class="farm-list home-farm">${act.map((p) => farmCard(p, true)).join('')}</div>` : ''}
        ${mine.length && !act.length ? `<a class="farm-cta" href="#/farm/new"><b>필지·하우스별로 관리하기</b><span>심은 날을 등록하면 내 날짜에 맞춘 일정, 방제·수확 기록, 결산을 쓸 수 있습니다</span></a>` : ''}
        ${rest.length ? `
        <h2>${act.length ? '그 밖의 내 작목, ' : ''}이번 순 할 일 ${tasks.length}건 <small>작목 ${rest.length}개 · ${st.region ? `${st.region} 일정` : '모든 지역 일정'}</small></h2>
        ${st.region ? '' : `<div class="region-ask"><p>지역을 고르면 그 지역 일정만 남겨 목록이 짧아집니다.</p>${regionChips()}</div>`}
        <div class="frag" data-ui><div class="todo">
          ${missed.length ? `<p class="todo-h">지난 순에 끝난 일, 하셨나요?</p>${todoList(missed, false, true)}<p class="todo-h">이번 순</p>` : ''}
          ${tasks.length ? todoList(tasks, true, true) : `<div class="todo-item"><div><b>${doneNow.length ? '이번 순 할 일을 모두 끝냈습니다' : '이번 순에 날짜가 적힌 작업은 없습니다'}</b><div class="when">${doneNow.length ? '수고하셨습니다. 끝낸 일은 영농일지에 적어 두었습니다.' : '아래 작목을 눌러 작업 방법과 연간 달력을 확인하세요.'}</div></div></div>`}
          ${quiet.map((c) => `<a class="todo-item more" href="#/crop/${c.id}?s=cal"><div><b>${esc(shortName(c))}</b><div class="when">이번 순에 날짜가 적힌 작업 없음 · 연간 달력 보기</div></div></a>`).join('')}
          ${noData.map((c) => `<a class="todo-item more" href="#/crop/${c.id}?s=stage"><div><b>${esc(shortName(c))}</b><div class="when">달력 자료 없음 · 작업 방법 보기</div></div></a>`).join('')}
        </div></div>
        ${doneNow.length ? `<details class="done-box"><summary>끝낸 일 ${doneNow.length}건</summary><div class="todo">${doneNow.map((t) => `<div class="todo-item done"><div><b>${esc(t.s.task)}</b><div class="todo-crop">${esc(shortName(t.c))}</div><div class="when">${esc(doneMap()[t.key].at)} 완료 · 영농일지에 기록됨</div></div><button class="done-btn undo" data-undone="${esc(t.key)}">되돌리기</button></div>`).join('')}</div></details>` : ''}
        ` : ''}
        ${mine.length ? `<p class="more row"><a class="btn" href="#/farm">내 농사</a><a class="btn" href="#/calendar">${d.getMonth() + 1}월 달력</a><a class="btn" href="#/crops">작목 더 담기</a></p>` : `
        <h2>기르는 작목을 골라 주세요</h2>
        <p class="stage-sub">고른 작목의 이번 순 작업만 이 자리에 모아 드립니다. 가입 없이 이 기기에 저장됩니다.</p>
        <div class="quick" data-ui>${quick.map((c) => `<button class="quick-btn" data-fav="${c.id}" aria-pressed="false"><b>${esc(c.name)}</b>${c.type && c.type.length <= 8 ? `<span>${esc(c.type)}</span>` : ''}</button>`).join('')}</div>
        <p class="more row"><a class="btn" href="#/crops">전체 작목 ${CROPS.length}개에서 고르기</a></p>`}
      </div>
      ${mine.length ? '<section class="wx" id="s-wx" data-weather aria-live="polite"></section>' : ''}
    </section>

    <section class="year">
      <div class="year-head">
        <button class="step" data-yr-step="-1" aria-label="이전 순">이전</button>
        <div class="year-label" aria-live="polite"><h2 data-yr-clause>${yf.title}</h2><p><span data-yr-rel>${yf.rel}</span> · <span data-yr-count>${yf.count}</span></p></div>
        <button class="step" data-yr-step="1" aria-label="다음 순">다음</button>
      </div>
      <div class="year-ctl">
        <input type="range" min="0" max="35" step="1" value="${yx}" data-yr aria-label="한 해를 순 단위로 넘겨 보기" aria-valuetext="${slotName(yx)}">
        <div class="year-months" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span class="${Math.floor(yx / 3) === i ? 'on' : ''}">${i + 1}</span>`).join('')}</div>
      </div>
      <div class="year-frag"><div class="todo" data-ui data-yr-frag>${yf.html}</div></div>
    </section>

    <section class="area">
      <div class="area-ask">
        <h2>밭이 보통 몇 평인가요?</h2>
        <div class="area-ctl" data-ui>
          <label class="f">면적(평)<input type="number" inputmode="numeric" min="1" step="1" value="${py}" data-area-py></label>
          <input type="range" min="10" max="3000" step="10" value="${Math.min(3000, Math.max(10, py))}" data-area-range aria-label="면적 조절">
        </div>
      </div>
      <div class="area-out">
        <div class="area-fig"><span data-area-fig>${fmt(py * PY, 0)}</span><small>㎡</small></div>
        <p>작목마다 면적을 따로 정하지 않으면 이 면적으로 비료 양을 계산합니다. 작목별 면적은 작목 화면의 ‘비료 주는 양’에서 정합니다. 농사로의 비료 표는 300평(1,000㎡) 기준이고, <span data-area-ratio>${fmt(py * PY / 1000, 2)}</span>배로 환산합니다.</p>
      </div>
    </section>

    <section class="photo-band deco">
      <figure class="shutter"><img src="assets/rice-farmer-joam-ri-south-korea.jpg" alt="모내기를 마친 논에서 허리를 굽혀 모를 손보는 농부, 경기도 화성 조암리" loading="lazy" width="1920" height="1440"></figure>
      <p class="statement">농사는 때를 맞추는 일입니다. 한 달을 상순, 중순, 하순 세 칸으로 나누고 지금 칸에 든 일만 꺼내 보여 드립니다.</p>
    </section>

    <section class="poster deco">
      ${cats().map(([k, n]) => `<a class="poster-line" href="#/crops?cat=${encodeURIComponent(k)}"><b>${esc(k)}</b><span>작목 ${n}개</span></a>`).join('')}
    </section>

    <section class="archive deco">
      <p class="statement">1911년 모내기철의 논. 백 년 전에도 농부는 달력의 같은 칸에서 같은 일을 했습니다.</p>
      <div class="archive-row">
        <figure><img src="assets/farmers-of-forty-centuries-korean-rice-fields.jpg" alt="소로 써레질하며 모내기 중인 1911년의 한국 논" loading="lazy" width="1350" height="785"></figure>
        <figure><img src="assets/farmers-of-forty-centuries-rice-paddies-at.jpg" alt="산골짜기 머리에 층층이 놓인 1911년의 논" loading="lazy" width="1473" height="1132"></figure>
        <figure><img src="assets/farmers-of-forty-centuries-landscape-in-korea.jpg" alt="낮은 논두렁으로 잘게 나뉜 1911년 한국의 들" loading="lazy" width="1400" height="900"></figure>
      </div>
      <p class="credits">사진: <a href="https://commons.wikimedia.org/wiki/File:Rice_farmer_(Joam-Ri,_South_Korea).jpg" target="_blank" rel="noopener">Rice farmer (Joam-Ri, South Korea)</a>, 그리고 F. H. King 『Farmers of Forty Centuries』(1911)의 <a href="https://commons.wikimedia.org/wiki/File:Farmers_of_forty_centuries_-_Korean_rice_fields_being_transplanted.jpg" target="_blank" rel="noopener">Korean rice fields being transplanted</a>, <a href="https://commons.wikimedia.org/wiki/File:Farmers_of_forty_centuries_-_Rice_paddies_at_head_of_mountain_valley.jpg" target="_blank" rel="noopener">Rice paddies at head of mountain valley</a>, <a href="https://commons.wikimedia.org/wiki/File:Farmers_of_forty_centuries_-_Landscape_in_Korea.jpg" target="_blank" rel="noopener">Landscape in Korea</a>. 모두 퍼블릭 도메인, Wikimedia Commons.</p>
    </section>
  </div>`;
}
function paintYear(x) {
  x = ((x % 36) + 36) % 36;
  store.set('yearSlot', x === (nowSlot() + 1) % 36 ? null : x);
  const yf = yearFrag(x);
  const r = document.querySelector('[data-yr]');
  if (!r) return;
  r.value = x;
  r.setAttribute('aria-valuetext', slotName(x));
  document.querySelector('[data-yr-clause]').textContent = yf.title;
  document.querySelector('[data-yr-rel]').textContent = yf.rel;
  document.querySelector('[data-yr-count]').textContent = yf.count;
  document.querySelector('[data-yr-frag]').innerHTML = yf.html;
  document.querySelectorAll('.year-months span').forEach((el, i) => el.classList.toggle('on', i === Math.floor(x / 3)));
}

// ---------- 작목 목록 ----------
function cropResults(term, cat) {
  const { list, alias } = searchCrops(term, cat);
  if (!list.length) {
    const near = nearCrops(term.trim());
    return `<div class="empty-box"><p><b>“${esc(term.trim())}”</b> 이름의 작목을 찾지 못했습니다.${cat ? ` 지금은 <b>${esc(cat)}</b> 안에서만 찾고 있습니다.` : ''}</p>
      ${near.length ? `<p class="sub">혹시 이 작목인가요?</p><div class="chips">${near.map((c) => `<a class="chip" href="#/crop/${c.id}">${esc(fullName(c))}</a>`).join('')}</div>` : ''}
      <p><a class="btn" href="#/crops">전체 작목 보기</a></p></div>`;
  }
  const groups = new Map();
  for (const c of list) (groups.get(c.category) || groups.set(c.category, []).get(c.category)).push(c);
  const flat = term.trim() !== '';
  return (alias ? `<p class="sub">“${esc(term.trim())}”은(는) 농사로에서 <b>${esc(alias)}</b>(으)로 적습니다.</p>` : '')
    + (flat ? `<h2 class="cat-h">찾은 작목 <small>${list.length}</small></h2><div class="crop-grid">${list.map(cropCard).join('')}</div>`
      : [...groups.entries()].sort(catSort).map(([k, v]) => `<h2 class="cat-h">${esc(k)} <small>${v.length}</small></h2><div class="crop-grid">${v.map(cropCard).join('')}</div>`).join(''));
}
function viewCrops(q) {
  const term = q.get('q') || '';
  const cat = q.get('cat') || '';
  return `<div class="stack">
    <h1>작목</h1>
    <form class="search-big" data-search role="search">
      <input type="search" name="q" value="${esc(term)}" placeholder="작목 이름을 적으면 바로 찾습니다" aria-label="작목 검색" autocomplete="off" enterkeyhint="search" data-live data-cat="${esc(cat)}">
      <button class="btn" type="submit">찾기</button>
    </form>
    <div class="chips scroll" aria-label="분류">
      <a class="chip ${cat ? '' : 'on'}" href="#/crops">전체 <span class="n">${CROPS.length}</span></a>
      ${cats().map(([k, n]) => `<a class="chip ${cat === k ? 'on' : ''}" href="#/crops?cat=${encodeURIComponent(k)}">${esc(k)} <span class="n">${n}</span></a>`).join('')}
    </div>
    <p class="row"><a class="btn quiet" href="#/calendar">월별 농작업 달력</a><a class="btn quiet" href="#/farm/new">작기 등록</a></p>
    <p class="sub">기르는 작목의 <b>담기</b>를 누르면 ‘오늘’ 화면과 달력에 그 작목의 작업만 모아 보여 드립니다.</p>
    <div data-results>${cropResults(term, cat)}</div>
  </div>`;
}

// ---------- 작목 상세 ----------
function gantt(c) {
  const rows = (c.schedule || []).map((s) => ({ s, r: range(s) })).filter((o) => o.r).sort((a, b) => a.r[0] - b.r[0]);
  if (!rows.length) return '';
  const x = nowSlot();
  const m = today().getMonth() + 1;
  const cells = Array.from({ length: 12 }, (_, i) => `<i class="g-m" style="grid-column:${i * 3 + 1}/span 3"></i>`).join('');
  const bar = (a, b, s) => `<i class="g-bar grow${s.est ? ' est' : ''}" data-kind="${esc(s.kind || 'etc')}" style="grid-column:${a + 1}/${b + 2}"></i>`;
  return `<div class="only-wide"><div class="gantt" data-ui role="img" aria-label="${esc(fullName(c))} 연간 농작업 달력">
    <div class="g-row"><span></span><div class="g-months">${Array.from({ length: 12 }, (_, i) => `<span class="${i + 1 === m ? 'now' : ''}">${i + 1}월</span>`).join('')}</div></div>
    ${rows.map(({ s, r }) => `<div class="g-row">
      <div class="g-label">${esc(s.task)}${s.region ? `<small>${esc(s.region)}</small>` : ''}</div>
      <div class="g-track" title="${esc(whenText(s))}">${cells}${r[0] <= r[1] ? bar(r[0], r[1], s) : bar(r[0], 35, s) + bar(0, r[1], s)}<i class="g-now" style="left:${((x + 0.5) / 36) * 100}%"></i></div>
    </div>`).join('')}
  </div>
  <div class="legend">${Object.entries(KINDS).map(([k, v]) => `<span data-kind="${k}"><i></i>${v}</span>`).join('')}<span><i style="background:var(--ink);width:4px"></i>지금</span><span><i class="est-key"></i>추정(본문 시기 문구)</span></div></div>
  <ol class="cal-list only-narrow">${rows.map(({ s, r }) => `<li class="${covers(r, x) ? 'now' : ''}" data-kind="${esc(s.kind || 'etc')}">
    <div class="cal-when">${esc(periodText(s))}${covers(r, x) ? ' <span class="tag plain on">지금</span>' : ''}</div>
    <div><b>${esc(s.task)}</b>${s.region ? ` <span class="tag plain">${esc(s.region)}</span>` : ''}${estTag(s)}</div>
    <div class="row">${kindTag(s.kind)}${s.text && s.text !== periodText(s) ? `<span class="when">${esc(s.text)}</span>` : ''}</div>
  </li>`).join('')}</ol>`;
}

// 시비 표 단위의 기준 면적(㎡): kg/10a → 1000, kg/ha → 10000, 그 밖은 환산하지 않음
const unitBase = (u) => (/10\s*a/i.test(u || '') ? 1000 : /\/\s*ha/i.test(u || '') ? 10000 : 0);
function fertTable(c, areaM2) {
  const f = c.fertilizer;
  if (!f?.rows?.length) return '';
  const k = unitBase(f.unit) ? areaM2 / unitBase(f.unit) : 1;
  const val = (v) => (typeof v === 'number' ? kg(v * k) : esc(v ?? '–'));
  const cols = f.columns || [];
  return `<div class="only-wide"><table>
    <thead><tr><th>구분</th>${cols.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${f.rows.map((r) => `<tr><th>${esc(r.name)}</th>${(r.values || []).map((v) => `<td>${val(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <div class="fert-list only-narrow">${cols.map((h, j) => {
    const items = f.rows.map((r) => ({ n: r.name, v: (r.values || [])[j] })).filter((o) => o.v != null && o.v !== '');
    return items.length ? `<div class="fert-round"><h3>${esc(h)}</h3><dl class="kv">${items.map((o) => `<dt>${esc(o.n)}</dt><dd>${val(o.v)}</dd>`).join('')}</dl></div>` : '';
  }).join('')}</div>`;
}
const areaNow = (cid) => { const per = cid ? store.get('areas', {})[cid] : null; const a = per || store.get('area', { v: 300, u: 'pyeong' }); return { a, m2: toM2(a.v, a.u) || 1000, own: !!per }; };
const unitOpts = (u) => Object.entries(UNITS).map(([k, o]) => `<option value="${k}" ${k === u ? 'selected' : ''}>${o.label}</option>`).join('');

function viewCrop(id) {
  const c = BY_ID.get(String(id));
  if (!c) return `<div class="stack"><p class="empty">작목을 찾을 수 없습니다. <a href="#/crops">작목 목록으로</a></p></div>`;
  const noPeriod = (c.schedule || []).filter((s) => !range(s));
  const { a: area, m2, own } = areaNow(c.id);
  const pestFull = (c.pests || []).filter((p) => p.timing || p.control);
  const pestBare = (c.pests || []).filter((p) => !p.timing && !p.control);
  const has = { cal: (c.schedule || []).length, stage: (c.stages || []).length, fert: c.fertilizer?.rows?.length, pest: (c.pests || []).length, risk: (c.disasters || []).length };
  const jump = [['cal', '달력'], ['stage', '작업 방법'], ['fert', '비료'], ['pest', '병해충'], ['risk', '재해 대책']].filter(([k]) => has[k]);
  return `<div class="stack" data-crop="${c.id}">
    <header class="crop-head">
      <div class="spread">
        <div><h1>${esc(c.name)}</h1><p class="type"><a href="#/crops?cat=${encodeURIComponent(c.category)}">${esc(c.category)}</a>${c.type ? ' · ' + esc(c.type) : ''}</p></div>
        <div class="row">${favBtn(c, true)}<a class="btn quiet" href="#/diary?crop=${c.id}">일지 쓰기</a><button class="btn quiet only-wide-i" data-print>인쇄</button></div>
      </div>
      ${c.summary ? `<p class="lede">${esc(c.summary)}</p>` : ''}
    </header>
    <nav class="jump chips scroll" aria-label="이 화면 안에서 이동"><a class="chip back" href="#/crops">작목 목록</a>${jump.map(([k, v]) => `<button class="chip" data-jump="${k}">${v}</button>`).join('')}</nav>
    ${(c.env || []).length ? `<section class="card"><h2>재배 환경 기준</h2><dl class="facts">${c.env.map((e) => `<div class="fact"><dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl></section>` : ''}
    ${has.cal ? `<section class="card" id="s-cal"><h2>연간 농작업 달력</h2>
      ${gantt(c) || '<p class="notice">이 작목은 농사로 원문에 작업 시기가 그림으로만 실려 있어 달력을 그리지 못했습니다. 아래 작업 이름과 작업 방법을 참고하고, 정확한 시기는 원문에서 확인하세요.</p>'}
      ${noPeriod.length ? `<h3 class="sub-h">날짜를 못 넣은 작업 ${noPeriod.length}개</h3><p class="sub">원문에 시기가 그림으로만 실려 달력에 넣지 못했습니다. <a href="${esc(c.source)}" target="_blank" rel="noopener">농사로 원문 달력 보기</a></p><div class="chips undated">${noPeriod.map((s) => `<span class="tag plain">${esc(s.task)}</span>`).join('')}</div>` : ''}
    </section>` : ''}
    ${has.stage ? `<section class="card" id="s-stage"><h2>단계별 작업 방법</h2><div class="stages">${c.stages.map((s) => `<div class="stage-b">
      <h3>${esc(s.title)}${s.timing ? `<small>${esc(s.timing)}</small>` : ''}</h3>
      <dl class="kv">${(s.items || []).map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl></div>`).join('')}</div></section>` : ''}
    ${has.fert ? `<section class="card" id="s-fert"><h2>비료 주는 양 <small data-fert-unit></small></h2>
      <div class="calc-bar" data-area-scope="${c.id}">
        <label class="f">이 작목 밭 면적<input type="number" inputmode="decimal" min="0" step="any" data-area value="${esc(area.v)}"></label>
        <label class="f">단위<select data-area-unit>${unitOpts(area.u)}</select></label>
        ${own ? '<button class="btn quiet" data-area-reset>기본 면적으로</button>' : ''}
      </div>
      <div data-fert>${fertTable(c, m2)}</div>
      ${c.fertilizer.note ? `<p class="sub">${esc(c.fertilizer.note)}</p>` : ''}
      <p class="sub"><b>밑거름</b>은 심기 전에 한꺼번에 주는 비료, <b>웃거름</b>은 자라는 동안 나눠 주는 비료입니다. 표의 질소·인산·칼리는 비료 속 성분의 무게입니다.</p>
      <p class="row"><a class="btn" href="#/tools?crop=${c.id}">비료 포대 수로 계산하기</a></p>
      <p class="sub">표는 표준 기준입니다. 토양검정을 받으면 내 밭에 맞는 처방을 받을 수 있습니다 (<a href="https://soil.rda.go.kr" target="_blank" rel="noopener">흙토람</a>).</p>
    </section>` : ''}
    ${has.pest ? `<section class="card" id="s-pest"><h2>병해충·생리장해</h2>
      <div class="pests">${pestFull.map((p) => `<div class="pest"><h3>${esc(p.name)}${p.kind ? ` <span class="tag plain">${esc(p.kind)}</span>` : ''}</h3>
        <dl class="kv">${p.timing ? `<dt>나오는 때</dt><dd>${esc(p.timing)}</dd>` : ''}${p.control ? `<dt>방제·대책</dt><dd>${esc(p.control)}</dd>` : ''}</dl></div>`).join('')}</div>
      ${pestBare.length ? `<p class="sub">${pestFull.length ? '그 밖에 ' : ''}원문에 이름만 실린 병해충: ${pestBare.map((p) => esc(p.name)).join(', ')}</p>` : ''}
      <p class="sub">쓸 수 있는 농약과 안전사용기준은 <a href="https://psis.rda.go.kr" target="_blank" rel="noopener">농약안전정보시스템</a>, 병해충 예찰·진단은 <a href="https://ncpms.rda.go.kr" target="_blank" rel="noopener">국가농작물병해충관리시스템</a>에서 확인하세요.</p>
    </section>` : ''}
    ${has.risk ? `<section class="card" id="s-risk"><h2>기상재해 대책</h2><div class="risks">${c.disasters.map((r) => `<div class="risk"><h3>${esc(r.risk)}${r.timing ? `<small>${esc(r.timing)}</small>` : ''}</h3><ul class="dots">${(r.measures || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></section>` : ''}
    ${(c.notes || []).length ? `<section class="card"><h2>참고</h2><ul class="dots">${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    <p class="source">출처: 농촌진흥청 농사로 농작업일정 「${esc(fullName(c))}」 · <a href="${esc(c.source)}" target="_blank" rel="noopener">원문 보기</a>${c.sciName || c.family ? `<br>${esc([c.sciName, c.family].filter(Boolean).join(' · '))}` : ''}</p>
  </div>`;
}
function paintCropFert() {
  const root = document.querySelector('[data-crop]');
  const box = root?.querySelector('[data-fert]');
  if (!box) return;
  const c = BY_ID.get(root.dataset.crop);
  const { m2 } = areaNow(c.id);
  box.innerHTML = fertTable(c, m2);
  const base = unitBase(c.fertilizer.unit);
  root.querySelector('[data-fert-unit]').textContent = base ? `${fmt(m2 / PY, 0)}평(${fmt(m2, 0)}㎡)에 주는 양, kg` : (c.fertilizer.unit || '');
}

// ---------- 달력 ----------
function viewCalendar(q) {
  const cur = today();
  const m = Math.min(12, Math.max(1, Number(q.get('m')) || cur.getMonth() + 1));
  const xq = q.get('x');
  const x = xq == null ? (m === cur.getMonth() + 1 ? xunOf(cur) : 0) : Math.min(3, Math.max(0, Number(xq) || 0));
  const scope = q.get('scope') || (favs.size ? 'mine' : 'all');
  const cat = q.get('cat') || '';
  const kind = q.get('kind') || '';
  const more = q.get('more') === '1';
  const link = (o) => { const p = new URLSearchParams({ m, x, scope, cat, kind, ...o }); for (const [k, v] of [...p]) if (v === '') p.delete(k); return '#/calendar?' + p; };
  const pool = (scope === 'mine' ? myCrops() : CROPS).filter((c) => !cat || c.category === cat);
  const slots = x ? [slot(m, x)] : [slot(m, 1), slot(m, 2), slot(m, 3)];
  const groups = [];
  for (const c of pool) {
    const ts = regionFilter(c.schedule || []).map((s) => ({ s, r: range(s) })).filter(({ s, r }) => r && (!kind || s.kind === kind) && slots.some((sl) => covers(r, sl)));
    if (ts.length) groups.push({ c, ts });
  }
  const shown = more ? groups : groups.slice(0, 20);
  const curM = cur.getMonth() + 1;
  const filtered = cat || kind || x;
  return `<div class="stack">
    <h1>월별 농작업 달력</h1>
    <div class="months">${Array.from({ length: 12 }, (_, i) => `<button data-go="${link({ m: i + 1, x: '', more: '' })}" aria-pressed="${i + 1 === m}" class="${i + 1 === curM ? 'now' : ''}">${i + 1}월</button>`).join('')}</div>
    <div class="filters">
      <div class="filter"><span class="filter-l">시기</span><div class="chips scroll">
        <a class="chip ${x === 0 ? 'on' : ''}" href="${link({ x: 0, more: '' })}">${m}월 전체</a>
        ${[1, 2, 3].map((p) => `<a class="chip ${x === p ? 'on' : ''}" href="${link({ x: p, more: '' })}">${XUN[p - 1]} <span class="n">${XUN_DAYS[p - 1]}</span></a>`).join('')}
      </div></div>
      <div class="filter"><span class="filter-l">범위</span><div class="chips scroll">
        <a class="chip ${scope === 'mine' ? 'on' : ''}" href="${link({ scope: 'mine', more: '' })}">내 작목</a>
        <a class="chip ${scope === 'all' ? 'on' : ''}" href="${link({ scope: 'all', more: '' })}">전체 작목</a>
      </div></div>
      <div class="filter"><span class="filter-l">분류</span><div class="chips scroll">
        <a class="chip ${cat ? '' : 'on'}" href="${link({ cat: '', more: '' })}">모두</a>
        ${cats().map(([k]) => `<a class="chip ${cat === k ? 'on' : ''}" href="${link({ cat: k, more: '' })}">${esc(k)}</a>`).join('')}
      </div></div>
      <div class="filter"><span class="filter-l">작업</span><div class="chips scroll">
        <a class="chip ${kind ? '' : 'on'}" href="${link({ kind: '', more: '' })}">모두</a>
        ${Object.entries(KINDS).map(([k, v]) => `<a class="chip ${kind === k ? 'on' : ''}" href="${link({ kind: k, more: '' })}">${v}</a>`).join('')}
      </div></div>
    </div>
    ${settings().region ? `<p class="sub"><b>${settings().region}</b> 일정만 보는 중입니다. <a href="#/links?s=settings">지역 바꾸기</a></p>` : ''}
    <section class="card"><h2>${m}월${x ? ' ' + XUN[x - 1] : ''} 작업 <small>작목 ${groups.length}개 · 세 칸은 상순·중순·하순</small></h2>
      ${groups.length ? '<div class="cal-groups">' + shown.map(({ c, ts }) => `<div class="cal-group"><a href="#/crop/${c.id}?s=cal">${esc(fullName(c))}</a><div class="cal-tasks">
        ${ts.map(({ s, r }) => `<div class="cal-task" data-kind="${esc(s.kind || 'etc')}">${kindTag(s.kind)}<span>${esc(s.task)}${s.region ? ` <span class="tag plain">${esc(s.region)}</span>` : ''}${estTag(s)}</span>
          <span class="when"><span class="xun" aria-hidden="true">${[1, 2, 3].map((p) => `<i class="${covers(r, slot(m, p)) ? 'on' : ''}"></i>`).join('')}</span> ${esc(whenText(s))}</span></div>`).join('')}
      </div></div>`).join('') + '</div>' + (groups.length > shown.length ? `<p class="row" style="margin-top:16px"><a class="btn" href="${link({ more: 1 })}">나머지 작목 ${groups.length - shown.length}개 더 보기</a></p>` : '')
      : `<div class="empty-box">${scope === 'mine' && !favs.size
        ? '<p>아직 담은 작목이 없습니다.</p><p class="row"><a class="btn" href="#/crops">작목 담으러 가기</a><a class="btn quiet" href="' + link({ scope: 'all' }) + '">전체 작목으로 보기</a></p>'
        : `<p>이 조건에 날짜가 적힌 작업이 없습니다.</p>${filtered ? `<p class="row"><a class="btn" href="${link({ cat: '', kind: '', x: 0 })}">조건 지우고 ${m}월 전체 보기</a></p>` : ''}`}</div>`}
    </section>
    <p class="sub">농사로 원문에 시기가 그림으로만 실린 작업은 이 달력에 나오지 않습니다. 작목 화면의 작업 방법을 함께 확인하세요.</p>
  </div>`;
}

// ---------- 계산기 ----------
const PY = 400 / 121; // 1평 = 3.3058㎡
const UNITS = {
  pyeong: { label: '평', m2: PY },
  m2: { label: '㎡', m2: 1 },
  a: { label: 'a (아르)', m2: 100 },
  danbo: { label: '단보 (300평)', m2: 1000 },
  ha: { label: 'ha (정보)', m2: 10000 },
};
const toM2 = (v, u) => (Number(v) || 0) * (UNITS[u]?.m2 || 1);
const FERT_DEFAULT = { n: { name: '요소', pct: 46 }, p: { name: '용성인비', pct: 20 }, k: { name: '염화칼리', pct: 60 }, bag: 20 };

function viewTools(q) {
  const fc = store.get('fert', FERT_DEFAULT);
  const withFert = CROPS.filter((c) => c.fertilizer?.rows?.length);
  const mine = withFert.filter(isFav);
  let sel = q.get('crop') || store.get('toolCrop', '') || (mine[0]?.id ?? withFert[0]?.id ?? '');
  if (!BY_ID.get(String(sel))?.fertilizer?.rows?.length) sel = withFert[0]?.id ?? '';
  const { a: area } = areaNow(sel);
  const opt = (c) => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(fullName(c))}</option>`;
  return `<div class="stack">
    <h1>비료 계산기</h1>
    <section class="card"><h2>${sel ? esc(shortName(BY_ID.get(String(sel)))) + ' ' : ''}밭 면적</h2>
      <div class="form" data-area-scope="${esc(sel)}">
        <label class="f">면적<input type="number" inputmode="decimal" min="0" step="any" data-area value="${esc(area.v)}"></label>
        <label class="f">단위<select data-area-unit>${unitOpts(area.u)}</select></label>
      </div>
      <dl class="facts" style="margin-top:14px" data-area-out></dl>
    </section>
    <section class="card"><h2>비료 몇 포대가 필요한가요?</h2>
      ${withFert.length ? `
      <div class="form">
        <label class="f wide">작목<select data-tool-crop>${mine.length ? `<optgroup label="내 작목">${mine.map(opt).join('')}</optgroup><optgroup label="전체 작목">${withFert.filter((c) => !isFav(c)).map(opt).join('')}</optgroup>` : withFert.map(opt).join('')}</select></label>
      </div>
      <div data-tool-real style="margin-top:16px"></div>
      <h3 class="sub-h">내가 쓰는 비료에 맞추기</h3>
      <p class="sub">비료 포대에 적힌 성분 함량(%)과 포대 무게를 넣으면 위 포대 수가 다시 계산됩니다. 처음 값은 요소(질소 46%), 용성인비(인산 20%), 염화칼리(칼리 60%), 20kg 포대입니다.</p>
      <div class="form">
        <label class="f">질소 비료 함량(%)<input type="number" inputmode="decimal" min="1" max="100" step="any" data-fc="n" value="${esc(fc.n.pct)}"></label>
        <label class="f">인산 비료 함량(%)<input type="number" inputmode="decimal" min="1" max="100" step="any" data-fc="p" value="${esc(fc.p.pct)}"></label>
        <label class="f">칼리 비료 함량(%)<input type="number" inputmode="decimal" min="1" max="100" step="any" data-fc="k" value="${esc(fc.k.pct)}"></label>
        <label class="f">포대 무게(kg)<input type="number" inputmode="decimal" min="1" step="any" data-fc="bag" value="${esc(fc.bag)}"></label>
      </div>
      <p class="sub">복합비료를 쓰면 한 포대에 여러 성분이 함께 들어 있으니 겹치는 양을 빼고 주세요.</p>
      <h3 class="sub-h">농사로 표준 비료량</h3>
      <div data-tool-fert></div>
      ` : '<p class="sub">비료 표가 있는 작목 자료가 없습니다.</p>'}
    </section>
    <section class="card" id="s-mix"><h2>농약 희석 계산</h2>
      <div class="form">
        <label class="f">희석 배수(배)<input type="number" inputmode="numeric" min="1" step="any" value="${esc(store.get('mixRatio', 1000))}" data-mix-tool data-mix-ratio></label>
        <label class="f">물 양(L)<input type="number" inputmode="decimal" min="0" step="any" value="20" data-mix-tool data-mix-water></label>
      </div>
      <div class="chips" style="margin-top:10px">${[20, 100, 200, 500, 1000].map((v) => `<button class="chip" data-mix-set="${v}">${v}L</button>`).join('')}</div>
      <p class="mix-out" data-mix-tool-out></p>
      <h3 class="sub-h">내 밭 전체에 뿌리려면</h3>
      <div class="form">
        <label class="f">300평(10a)당 물 양(L)<input type="number" inputmode="decimal" min="1" step="any" value="${esc(store.get('sprayPer10a', 200))}" data-mix-tool data-spray-per></label>
        <label class="f">약통(탱크) 크기(L)<input type="number" inputmode="decimal" min="1" step="any" value="${esc(store.get('tankL', 500))}" data-mix-tool data-tank></label>
      </div>
      <div data-mix-area></div>
      <p class="sub">희석 배수는 농약 포장에 적힌 값을 쓰세요. 1000배는 물 1L에 약 1ml(g)입니다. 살포량은 작물과 생육 단계에 따라 다르니 포장의 안내를 따르세요.</p>
    </section>
  </div>`;
}
function paintTools() {
  const { m2 } = areaNow(document.querySelector('[data-tool-crop]')?.value);
  const mr = document.querySelector('[data-mix-ratio]');
  if (mr) {
    const ratio = Number(mr.value); store.set('mixRatio', ratio || 1000);
    const water = Number(document.querySelector('[data-mix-water]').value);
    const per = Number(document.querySelector('[data-spray-per]').value) || 200;
    const tank = Number(document.querySelector('[data-tank]').value) || 500; store.set('tankL', tank);
    document.querySelector('[data-mix-tool-out]').innerHTML = mixAmount(ratio, water) == null ? '' : `물 ${fmt(water, 0)}L에 약 <b>${mixText(mixAmount(ratio, water))}</b>`;
    const totalW = per * m2 / 1000;
    document.querySelector('[data-mix-area]').innerHTML = `<div class="bags"><div class="bag"><span class="bag-n">필요한 물</span><b>${fmt(totalW, 0)}<small>L</small></b><span class="when">${fmt(m2 / PY, 0)}평 기준</span></div><div class="bag"><span class="bag-n">필요한 약</span><b>${mixText(mixAmount(ratio, totalW)) || '–'}</b><span class="when">${fmt(ratio, 0)}배</span></div><div class="bag"><span class="bag-n">약통</span><b>${fmt(Math.ceil(totalW / tank * 10) / 10, 1)}<small>통</small></b><span class="when">${fmt(tank, 0)}L 통 하나에 약 ${mixText(mixAmount(ratio, tank))}</span></div></div>`;
  }
  const out = document.querySelector('[data-area-out]');
  if (out) out.innerHTML = [['평', m2 / PY, 0], ['㎡', m2, 0], ['단보(300평)', m2 / 1000, 2], ['ha', m2 / 10000, 3]].map(([l, v, d]) => `<div class="fact"><dt>${l}</dt><dd>${fmt(v, d)}</dd></div>`).join('');
  const selEl = document.querySelector('[data-tool-crop]');
  if (!selEl) return;
  const c = BY_ID.get(String(selEl.value));
  store.set('toolCrop', selEl.value);
  const base = unitBase(c.fertilizer.unit);
  document.querySelector('[data-tool-fert]').innerHTML = `<p class="sub">${base ? `${fmt(m2 / PY, 0)}평(${fmt(m2, 0)}㎡)에 주는 양, kg` : `단위 ${esc(c.fertilizer.unit || '')} · 면적 환산을 하지 않는 표입니다`}</p>` + fertTable(c, m2);
  const fc = store.get('fert', FERT_DEFAULT);
  const total = (re) => { const r = c.fertilizer.rows.find((o) => re.test(o.name)); const v = r?.values?.find((o) => typeof o === 'number'); return typeof v === 'number' && base ? v * m2 / base : null; };
  const rows = [['질소', /질소/, fc.n], ['인산', /인산/, fc.p], ['칼리', /칼리|칼륨|가리/, fc.k]].map(([n, re, f]) => ({ n, f, t: total(re) })).filter((o) => o.t != null);
  document.querySelector('[data-tool-real]').innerHTML = rows.length
    ? `<div class="bags">${rows.map(({ n, f, t }) => { const real = t / (f.pct / 100); return `<div class="bag"><span class="bag-n">${n} 비료 <small>성분 ${fmt(f.pct, 1)}%</small></span><b>${fmt(real / fc.bag, 1)}<small>포대</small></b><span class="when">비료 ${kg(real)}kg · 성분으로는 ${kg(t)}kg</span></div>`; }).join('')}</div>
       <p class="sub">${esc(fullName(c))} ${fmt(m2 / PY, 0)}평, 한 해 전체(${esc(c.fertilizer.columns?.[0] || '합계')}) 기준 · ${fmt(fc.bag, 0)}kg 포대</p>`
    : '<p class="notice">이 작목의 비료 표는 질소·인산·칼리 성분량으로 적혀 있지 않아 포대 수로 바꿀 수 없습니다. 아래 표준 비료량 표를 그대로 참고하세요.</p>';
}

// ---------- 일지 ----------
const WORKS = ['경운·정지', '파종', '육묘', '정식·이앙', '물 관리', '비료', '방제', '제초', '전정·유인', '수확', '출하', '기타'];
const diary = () => store.get('diary', []);
function viewDiary(q) {
  const list = diary().sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const pre = q.get('crop') ? BY_ID.get(q.get('crop')) : null;
  const d = today();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // 날짜 입력란 형식
  const year = String(d.getFullYear());
  const yl = list.filter((e) => e.date.startsWith(year));
  const hours = yl.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const cost = yl.reduce((s, e) => s + (Number(e.cost) || 0), 0);
  const names = [...new Set([...myCrops().map(fullName), ...CROPS.map(fullName)])];
  return `<div class="stack">
    <h1>영농일지</h1>
    <div class="grid-2">
      <section class="card"><h2>오늘 작업 기록</h2>
        <form class="form" data-diary-form>
          <label class="f">날짜<input type="date" name="date" value="${iso}" required></label>
          <label class="f">작목<input type="text" name="crop" list="croplist" value="${esc(pre ? fullName(pre) : '')}" placeholder="예: 고추" required><datalist id="croplist">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="f">작업<select name="work">${WORKS.map((w) => `<option>${w}</option>`).join('')}</select></label>
          <label class="f">밭·하우스 이름<input type="text" name="field" placeholder="예: 앞밭, 2동"></label>
          <label class="f wide">쓴 자재와 양 (비료·농약·종자)<input type="text" name="input" placeholder="예: 요소 20kg"></label>
          <label class="f">작업 시간(시간)<input type="number" name="hours" min="0" step="0.5" inputmode="decimal"></label>
          <label class="f">비용(원)<input type="number" name="cost" min="0" step="1" inputmode="numeric"></label>
          <label class="f wide">메모<textarea name="memo" placeholder="자람 상태, 날씨, 특이사항"></textarea></label>
          <div class="wide"><button class="btn primary" type="submit">기록 저장</button></div>
        </form>
      </section>
      <div class="stack">
        <section class="card" id="s-diary"><h2>기록 <small>${list.length}건</small></h2>
          ${list.length ? '<div class="entries">' + list.map(entryHtml).join('') + '</div>' : '<p class="sub">아직 기록이 없습니다. 오늘 한 작업을 적어 보세요.</p>'}
        </section>
        <section class="card"><h2>${year}년 요약</h2>
          <div class="stat"><div><b>${yl.length}</b><span>기록</span></div><div><b>${fmt(hours, 1)}</b><span>작업 시간</span></div><div><b>${fmt(cost, 0)}</b><span>비용(원)</span></div></div>
          <p class="sub" style="margin-top:14px">일지는 이 기기에만 저장됩니다. 휴대폰을 바꾸거나 인터넷 기록을 지우기 전에 백업 파일을 받아 두세요.</p>
          <div class="row" style="margin-top:12px">
            <button class="btn quiet" data-diary-backup>백업 파일 받기</button>
            <label class="btn quiet">백업 불러오기<input type="file" accept="application/json" data-diary-restore hidden></label>
            <button class="btn quiet" data-diary-csv>엑셀용 파일 받기</button>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 더보기 ----------
const LINKS = [
  ['농사로', '농촌진흥청 농업기술 포털 (이 사이트의 원자료)', 'https://www.nongsaro.go.kr'],
  ['농약안전정보시스템', '작물별로 쓸 수 있는 농약과 안전사용기준', 'https://psis.rda.go.kr'],
  ['국가농작물병해충관리시스템', '병해충 예찰·진단·방제 정보', 'https://ncpms.rda.go.kr'],
  ['흙토람', '토양검정, 내 밭에 맞는 비료 처방', 'https://soil.rda.go.kr'],
  ['농업날씨 365', '농업기상, 작목별 기상재해 정보', 'https://weather.rda.go.kr'],
  ['농사로 농작업일정 원문', '작목별 농작업일정 그림과 파일', 'https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleLst.ps?menuId=PS00087'],
];
const WORDS = [
  ['순(旬)', '한 달을 열흘씩 나눈 것. 상순은 1~10일, 중순은 11~20일, 하순은 21일~말일.'],
  ['밑거름', '씨를 뿌리거나 모를 심기 전에 한꺼번에 주는 비료.'],
  ['웃거름', '작물이 자라는 동안 나눠서 더 주는 비료.'],
  ['10a (단보)', '1,000㎡, 약 300평. 농사로의 비료 표는 이 면적을 기준으로 적혀 있습니다.'],
  ['성분량', '비료 포대 무게가 아니라 그 속에 든 질소·인산·칼리의 무게. 요소 20kg 한 포대의 질소 성분은 9.2kg입니다.'],
  ['아주심기(정식)', '모를 기른 뒤 본밭에 옮겨 심는 일.'],
  ['작형', '같은 작목을 기르는 방식과 철. 촉성(제철보다 일찍), 억제(늦게), 보통재배 등으로 나뉩니다.'],
  ['추정', '원문 달력 그림이 아니라 본문의 시기 문구에서 읽어 달력에 넣은 날짜.'],
];
function viewLinks(meta) {
  const dated = CROPS.filter(hasDates).length;
  return `<div class="stack">
    <h1>더보기</h1>
    <div class="link-grid top"><a class="link-card" href="#/tools"><b>비료·농약 계산기</b><span>비료 포대 수, 농약 희석량, 약통 수</span></a><a class="link-card" href="#/calendar"><b>월별 농작업 달력</b><span>달마다 모든 작목의 작업</span></a><a class="link-card" href="#/diary"><b>영농일지</b><span>오늘 한 작업, 쓴 자재, 비용 적기</span></a></div>
    <section class="card" id="s-settings"><h2>내 설정</h2>
      <h3 class="sub-h">내 지역</h3>
      <p class="sub">고른 지역의 일정만 ‘오늘’ 화면과 달력에 보여 드립니다. 지역 구분이 없는 작업은 그대로 나오고, 내 지역 자료가 아예 없는 작목은 모든 지역 일정을 보여 드립니다.</p>
      ${regionChips()}
      <h3 class="sub-h">날씨 위치</h3>
      ${settings().loc ? `<p>지금: <b>${esc(settings().loc.name)}</b></p>` : '<p class="sub">아직 정하지 않았습니다.</p>'}
      <div class="row"><button class="btn quiet" data-geo>지금 있는 곳으로</button><select data-city aria-label="가까운 시·군">${cityOpts()}</select>${settings().loc ? '<button class="btn quiet" data-wx-clear>위치 지우기</button>' : ''}</div>
      <h3 class="sub-h">글자 크기</h3>
      <div class="row"><button class="btn quiet" data-big aria-pressed="${settings().big}">${settings().big ? '글자 보통' : '글자 크게'}</button></div>
    </section>
    <section class="card"><h2>용어 풀이</h2><dl class="words">${WORDS.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl></section>
    <section class="card"><h2>농촌진흥청 서비스</h2>
      <div class="link-grid">${LINKS.map(([t, d, u]) => `<a class="link-card" href="${u}" target="_blank" rel="noopener"><b>${t}</b><span>${d}</span></a>`).join('')}</div>
    </section>
    <section class="card"><h2>이 사이트의 자료</h2>
      <ul class="dots">
        <li>수록 작목 <b>${CROPS.length}</b>개(작형 포함), 그중 달력에 날짜가 있는 작목 ${dated}개 · 자료 정리일 ${esc(meta.updated || '')}</li>
        <li>모든 수치는 농촌진흥청 농사로 「농작업일정」 원문에서 가져왔고, 작목마다 원문 링크가 있습니다.</li>
        <li>원문 달력은 그림이라 본문에 글로 적힌 시기만 달력에 넣었습니다. 본문 문구에서 읽어 넣은 날짜는 ‘추정’으로 표시합니다.</li>
        <li>이용 조건: 공공누리 제2유형 (출처표시, 상업적 이용금지).</li>
      </ul>
    </section>
    <section class="card"><h2>내 데이터</h2>
      <p class="sub" style="margin-bottom:12px">내 작목, 면적, 영농일지는 이 기기에만 저장됩니다.</p>
      <button class="btn danger" data-reset>이 기기의 내 데이터 모두 지우기</button>
    </section>
  </div>`;
}

// ---------- 내 농사: 필지·동마다 심은 날을 기준으로 한 내 일정, 기록, 결산 ----------
const DAY = 864e5;
const plantings = () => store.get('plantings', []);
const savePlantings = (a) => store.set('plantings', a);
const getPlanting = (id) => plantings().find((p) => p.id === id);
const activePlantings = () => plantings().filter((p) => !p.ended && BY_ID.get(String(p.cropId)));
const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);
const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
const mdRange = (a, b) => (dayDiff(b, a) <= 0 ? md(a) : a.getMonth() === b.getMonth() ? `${md(a)}~${b.getDate()}일` : `${md(a)}~${md(b)}`);
const XS = [1, 11, 21], XE = [10, 20, 28], XM = [5, 15, 25];
const REF_Y = 2001; // 윤년이 아닌 기준 해
const tDate = (t, which) => new Date(REF_Y, t.m - 1, t.p ? (which === 's' ? XS : which === 'e' ? XE : XM)[t.p - 1] : (which === 's' ? 1 : which === 'e' ? 28 : 15));
const labelOf = (task) => (String(task).match(/\(([^)]+)\)/) || [])[1] || '';
const ANCHOR_WORD = { plant: '아주심기', sow: '파종' };
const anchorName = (s) => (s ? s.task.replace(/\s*\(.*$/, '') : '');

// 기준 작업 후보: 날짜가 있는 아주심기·이앙(없으면 파종)
function anchorOptions(c) {
  const dated = regionFilter(c.schedule || []).filter((s) => s.start?.m);
  const pick = (k) => { const a = dated.filter((s) => s.kind === k && !s.est); return a.length ? a : dated.filter((s) => s.kind === k); };
  let opts = pick('plant');
  if (!opts.length) opts = pick('sow');
  return opts.map((s) => ({ s, idx: c.schedule.indexOf(s) }));
}

// 작형(봄재배·촉성재배 등)이 여러 개인 작목에서 내가 고른 작형의 작업만 남긴다
function samePlan(task, myLabel, rivals) {
  if (!myLabel || !rivals.size) return true;
  const own = labelOf(task);
  if (!own) return true;
  if (own === myLabel) return true;
  if (rivals.has(own)) return false;
  const tokens = own.split(/[\s,·]+/);
  if (tokens.includes(myLabel)) return true;
  return !tokens.some((t) => rivals.has(t));
}

// 내 일정 만들기: 표준 일정을 내 기준일(심은 날)만큼 옮기고, 본문의 "아주심기 후 20일" 같은 문구도 날짜로 바꾼다
function planOf(p) {
  const c = BY_ID.get(String(p.cropId));
  if (!c) return { c: null, items: [] };
  const all = regionFilter(c.schedule || []);
  const anchor = p.anchorIdx != null ? c.schedule[p.anchorIdx] : null;
  const myA = p.date ? parseDay(p.date) : null;
  const myLabel = anchor ? labelOf(anchor.task) : '';
  const rivals = new Set(anchorOptions(c).map((o) => labelOf(o.s.task)).filter((l) => l && l !== myLabel));
  for (const s of c.schedule) if ((s.kind === 'harvest' || s.kind === 'sow') && s.start?.m && !s.est) { const l = labelOf(s.task); if (l && l !== myLabel && rivals.size) rivals.add(l); }
  const items = [];
  const t0 = today();
  let aM = null;
  if (anchor && myA) {
    const aS = tDate(anchor.start, 's');
    let aE = tDate(anchor.end?.m ? anchor.end : anchor.start, 'e');
    if (aE < aS) aE = new Date(REF_Y + 1, aE.getMonth(), aE.getDate());
    aM = new Date(aS.getTime() + (aE - aS) / 2);
  }
  const seen = new Set();
  all.forEach((s) => {
    if (!s.start?.m || !samePlan(s.task, myLabel, rivals)) return;
    const idx = c.schedule.indexOf(s);
    const sig = `${s.task.replace(/\s+/g, '')}|${s.start.m}.${s.start.p}`;
    const base = (t) => t.replace(/\s*\(.*$/, '').replace(/\s+/g, '');
    if (s.est && (c.schedule.some((o) => !o.est && o.start?.m && o.kind === s.kind && (base(o.task).startsWith(base(s.task)) || base(s.task).startsWith(base(o.task)))) || [...seen].some((k) => k.endsWith(`|${s.start.m}.${s.start.p}`)))) return; // 원문 표와 겹치는 추정 항목은 뺀다
    seen.add(sig);
    const sS = tDate(s.start, 's');
    let dur = dayDiff(tDate(s.end?.m ? s.end : s.start, 'e'), sS);
    if (dur < 0) dur += 365;
    let start;
    if (s === anchor && myA) start = myA, dur = 0;
    else if (aM && myA) {
      let off = dayDiff(sS, aM);
      const before = s.kind === 'sow' || s.kind === 'nursery' || /어미/.test(s.task);
      const lo = before ? -330 : -45;
      while (off < lo) off += 365;
      while (off >= lo + 365) off -= 365;
      start = addDays(myA, off);
    } else {
      // 기준일이 없는 작목(과수 등): 올해 표준 날짜, 이미 한참 지났으면 내년
      start = new Date(t0.getFullYear(), s.start.m - 1, sS.getDate());
      if (dayDiff(addDays(start, dur), t0) < -60) start = new Date(t0.getFullYear() + 1, s.start.m - 1, sS.getDate());
    }
    items.push({ key: `s${idx}`, task: s.task, kind: s.kind, region: s.region, start, end: addDays(start, dur), std: periodText(s), est: s.est, anchor: s === anchor, src: s === anchor ? 'anchor' : 'std' });
  });
  // 본문의 상대 시기
  const myPlant = items.find((i) => i.kind === 'plant' && (i.anchor || !anchor || anchor.kind !== 'plant'))?.start || (anchor?.kind === 'plant' ? myA : null);
  const mySow = items.find((i) => i.kind === 'sow')?.start || (anchor?.kind === 'sow' ? myA : null);
  const REL = /(아주심기|정식|이앙|모내기|파종|씨뿌림|직파)\s*(?:후|뒤)\s*(\d{1,3})\s*(?:~\s*(\d{1,3}))?\s*일/;
  (c.stages || []).forEach((st, si) => {
    if (!samePlan(st.title, myLabel, rivals)) return;
    const cands = [{ text: st.timing || '', name: st.title, k: `r${si}` }, ...(st.items || []).map((it, ii) => ({ text: `${it.label} ${it.value}`, name: `${st.title} · ${it.label}`, k: `r${si}-${ii}` }))];
    for (const cd of cands) {
      const m = cd.text.match(REL);
      if (!m) continue;
      const base = /파종|씨뿌림|직파/.test(m[1]) ? mySow : myPlant;
      if (!base) continue;
      const a = Number(m[2]);
      const b = m[3] ? Number(m[3]) : a;
      if (a > 400) continue;
      items.push({ key: cd.k, task: cd.name, kind: kindFromText(cd.name), start: addDays(base, a), end: addDays(base, b), std: m[0], src: 'rel' });
    }
  });
  items.sort((x, y) => x.start - y.start);
  return { c, items, anchor, myLabel };
}
const kindFromText = (t) => (/웃거름|밑거름|비료|시비/.test(t) ? 'fert' : /방제|소독|약제/.test(t) ? 'pest' : /수확|출하/.test(t) ? 'harvest' : /아주심기|정식|이앙/.test(t) ? 'plant' : /파종|씨뿌림/.test(t) ? 'sow' : 'manage');
const pDoneKey = (p, it) => `P|${p.id}|${it.key}|${isoDay(it.start)}`;
function itemState(it) {
  const t = today();
  if (dayDiff(t, it.start) < 0) return { st: 'next', d: dayDiff(it.start, t) };
  if (dayDiff(t, it.end) <= 0) return { st: 'now', d: dayDiff(it.end, t) };
  return { st: 'past', d: dayDiff(t, it.end) };
}
// 오늘 볼 일: 진행 중, 지난 14일 안에 끝났는데 완료 안 한 일, 7일 안에 시작할 일
function focusItems(p, plan) {
  return plan.items.map((it) => ({ it, s: itemState(it), done: isDone(pDoneKey(p, it)) }))
    .filter(({ s, done }) => !done && ((s.st === 'now') || (s.st === 'past' && s.d <= 14) || (s.st === 'next' && s.d <= 7)))
    .sort((a, b) => ({ past: 0, now: 1, next: 2 }[a.s.st] - { past: 0, now: 1, next: 2 }[b.s.st]) || a.it.start - b.it.start);
}
const stateText = (s, it) => (s.st === 'now' ? (s.d === 0 ? '오늘까지' : `${s.d}일 남음`) : s.st === 'next' ? (s.d === 0 ? '오늘 시작' : s.d === 1 ? '내일 시작' : `${s.d}일 뒤 시작`) : `${s.d}일 지남`);
function ageText(p, plan) {
  if (!p.date || !plan.anchor) return '';
  const d = dayDiff(today(), parseDay(p.date));
  const w = anchorName(plan.anchor);
  return d >= 0 ? `${w} ${d + 1}일째` : `${w}까지 ${-d}일`;
}
function planItemsHtml(p, list, opts = {}) {
  return list.map(({ it, s, done }) => `<div class="todo-item linked${done ? ' is-done' : ''}">
    <a class="todo-link" href="#/crop/${p.cropId}?s=${sectionOf(it.kind)}">${kindTag(it.kind)}<div>
      <b>${esc(it.task)}</b>${it.est || it.src === 'rel' ? ' <span class="tag plain">추정</span>' : ''}
      <div class="when"><b class="pdate">${mdRange(it.start, it.end)}</b> · ${s.st === 'past' && !done ? `<span class="ending">${stateText(s, it)}</span>` : stateText(s, it)}${opts.std ? ` · 표준 ${esc(it.std)}` : ''}</div></div></a>
    ${done ? `<button class="done-btn undo" data-undone="${esc(pDoneKey(p, it))}">되돌리기</button>` : `<button class="done-btn" data-pdone="${esc(p.id)}|${esc(it.key)}|${isoDay(it.start)}" aria-label="${esc(it.task)} 완료">완료</button>`}
  </div>`).join('');
}

// ---------- 기록: 방제·비료·수확·작업 ----------
const recordsOf = (pid) => diary().filter((e) => e.plantingId === pid);
function phiOf(pid) {
  let worst = null;
  for (const e of recordsOf(pid)) {
    if (e.type !== 'spray' || !(Number(e.phi) > 0)) continue;
    const safe = addDays(parseDay(e.date), Number(e.phi));
    if (dayDiff(safe, today()) > 0 && (!worst || safe > worst.safe)) worst = { safe, e };
  }
  return worst;
}
const phiHtml = (pid) => { const w = phiOf(pid); return w ? `<p class="phi">수확 금지: <b>${md(w.safe)}부터 수확 가능</b> (${md(parseDay(w.e.date))} ${esc(w.e.pesticide || '방제')} 살포, 안전일수 ${esc(w.e.phi)}일)</p>` : ''; };
const REC = { spray: '방제 기록', fert: '비료 기록', harvest: '수확·출하 기록', work: '작업 기록' };
const quickRec = (p) => `<div class="farm-quick">${Object.entries(REC).map(([k, v]) => `<a class="btn quiet" href="#/farm/${p.id}/rec/${k}">${v.replace(' 기록', '')}</a>`).join('')}</div>`;

// ---------- 비료 계획: 회차별 포대 수 ----------
function fertPlan(c, m2) {
  const f = c.fertilizer;
  const base = unitBase(f?.unit);
  if (!f?.rows?.length || !base) return null;
  const fc = store.get('fert', FERT_DEFAULT);
  const cols = f.columns || [];
  const totalCol = cols.findIndex((h) => /합계|총량|^계$|총계/.test(h));
  const NPK = [[/질소/, fc.n, '질소'], [/인산/, fc.p, '인산'], [/칼리|칼륨|가리/, fc.k, '칼리']];
  const line = (j) => f.rows.map((r) => {
    const v = (r.values || [])[j];
    if (typeof v !== 'number' || !v) return null;
    const nut = NPK.find(([re]) => re.test(r.name));
    const kgN = v * m2 / base;
    if (nut) { const prod = kgN / (nut[1].pct / 100); return { name: `${nut[1].name}(${nut[2]})`, kg: prod, bags: prod / fc.bag }; }
    return { name: r.name, kg: kgN, bags: kgN / 20 };
  }).filter(Boolean);
  const nutCol = (h) => NPK.find(([re]) => re.test(h));
  if (cols.filter(nutCol).length >= 2) {
    // 열이 질소·인산·칼리인 표: 행(평야지·간척지 등)마다 한 묶음
    const rounds = f.rows.map((r) => ({ h: r.name, items: cols.map((h, j) => {
      const v = (r.values || [])[j]; const nut = nutCol(h);
      if (typeof v !== 'number' || !v) return null;
      const kgN = v * m2 / base;
      return nut ? { name: `${nut[1].name}(${nut[2]})`, kg: kgN / (nut[1].pct / 100), bags: kgN / (nut[1].pct / 100) / fc.bag } : { name: h, kg: kgN, bags: kgN / 20 };
    }).filter(Boolean) })).filter((r) => r.items.length);
    return { rounds, total: null, bag: fc.bag, options: true };
  }
  const rounds = cols.map((h, j) => ({ h, j, items: line(j) })).filter((r) => r.j !== totalCol && r.items.length);
  let total = totalCol >= 0 ? line(totalCol) : null;
  if (!total) { const m = new Map(); rounds.forEach((r) => r.items.forEach((i) => { const o = m.get(i.name) || { name: i.name, kg: 0, bags: 0 }; o.kg += i.kg; o.bags += i.bags; m.set(i.name, o); })); total = [...m.values()]; }
  return { rounds, total, bag: fc.bag };
}
const bagTxt = (i, bag) => `${esc(i.name)} <b>${fmt(i.bags, 1)}포대</b> <span class="when">${kg(i.kg)}kg${/요소|인비|칼리/.test(i.name) ? '' : ' · 20kg 포대 기준'}</span>`;

// ---------- 화면: 내 농사 목록 ----------
function farmCard(p, compact) {
  const plan = planOf(p);
  const c = plan.c;
  const { m2 } = areaNow('P' + p.id);
  const focus = focusItems(p, plan);
  return `<article class="farm-card">
    <a class="farm-head" href="#/farm/${p.id}"><b>${esc(shortName(c))}${p.field ? ` · ${esc(p.field)}` : ''}</b><span>${fmt(m2 / PY, 0)}평${ageText(p, plan) ? ` · ${ageText(p, plan)}` : ''}</span></a>
    ${phiHtml(p.id)}
    <div class="todo">${focus.length ? planItemsHtml(p, focus.slice(0, compact ? 4 : 8)) : `<div class="todo-item"><div><b>이번 주에 챙길 일이 없습니다</b><div class="when">${plan.items.length ? '다음 일정은 작기 화면에서 볼 수 있습니다.' : '이 작목은 원문에 날짜가 적힌 일정이 없어 작업 방법을 참고해 주세요.'}</div></div></div>`}
      ${focus.length > (compact ? 4 : 8) ? `<a class="todo-item more" href="#/farm/${p.id}"><b>챙길 일 ${focus.length}건 모두 보기</b></a>` : ''}</div>
    ${quickRec(p)}
  </article>`;
}
function viewFarm() {
  const act = activePlantings();
  const ended = plantings().filter((p) => p.ended);
  return `<div class="stack">
    <div class="spread"><h1>내 농사</h1><a class="btn primary" href="#/farm/new">작기 등록</a></div>
    <p class="sub">필지나 하우스 동마다 <b>심은 날</b>을 등록하면, 농사로 표준 일정을 내 날짜에 맞춰 옮기고 방제·비료·수확 기록과 결산을 함께 관리합니다.</p>
    ${act.length ? `<div class="farm-list">${act.map((p) => farmCard(p)).join('')}</div>` : `<div class="empty-box"><p><b>아직 등록한 작기가 없습니다.</b></p><p>예: 고추 · 앞밭 · 1,200평 · 아주심기 5월 8일. 같은 작목이라도 심은 날이 다르면 따로 등록하세요.</p><p><a class="btn primary" href="#/farm/new">첫 작기 등록하기</a></p></div>`}
    ${ended.length ? `<details class="done-box"><summary>끝난 작기 ${ended.length}개</summary><div class="todo">${ended.map((p) => { const c = BY_ID.get(String(p.cropId)); return `<a class="todo-item more" href="#/farm/${p.id}"><div><b>${esc(c ? shortName(c) : '작목')} ${esc(p.field || '')}</b><div class="when">${p.date ? esc(p.date) + ' 시작 · ' : ''}${esc(p.ended)} 끝냄</div></div></a>`; }).join('')}</div></details>` : ''}
  </div>`;
}

// ---------- 화면: 작기 등록·수정 ----------
function viewFarmNew(q) {
  const edit = q.get('edit') ? getPlanting(q.get('edit')) : null;
  const cid = q.get('crop') || edit?.cropId || myCrops()[0]?.id || '';
  const c = BY_ID.get(String(cid));
  const opts = c ? anchorOptions(c) : [];
  const area = edit ? store.get('areas', {})['P' + edit.id] : null;
  const mine = myCrops();
  const copt = (x) => `<option value="${x.id}" ${String(x.id) === String(cid) ? 'selected' : ''}>${esc(fullName(x))}</option>`;
  const others = CROPS.filter((x) => !isFav(x));
  return `<div class="stack">
    <h1>${edit ? '작기 고치기' : '작기 등록'}</h1>
    <form class="card form" data-plant-form ${edit ? `data-edit="${esc(edit.id)}"` : ''}>
      <label class="f wide">작목<select name="crop" data-plant-crop required>${c ? '' : '<option value="">작목을 고르세요</option>'}${mine.length ? `<optgroup label="내 작목">${mine.map(copt).join('')}</optgroup><optgroup label="전체 작목">${others.map(copt).join('')}</optgroup>` : CROPS.map(copt).join('')}</select></label>
      <label class="f">필지·하우스 이름<input type="text" name="field" value="${esc(edit?.field || '')}" placeholder="예: 앞밭, 1~3동"></label>
      <label class="f">면적<input type="number" name="area" inputmode="decimal" min="0" step="any" value="${esc(area?.v ?? 300)}" required></label>
      <label class="f">단위<select name="unit">${unitOpts(area?.u || 'pyeong')}</select></label>
      ${opts.length ? `<fieldset class="wide anchor-pick"><legend>무엇을 한 날을 기준으로 할까요?</legend>
        ${opts.map((o, i) => `<label class="radio"><input type="radio" name="anchor" value="${o.idx}" ${edit ? (edit.anchorIdx === o.idx ? 'checked' : '') : i === 0 ? 'checked' : ''}><span><b>${esc(o.s.task)}</b>${o.s.region ? ` <span class="tag plain">${esc(o.s.region)}</span>` : ''}<span class="when">표준 ${esc(periodText(o.s))}</span></span></label>`).join('')}
      </fieldset>
      <label class="f wide">그 작업을 한 날 (아직이면 할 예정인 날)<input type="date" name="date" value="${esc(edit?.date || isoDay())}" required></label>`
      : `<p class="wide notice">${c ? '이 작목은 원문에 심는 날짜가 없어 기준일 없이 올해 표준 일정으로 관리합니다. 기록과 결산은 똑같이 쓸 수 있습니다.' : '작목을 먼저 고르세요.'}</p>`}
      <label class="f wide">메모<input type="text" name="memo" value="${esc(edit?.memo || '')}" placeholder="품종, 재식거리 등"></label>
      <div class="wide row"><button class="btn primary" type="submit">${edit ? '고친 내용 저장' : '등록'}</button><a class="btn quiet" href="${edit ? `#/farm/${edit.id}` : '#/farm'}">취소</a></div>
    </form>
  </div>`;
}

// ---------- 화면: 작기 하나 ----------
function viewPlanting(id) {
  const p = getPlanting(id);
  if (!p) return '<div class="stack"><p class="empty">작기를 찾을 수 없습니다. <a href="#/farm">내 농사로</a></p></div>';
  const plan = planOf(p);
  const c = plan.c;
  if (!c) return '<div class="stack"><p class="empty">작목 자료를 찾을 수 없습니다.</p></div>';
  const { m2 } = areaNow('P' + p.id);
  const all = plan.items.map((it) => ({ it, s: itemState(it), done: isDone(pDoneKey(p, it)) }));
  const focus = focusItems(p, plan);
  const later = all.filter(({ s, done }) => !done && s.st === 'next' && s.d > 7);
  const past = all.filter((x) => !focus.includes(x) && !later.includes(x));
  const fp = fertPlan(c, m2);
  const recs = recordsOf(p.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const sum = (f, t) => recs.filter((e) => !t || e.type === t).reduce((a, e) => a + (Number(e[f]) || 0), 0);
  const kgSum = sum('kg', 'harvest');
  const sales = sum('price', 'harvest');
  const cost = sum('cost');
  const tenA = m2 / 1000;
  return `<div class="stack" data-planting="${esc(p.id)}">
    <header class="crop-head">
      <p class="type"><a href="#/farm">내 농사</a> · <a href="#/crop/${c.id}">${esc(fullName(c))} 작목 정보</a></p>
      <h1>${esc(shortName(c))}${p.field ? ` · ${esc(p.field)}` : ''}</h1>
      <p class="lede">${fmt(m2 / PY, 0)}평(${fmt(m2, 0)}㎡)${ageText(p, plan) ? ` · <b>${ageText(p, plan)}</b>` : ''}${p.date && plan.anchor ? ` · ${anchorName(plan.anchor)} ${esc(p.date)}` : ''}</p>
      ${p.memo ? `<p class="sub">${esc(p.memo)}</p>` : ''}
    </header>
    ${phiHtml(p.id)}
    ${quickRec(p)}
    ${(() => { const w = store.get('wx', null); return w && w.day === isoDay() ? sprayHtml(w) : ''; })()}
    <section class="card" id="s-now"><h2>지금 챙길 일 <small>지난 2주~앞으로 1주</small></h2>
      <div class="todo">${focus.length ? planItemsHtml(p, focus, { std: true }) : '<div class="todo-item"><div><b>지금 챙길 일이 없습니다</b></div></div>'}</div>
      ${plan.items.length ? '<p class="sub">날짜는 농사로 표준 일정을 내 기준일만큼 옮긴 것입니다. 날씨와 생육을 보며 맞추세요. ‘추정’은 본문의 “아주심기 후 20일” 같은 문구로 계산한 날짜입니다.</p>' : ''}
    </section>
    ${(() => { const und = regionFilter(c.schedule || []).filter((x) => !x.start?.m && samePlan(x.task, plan.myLabel, new Set())); return und.length ? `<section class="card"><h2>날짜가 없는 작업 <small>${und.length}개</small></h2><p class="sub">농사로 원문 달력이 그림이라 날짜를 넣지 못한 작업입니다. <a href="${esc(c.source)}" target="_blank" rel="noopener">원문 달력</a>과 <a href="#/crop/${c.id}?s=stage">작업 방법</a>을 보고 챙기세요.</p><div class="chips undated">${und.map((x) => `<span class="tag plain">${esc(x.task)}</span>`).join('')}</div></section>` : ''; })()}
    ${later.length ? `<section class="card"><h2>다가올 일</h2><div class="todo">${planItemsHtml(p, later, { std: true })}</div></section>` : ''}
    ${fp ? `<section class="card" id="s-fertplan"><h2>비료 계획 <small>${fmt(m2 / PY, 0)}평 · ${fmt(fp.bag, 0)}kg 포대</small></h2>
      <div class="fert-list" style="display:grid">${fp.rounds.map((r) => `<div class="fert-round"><h3>${esc(r.h)}</h3><ul class="bag-list">${r.items.map((i) => `<li>${bagTxt(i, fp.bag)}</li>`).join('')}</ul></div>`).join('')}</div>
      ${fp.options ? '<p class="sub">위 묶음 가운데 내 논밭에 맞는 한 가지만 쓰세요(토양·지역별 기준).</p>' : `<h3 class="sub-h">한 작기 자재 준비</h3><ul class="bag-list">${fp.total.map((i) => `<li>${bagTxt(i, fp.bag)}</li>`).join('')}</ul>`}
      <p class="sub">질소는 요소, 인산은 용성인비, 칼리는 염화칼리로 환산했습니다. 쓰는 비료가 다르면 <a href="#/tools?crop=${c.id}">비료 계산기</a>에서 성분 함량을 바꾸세요.</p>
    </section>` : ''}
    <section class="card" id="s-sum"><h2>올해 결산 <small>이 작기 기록 기준</small></h2>
      <div class="stat"><div><b>${fmt(kgSum, 0)}</b><span>수확 kg${kgSum && tenA ? ` · 10a당 ${fmt(kgSum / tenA, 0)}kg` : ''}</span></div><div><b>${fmt(sales, 0)}</b><span>판매 금액(원)</span></div><div><b>${fmt(cost, 0)}</b><span>들인 비용(원)</span></div></div>
      <p class="lede" style="margin-top:14px">소득 <b>${fmt(sales - cost, 0)}원</b>${m2 ? ` · 평당 ${fmt((sales - cost) / (m2 / PY), 0)}원` : ''}</p>
      <p class="sub">비용은 기록에 적은 금액만 더합니다. 자재값·인건비를 기록할 때 비용 칸에 적어 두면 결산이 정확해집니다.</p>
    </section>
    <section class="card" id="s-recs"><h2>기록 <small>${recs.length}건</small></h2>
      ${recs.length ? `<div class="entries">${recs.slice(0, 30).map(entryHtml).join('')}</div>` : '<p class="sub">위의 방제·비료·수확·작업 버튼으로 기록하세요. 영농일지에도 함께 쌓입니다.</p>'}
    </section>
    ${past.length ? `<details class="done-box"><summary>지난 일·끝낸 일 ${past.length}건</summary><div class="todo">${planItemsHtml(p, past, { std: true })}</div></details>` : ''}
    <div class="row"><a class="btn quiet" href="#/farm/new?edit=${esc(p.id)}">작기 고치기</a><button class="btn quiet" data-plant-end="${esc(p.id)}">${p.ended ? '다시 진행 중으로' : '작기 끝내기'}</button><button class="btn danger" data-plant-del="${esc(p.id)}">작기 삭제</button></div>
  </div>`;
}

// ---------- 화면: 기록 입력 ----------
const PRODUCTS = ['요소', '용성인비', '염화칼리', '복합비료(21-17-17)', '복합비료(12-12-12)', '유박', '퇴비', '석회(고토석회)', '붕사'];
function viewRecord(id, type) {
  const p = getPlanting(id);
  const c = p && BY_ID.get(String(p.cropId));
  if (!p || !c || !REC[type]) return '<div class="stack"><p class="empty">기록할 작기를 찾을 수 없습니다. <a href="#/farm">내 농사로</a></p></div>';
  const last = recordsOf(p.id).filter((e) => e.type === type).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || {};
  const { m2 } = areaNow('P' + p.id);
  const water = Math.round((store.get('sprayPer10a', 200) * m2) / 1000);
  const f = {
    spray: `<label class="f wide">약제 이름<input type="text" name="pesticide" list="pest-names" value="${esc(last.pesticide || '')}" placeholder="농약 포장의 상표명" required><datalist id="pest-names">${[...new Set(recordsOf(p.id).map((e) => e.pesticide).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label class="f">희석 배수(배)<input type="number" name="ratio" inputmode="numeric" min="1" step="any" value="${esc(last.ratio || 1000)}" data-mix required></label>
      <label class="f">물 양(L)<input type="number" name="water" inputmode="decimal" min="0" step="any" value="${esc(water)}" data-mix required></label>
      <p class="wide mix-out" data-mix-out></p>
      <label class="f">대상 병해충<input type="text" name="target" list="pest-targets" value=""><datalist id="pest-targets">${(c.pests || []).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></label>
      <label class="f">수확 전 안전일수(일)<input type="number" name="phi" inputmode="numeric" min="0" step="1" value="${esc(last.phi || '')}" placeholder="포장의 ‘수확 ○일 전까지’"></label>`,
    fert: `<label class="f wide">비료 이름<input type="text" name="product" list="fert-names" value="${esc(last.product || '')}" required><datalist id="fert-names">${PRODUCTS.map((n) => `<option value="${n}">`).join('')}</datalist></label>
      <label class="f">양<input type="number" name="qty" inputmode="decimal" min="0" step="any" required></label>
      <label class="f">단위<select name="qunit"><option>포대</option><option>kg</option><option>L</option></select></label>
      <label class="f">회차<input type="text" name="round" placeholder="예: 웃거름 2회"></label>`,
    harvest: `<label class="f">수확량(kg)<input type="number" name="kg" inputmode="decimal" min="0" step="any" required></label>
      <label class="f">상자 수<input type="number" name="boxes" inputmode="numeric" min="0" step="1"></label>
      <label class="f">판매 금액(원)<input type="number" name="price" inputmode="numeric" min="0" step="1" placeholder="팔았으면 적기"></label>
      <label class="f">출하처<input type="text" name="buyer" list="buyers" value="${esc(last.buyer || '')}" placeholder="예: 가락시장, 농협, 직거래"><datalist id="buyers">${[...new Set(diary().map((e) => e.buyer).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>`,
    work: `<label class="f">작업<select name="work">${WORKS.map((w) => `<option>${w}</option>`).join('')}</select></label>
      <label class="f">일한 사람(명)<input type="number" name="people" inputmode="numeric" min="0" step="1" value="1"></label>
      <label class="f">작업 시간(시간)<input type="number" name="hours" inputmode="decimal" min="0" step="0.5"></label>`,
  }[type];
  return `<div class="stack">
    <p class="type"><a href="#/farm/${p.id}">${esc(shortName(c))}${p.field ? ` · ${esc(p.field)}` : ''}</a></p>
    <h1>${REC[type]}</h1>
    ${type === 'harvest' ? phiHtml(p.id) : ''}
    <form class="card form" data-rec-form="${type}" data-pid="${esc(p.id)}">
      <label class="f">날짜<input type="date" name="date" value="${isoDay()}" required></label>
      ${f}
      <label class="f">비용(원)<input type="number" name="cost" inputmode="numeric" min="0" step="1" placeholder="${type === 'harvest' ? '포장재·운송비 등' : '자재값·인건비'}"></label>
      <label class="f wide">메모<input type="text" name="memo"></label>
      <div class="wide row"><button class="btn primary" type="submit">저장</button><a class="btn quiet" href="#/farm/${p.id}">취소</a></div>
    </form>
  </div>`;
}
const mixAmount = (ratio, water) => (Number(ratio) > 0 && Number(water) > 0 ? (Number(water) * 1000) / Number(ratio) : null);
const mixText = (a) => (a == null ? '' : a >= 1000 ? `${fmt(a / 1000, 2)}L(kg)` : `${fmt(a, a < 10 ? 1 : 0)}ml(g)`);
function paintMix() {
  const out = document.querySelector('[data-mix-out]');
  if (!out) return;
  const f = out.closest('form');
  const a = mixAmount(f.ratio.value, f.water.value);
  out.innerHTML = a == null ? '' : `물 ${fmt(Number(f.water.value), 0)}L에 약 <b>${mixText(a)}</b> · 20L 말통 하나에 ${mixText(mixAmount(f.ratio.value, 20))}`;
}
function recordFromForm(f, type, p) {
  const c = BY_ID.get(String(p.cropId));
  const o = Object.fromEntries(new FormData(f));
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), type, plantingId: p.id, date: o.date, crop: fullName(c), field: p.field || '', cost: o.cost || '', memo: o.memo || '', hours: o.hours || '' };
  if (type === 'spray') {
    const a = mixAmount(o.ratio, o.water);
    Object.assign(e, { work: '방제', pesticide: o.pesticide, ratio: o.ratio, water: o.water, target: o.target, phi: o.phi, input: `${o.pesticide} ${o.ratio}배 · 물 ${o.water}L · 약 ${mixText(a)}${o.target ? ` · ${o.target}` : ''}${Number(o.phi) > 0 ? ` · 수확 가능 ${md(addDays(parseDay(o.date), Number(o.phi)))}` : ''}` });
  } else if (type === 'fert') Object.assign(e, { work: '비료', product: o.product, qty: o.qty, qunit: o.qunit, round: o.round, input: `${o.product} ${o.qty}${o.qunit}${o.round ? ` · ${o.round}` : ''}` });
  else if (type === 'harvest') Object.assign(e, { work: '수확', kg: o.kg, boxes: o.boxes, price: o.price, buyer: o.buyer, input: `${fmt(Number(o.kg), 1)}kg${o.boxes ? ` · ${o.boxes}상자` : ''}${o.price ? ` · ${fmt(Number(o.price), 0)}원` : ''}${o.buyer ? ` · ${o.buyer}` : ''}` });
  else Object.assign(e, { work: o.work, people: o.people, input: `${o.people || 1}명${o.hours ? ` × ${o.hours}시간` : ''}` });
  return e;
}
function entryHtml(e) {
  return `<div class="entry"><div class="meta"><b>${esc(e.date)}</b><span class="tag plain">${esc(e.crop)}</span>${e.field ? `<span class="tag plain">${esc(e.field)}</span>` : ''}<span class="tag plain">${esc(e.work)}</span>${e.auto ? '<span class="tag plain">할 일 완료</span>' : ''}${e.hours && !e.type ? `<span>${fmt(e.hours, 1)}시간</span>` : ''}${e.cost ? `<span>${fmt(e.cost, 0)}원</span>` : ''}</div>
    ${e.input ? `<p>${e.type ? '' : '<b>쓴 자재</b> '}${esc(e.input)}</p>` : ''}${e.memo ? `<p>${esc(e.memo)}</p>` : ''}
    <div><button class="btn small danger" data-diary-del="${esc(e.id)}">삭제</button></div></div>`;
}

// ---------- 방제하기 좋은 때 (시간별 예보) ----------
function sprayWindows(w) {
  const h = w.hourly;
  if (!h?.time) return null;
  const now = new Date();
  const ok = (i) => (h.precipitation_probability?.[i] ?? 0) <= 30 && (h.precipitation?.[i] ?? 0) === 0 && (h.wind_speed_10m?.[i] ?? 0) <= 4;
  const dry = (i) => (h.precipitation_probability?.[i] ?? 0) <= 40 && (h.precipitation?.[i] ?? 0) === 0;
  return [0, 1].map((off) => {
    const day = isoDay(addDays(now, off));
    let best = null;
    let run = [];
    const close = () => {
      if (run.length >= 3) {
        const endI = run[run.length - 1];
        const after = [1, 2, 3, 4].map((k) => endI + k).filter((i) => i < h.time.length);
        if (after.every(dry) && (!best || run.length > best.length)) best = run.slice();
      }
      run = [];
    };
    h.time.forEach((t, i) => {
      if (!t.startsWith(day)) return;
      const hr = Number(t.slice(11, 13));
      if (hr < 6 || hr > 18 || (off === 0 && new Date(t).getTime() + 3600e3 < now.getTime())) { close(); return; }
      ok(i) ? run.push(i) : close();
    });
    close();
    return { label: DAYS[off], best: best && { from: Number(h.time[best[0]].slice(11, 13)), to: Number(h.time[best[best.length - 1]].slice(11, 13)) + 1 } };
  });
}
function sprayHtml(w) {
  const s = sprayWindows(w);
  if (!s) return '';
  const good = s.filter((d) => d.best);
  return `<p class="spray-win"><b>방제하기 좋은 때</b> ${good.length ? good.map((d) => `${d.label} ${d.best.from}~${d.best.to}시`).join(' · ') : '오늘·내일은 비나 바람 때문에 마땅한 때가 없습니다'}<span class="when">비 올 확률 30% 이하, 바람 초속 4m 이하가 3시간 넘게 이어지고 뒤이어 4시간 비 소식이 없는 낮 시간</span></p>`;
}

// ---------- 알림 ----------
let toastTimer;
function toast(html) {
  const el = document.getElementById('toast');
  el.innerHTML = html;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 4000);
}

// ---------- router ----------
let META = {};
function route() {
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const seg = path.split('/').filter(Boolean);
  return { page: seg[0] || 'home', seg, q: new URLSearchParams(qs) };
}
function render() {
  const { page, seg, q } = route();
  let html;
  if (page === 'home') html = viewHome();
  else if (page === 'crops') html = viewCrops(q);
  else if (page === 'crop') html = viewCrop(seg[1]);
  else if (page === 'calendar') html = viewCalendar(q);
  else if (page === 'tools') html = viewTools(q);
  else if (page === 'diary') html = viewDiary(q);
  else if (page === 'links') html = viewLinks(META);
  else if (page === 'farm') html = !seg[1] ? viewFarm() : seg[1] === 'new' ? viewFarmNew(q) : seg[2] === 'rec' ? viewRecord(seg[1], seg[3]) : viewPlanting(seg[1]);
  else html = '<div class="stack"><p class="empty">페이지를 찾을 수 없습니다. <a href="#/">오늘 화면으로</a></p></div>';
  $app.innerHTML = html;
  document.body.classList.toggle('is-home', page === 'home');
  const nav = page === 'crop' || page === 'calendar' ? 'crops' : page === 'tools' ? 'links' : page;
  document.querySelectorAll('[data-nav]').forEach((a) => { const on = a.dataset.nav === nav; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  motion();
  if (page === 'tools') paintTools();
  if (page === 'calendar') document.querySelectorAll('.filter .chip.on').forEach((el) => { const box = el.parentElement; box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - 16); });
  if (page === 'home') paintWeather();
  if (page === 'farm') paintMix();
  if (page === 'crop') {
    const c = BY_ID.get(String(seg[1]));
    document.title = c ? `${fullName(c)} — 영농노트` : '영농노트';
    paintCropFert();
  } else document.title = '영농노트 — 농사에 필요한 정보만, 한눈에';
  const sec = q.get('s');
  if (sec) requestAnimationFrame(() => document.getElementById('s-' + sec)?.scrollIntoView());
}
let lastPath = '';
window.addEventListener('hashchange', () => {
  const p = location.hash.split('?')[0];
  const keep = p === lastPath ? window.scrollY : 0;
  lastPath = p;
  render();
  if (!route().q.get('s')) window.scrollTo(0, keep);
});

// ---------- motion: 넓은 화면의 장식 구역과 달력 막대만 움직인다 (스크립트가 없어도 내용은 그대로 보임) ----------
let io;
function motion() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  io?.disconnect();
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.poster, .archive, .archive-row').forEach((g) => [...g.children].forEach((el, i) => { el.classList.add('rise'); el.style.setProperty('--i', i % 12); }));
  document.querySelectorAll('.g-bar').forEach((el, i) => el.style.setProperty('--i', i % 16));
  document.querySelectorAll('.foot-mark i').forEach((el, i) => { el.classList.add('growy'); el.style.setProperty('--i', i); });
  document.querySelectorAll('.rise, .grow, .growy, .shutter').forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
}

// ---------- events ----------
function toggleFav(id) {
  const c = BY_ID.get(String(id));
  const on = !favs.has(String(id));
  on ? favs.add(String(id)) : favs.delete(String(id));
  saveFavs();
  if (route().page === 'home') { const y = window.scrollY; render(); window.scrollTo(0, y); }
  else document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => { b.outerHTML = favBtn(c, b.classList.contains('btn')); });
  toast(on ? `<b>${esc(fullName(c))}</b>을(를) 내 작목에 담았습니다.${route().page === 'home' ? '' : ' <a href="#/">오늘 할 일 보기</a>'}` : `<b>${esc(fullName(c))}</b>을(를) 내 작목에서 뺐습니다. <button data-fav="${id}">되돌리기</button>`);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-pdone],[data-plant-end],[data-plant-del],[data-mix-set],[data-done],[data-undone],[data-region],[data-geo],[data-wx-change],[data-wx-retry],[data-wx-clear],[data-big],[data-fav],[data-go],[data-jump],[data-print],[data-area-reset],[data-diary-del],[data-diary-csv],[data-diary-backup],[data-reset],[data-yr-step]');
  if (!t) return;
  if (t.dataset.pdone) {
    const [pid, key, startIso] = t.dataset.pdone.split('|');
    const p = getPlanting(pid);
    const plan = p && planOf(p);
    const it = plan?.items.find((i) => i.key === key && isoDay(i.start) === startIso);
    if (!it) return;
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: isoDay(), crop: fullName(plan.c), field: p.field || '', work: workOf({ kind: it.kind, task: it.task }), plantingId: p.id, input: '', hours: '', cost: '', memo: it.task, auto: true, createdAt: new Date().toISOString() };
    store.set('diary', [...diary(), entry]);
    const k = pDoneKey(p, it);
    store.set('done', { ...doneMap(), [k]: { at: isoDay(), diaryId: entry.id } });
    const y = window.scrollY; render(); window.scrollTo(0, y);
    toast(`<b>${esc(it.task)}</b> 완료. 영농일지에 적었습니다. <button data-undone="${esc(k)}">되돌리기</button>`);
  } else if (t.dataset.plantEnd) {
    const a = plantings();
    const p = a.find((x) => x.id === t.dataset.plantEnd);
    p.ended = p.ended ? null : isoDay();
    savePlantings(a);
    render();
    toast(p.ended ? '작기를 끝냈습니다. 기록과 결산은 ‘끝난 작기’에서 볼 수 있습니다.' : '작기를 다시 진행 중으로 돌렸습니다.');
  } else if (t.dataset.plantDel) {
    if (!confirm('이 작기를 삭제할까요? 영농일지의 기록은 남습니다.')) return;
    savePlantings(plantings().filter((x) => x.id !== t.dataset.plantDel));
    location.hash = '#/farm';
    toast('작기를 삭제했습니다. 기록은 영농일지에 남아 있습니다.');
  } else if (t.dataset.mixSet) {
    const inp = document.querySelector('[data-mix-water]');
    if (inp) { inp.value = t.dataset.mixSet; paintTools(); }
  } else if (t.dataset.done) {
    const [cid, idx, x] = t.dataset.done.split('|');
    const c = BY_ID.get(cid);
    const s = c?.schedule[Number(idx)];
    if (!s) return;
    const key = taskKey(c, s, range(s), Number(x));
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: isoDay(), crop: fullName(c), work: workOf(s), field: '', input: '', hours: '', cost: '', memo: s.task + (s.region ? ` (${s.region})` : ''), auto: true, createdAt: new Date().toISOString() };
    store.set('diary', [...diary(), entry]);
    store.set('done', { ...doneMap(), [key]: { at: isoDay(), diaryId: entry.id } });
    const y = window.scrollY; render(); window.scrollTo(0, y);
    toast(`<b>${esc(s.task)}</b> 완료. 영농일지에 적었습니다. <button data-undone="${esc(key)}">되돌리기</button>`);
  } else if (t.dataset.undone) {
    const dm = doneMap();
    const rec = dm[t.dataset.undone];
    if (!rec) return;
    delete dm[t.dataset.undone];
    store.set('done', dm);
    store.set('diary', diary().filter((x) => x.id !== rec.diaryId));
    const y = window.scrollY; render(); window.scrollTo(0, y);
    toast('완료 표시와 일지 기록을 되돌렸습니다.');
  } else if ('region' in t.dataset) {
    setSetting({ region: t.dataset.region, regionAuto: false });
    const y = window.scrollY; render(); window.scrollTo(0, y);
    toast(t.dataset.region ? `<b>${t.dataset.region}</b> 일정만 보여 드립니다.` : '모든 지역 일정을 보여 드립니다.');
  } else if ('geo' in t.dataset) {
    if (!navigator.geolocation) { toast('이 기기에서는 위치를 확인할 수 없습니다. 시·군을 골라 주세요.'); return; }
    toast('위치를 확인하는 중입니다…');
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, name: '내 위치' }),
      () => toast('위치를 확인하지 못했습니다. 위치 권한을 허용하거나 시·군을 골라 주세요.'),
      { timeout: 15000, maximumAge: 3600e3 });
  } else if ('wxChange' in t.dataset) location.hash = '#/links?s=settings';
  else if ('wxRetry' in t.dataset) paintWeather(true);
  else if ('wxClear' in t.dataset) { setSetting({ loc: null }); store.set('wx', null); render(); toast('날씨 위치를 지웠습니다.'); }
  else if ('big' in t.dataset) { setSetting({ big: !settings().big }); applyBig(); }
  else if (t.dataset.fav) { e.preventDefault(); toggleFav(t.dataset.fav); }
  else if (t.dataset.go) location.hash = t.dataset.go;
  else if (t.dataset.jump) document.getElementById('s-' + t.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if ('print' in t.dataset) window.print();
  else if ('areaReset' in t.dataset) { const cid = t.closest('[data-area-scope]')?.dataset.areaScope; const a = store.get('areas', {}); delete a[cid]; store.set('areas', a); const y = window.scrollY; render(); window.scrollTo(0, y); toast('기본 면적으로 계산합니다.'); }
  else if (t.dataset.yrStep) paintYear(Number(document.querySelector('[data-yr]').value) + Number(t.dataset.yrStep));
  else if (t.dataset.diaryDel) { if (confirm('이 기록을 삭제할까요?')) { store.set('diary', diary().filter((x) => x.id !== t.dataset.diaryDel)); render(); toast('기록을 삭제했습니다.'); } }
  else if ('diaryCsv' in t.dataset) {
    const cols = ['date', 'crop', 'field', 'work', 'input', 'pesticide', 'ratio', 'water', 'phi', 'product', 'qty', 'qunit', 'kg', 'boxes', 'price', 'buyer', 'people', 'hours', 'cost', 'memo'];
    const head = ['날짜', '작목', '필지', '작업', '내용', '약제', '희석배수', '물(L)', '안전일수', '비료', '양', '단위', '수확(kg)', '상자', '판매금액', '출하처', '인원', '작업시간', '비용', '메모'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    download('영농일지.csv', '﻿' + [head, ...diary().map((x) => cols.map((k) => x[k]))].map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
  } else if ('diaryBackup' in t.dataset) download('영농노트-백업.json', JSON.stringify({ app: 'youngnong', v: 1, favs: [...favs], diary: diary() }, null, 2), 'application/json');
  else if ('reset' in t.dataset) {
    if (confirm('내 작목, 면적 설정, 영농일지를 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) {
      Object.keys(localStorage).filter((k) => k.startsWith('yn:')).forEach((k) => localStorage.removeItem(k));
      favs = new Set();
      render();
      toast('이 기기의 내 데이터를 모두 지웠습니다.');
    }
  }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if ('plantForm' in f.dataset) {
    const o = Object.fromEntries(new FormData(f));
    if (!o.crop) { toast('작목을 골라 주세요.'); return; }
    const a = plantings();
    const id = f.dataset.edit || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { id, cropId: Number(o.crop), field: o.field.trim(), anchorIdx: o.anchor != null ? Number(o.anchor) : null, date: o.anchor != null ? o.date : null, memo: o.memo.trim(), created: isoDay() };
    const i = a.findIndex((x) => x.id === id);
    if (i >= 0) a[i] = { ...a[i], ...rec, created: a[i].created }; else a.push(rec);
    savePlantings(a);
    const areas = store.get('areas', {}); areas['P' + id] = { v: Number(o.area) || 0, u: o.unit }; store.set('areas', areas);
    if (!favs.has(String(o.crop))) { favs.add(String(o.crop)); saveFavs(); }
    location.hash = '#/farm/' + id;
    toast(i >= 0 ? '작기를 고쳤습니다.' : '작기를 등록했습니다. 아래에서 내 날짜에 맞춘 일정을 확인하세요.');
    return;
  }
  if ('recForm' in f.dataset) {
    const p = getPlanting(f.dataset.pid);
    if (!p) return;
    const e2 = recordFromForm(f, f.dataset.recForm, p);
    store.set('diary', [...diary(), e2]);
    location.hash = '#/farm/' + p.id + '?s=recs';
    const phi = e2.type === 'spray' && Number(e2.phi) > 0 ? ` <b>${md(addDays(parseDay(e2.date), Number(e2.phi)))}</b>부터 수확할 수 있습니다.` : '';
    toast(`${REC[e2.type]}을 저장했습니다.${phi}`);
    return;
  }
  if ('search' in f.dataset) {
    if (f.q.hasAttribute('data-live')) f.q.blur();
    else location.hash = '#/crops?q=' + encodeURIComponent(f.q.value.trim());
  } else if ('diaryForm' in f.dataset) {
    const o = Object.fromEntries(new FormData(f));
    o.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    o.createdAt = new Date().toISOString();
    store.set('diary', [...diary(), o]);
    render();
    toast(`<b>${esc(o.date)} ${esc(o.crop)} ${esc(o.work)}</b> 기록을 저장했습니다. <button data-jump="diary">기록 보기</button>`);
  }
});
function setArea(v, u, cid) {
  if (cid) { const a = store.get('areas', {}); a[cid] = { v: Number(v) || 0, u }; store.set('areas', a); }
  else store.set('area', { v: Number(v) || 0, u });
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('[data-live]')) {
    document.querySelector('[data-results]').innerHTML = cropResults(t.value, t.dataset.cat);
    const p = new URLSearchParams(); if (t.dataset.cat) p.set('cat', t.dataset.cat); if (t.value.trim()) p.set('q', t.value.trim());
    history.replaceState(null, '', '#/crops' + (p.size ? '?' + p : ''));
  } else if (t.matches('[data-area],[data-area-unit]')) {
    const root = t.closest('[data-area-scope]') || t.closest('section');
    setArea(root.querySelector('[data-area]').value, root.querySelector('[data-area-unit]').value, root.dataset.areaScope);
    paintCropFert(); paintTools();
  } else if (t.matches('[data-area-py],[data-area-range]')) {
    const py = Math.max(0, Number(t.value) || 0);
    setArea(py, 'pyeong');
    const other = document.querySelector(t.matches('[data-area-py]') ? '[data-area-range]' : '[data-area-py]');
    if (other) other.value = py;
    document.querySelector('[data-area-fig]').textContent = fmt((py || 300) * PY, 0);
    document.querySelector('[data-area-ratio]').textContent = fmt((py || 300) * PY / 1000, 2);
  } else if (t.matches('[data-fc]')) {
    const fc = store.get('fert', FERT_DEFAULT);
    const v = Number(t.value);
    if (v > 0) { t.dataset.fc === 'bag' ? (fc.bag = v) : (fc[t.dataset.fc].pct = v); store.set('fert', fc); paintTools(); }
  } else if (t.matches('[data-mix]')) paintMix();
  else if (t.matches('[data-mix-tool]')) { if (t.matches('[data-spray-per]')) store.set('sprayPer10a', Number(t.value) || 200); paintTools(); }
  else if (t.matches('[data-plant-crop]')) { const ed = t.form.dataset.edit; location.hash = '#/farm/new?crop=' + t.value + (ed ? '&edit=' + ed : ''); }
  else if (t.matches('[data-tool-crop]')) { store.set('toolCrop', t.value); location.hash = '#/tools?crop=' + t.value; }
  else if (t.matches('[data-yr]')) paintYear(Number(t.value));
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-city]') && t.value !== '') { const [name, lat, lon] = CITIES[Number(t.value)]; setLoc({ lat, lon, name }); return; }
  if (!t.matches('[data-diary-restore]') || !t.files[0]) return;
  t.files[0].text().then((txt) => {
    const b = JSON.parse(txt);
    if (b.app !== 'youngnong' || !Array.isArray(b.diary)) throw new Error();
    const have = new Set(diary().map((x) => x.id));
    const add = b.diary.filter((x) => x && x.id && !have.has(x.id));
    store.set('diary', [...diary(), ...add]);
    (b.favs || []).forEach((id) => favs.add(String(id)));
    saveFavs();
    render();
    toast(`백업에서 기록 ${add.length}건을 불러왔습니다.`);
  }).catch(() => toast('백업 파일을 읽지 못했습니다. 영농노트에서 받은 백업 파일인지 확인해 주세요.'));
});

// ---------- boot ----------
applyBig();
load().then((d) => { META = d; lastPath = location.hash.split('?')[0]; render(); })
  .catch((err) => { $app.innerHTML = `<div class="stack"><p class="empty">${esc(err.message)}. 연결 상태를 확인한 뒤 새로고침해 주세요.</p></div>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
