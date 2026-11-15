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
  for (const c of crops) for (const s of c.schedule || []) {
    const r = range(s);
    if (covers(r, x)) out.push({ c, s, r, ending: r[1] === x, starting: r[0] === x });
  }
  const ord = Object.keys(KINDS);
  return out.sort((a, b) => b.ending - a.ending || ord.indexOf(a.s.kind) - ord.indexOf(b.s.kind));
}
function todoList(list, mark) {
  return list.map(({ c, s, ending, starting }) => `
    <a class="todo-item" href="#/crop/${c.id}?s=${sectionOf(s.kind)}">
      ${kindTag(s.kind)}
      <div><b>${esc(s.task)}</b>${s.region ? ` <span class="tag plain">${esc(s.region)}</span>` : ''}${estTag(s)}
      <div class="todo-crop">${esc(shortName(c))}</div>
      <div class="when">${esc(whenText(s))}${!mark ? '' : ending ? ' · <span class="ending">이번 순까지</span>' : starting ? ' · 이번 순 시작' : ''}</div></div>
    </a>`).join('');
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
  const tasks = tasksAt(mine, x);
  const noData = mine.filter((c) => !hasDates(c));
  const quiet = mine.filter((c) => hasDates(c) && !tasks.some((t) => t.c.id === c.id));
  const yx = store.get('yearSlot', null) ?? (x + 1) % 36;
  const yf = yearFrag(yx);
  const area = store.get('area', { v: 1000, u: 'm2' });
  const py = Math.round((toM2(area.v, area.u) || 1000) / PY);
  const quick = QUICK.map((id) => BY_ID.get(String(id))).filter(Boolean);
  return `<div class="home">
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
        ${mine.length ? `
        <h2>내 작목 ${mine.length}개, 이번 순 작업 ${tasks.length}건</h2>
        <div class="frag" data-ui><div class="todo">
          ${tasks.length ? todoList(tasks.slice(0, 8), true) : '<div class="todo-item"><div><b>이번 순에 날짜가 적힌 작업은 없습니다</b><div class="when">아래 작목을 눌러 작업 방법과 연간 달력을 확인하세요.</div></div></div>'}
          ${tasks.length > 8 ? `<a class="todo-item more" href="#/calendar"><b>이번 순 작업 ${tasks.length}건 모두 보기</b></a>` : ''}
          ${quiet.map((c) => `<a class="todo-item more" href="#/crop/${c.id}?s=cal"><div><b>${esc(shortName(c))}</b><div class="when">이번 순에 날짜가 적힌 작업 없음 · 연간 달력 보기</div></div></a>`).join('')}
          ${noData.map((c) => `<a class="todo-item more" href="#/crop/${c.id}?s=stage"><div><b>${esc(shortName(c))}</b><div class="when">달력 자료 없음 · 작업 방법 보기</div></div></a>`).join('')}
        </div></div>
        <p class="more row"><a class="btn" href="#/calendar">${d.getMonth() + 1}월 달력 열기</a><a class="btn" href="#/crops">작목 더 담기</a></p>
        ` : `
        <h2>기르는 작목을 골라 주세요</h2>
        <p class="stage-sub">고른 작목의 이번 순 작업만 이 자리에 모아 드립니다. 가입 없이 이 기기에 저장됩니다.</p>
        <div class="quick" data-ui>${quick.map((c) => `<button class="quick-btn" data-fav="${c.id}" aria-pressed="false"><b>${esc(c.name)}</b>${c.type && c.type.length <= 8 ? `<span>${esc(c.type)}</span>` : ''}</button>`).join('')}</div>
        <p class="more row"><a class="btn" href="#/crops">전체 작목 ${CROPS.length}개에서 고르기</a></p>
        `}
      </div>
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
        <h2>밭이 몇 평인가요?</h2>
        <div class="area-ctl" data-ui>
          <label class="f">면적(평)<input type="number" inputmode="numeric" min="1" step="1" value="${py}" data-area-py></label>
          <input type="range" min="10" max="3000" step="10" value="${Math.min(3000, Math.max(10, py))}" data-area-range aria-label="면적 조절">
        </div>
      </div>
      <div class="area-out">
        <div class="area-fig"><span data-area-fig>${fmt(py * PY, 0)}</span><small>㎡</small></div>
        <p>여기서 정한 면적으로 작목마다 비료 주는 양이 자동 계산됩니다. 농사로의 비료 표는 300평(1,000㎡)을 기준으로 적혀 있고, <span data-area-ratio>${fmt(py * PY / 1000, 2)}</span>배로 환산합니다.</p>
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
const areaNow = () => { const a = store.get('area', { v: 1000, u: 'm2' }); return { a, m2: toM2(a.v, a.u) || 1000 }; };
const unitOpts = (u) => Object.entries(UNITS).map(([k, o]) => `<option value="${k}" ${k === u ? 'selected' : ''}>${o.label}</option>`).join('');

function viewCrop(id) {
  const c = BY_ID.get(String(id));
  if (!c) return `<div class="stack"><p class="empty">작목을 찾을 수 없습니다. <a href="#/crops">작목 목록으로</a></p></div>`;
  const noPeriod = (c.schedule || []).filter((s) => !range(s));
  const { a: area, m2 } = areaNow();
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
      <div class="calc-bar">
        <label class="f">내 밭 면적<input type="number" inputmode="decimal" min="0" step="any" data-area value="${esc(area.v)}"></label>
        <label class="f">단위<select data-area-unit>${unitOpts(area.u)}</select></label>
        <button class="btn quiet" data-area-reset>표준 300평으로</button>
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
  const { m2 } = areaNow();
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
    const ts = (c.schedule || []).map((s) => ({ s, r: range(s) })).filter(({ s, r }) => r && (!kind || s.kind === kind) && slots.some((sl) => covers(r, sl)));
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
  const { a: area } = areaNow();
  const fc = store.get('fert', FERT_DEFAULT);
  const withFert = CROPS.filter((c) => c.fertilizer?.rows?.length);
  const mine = withFert.filter(isFav);
  const sel = q.get('crop') || store.get('toolCrop', '') || (mine[0]?.id ?? withFert[0]?.id ?? '');
  const opt = (c) => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(fullName(c))}</option>`;
  return `<div class="stack">
    <h1>비료 계산기</h1>
    <section class="card"><h2>내 밭 면적</h2>
      <div class="form">
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
  </div>`;
}
function paintTools() {
  const { m2 } = areaNow();
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
          ${list.length ? '<div class="entries">' + list.map((e) => `<div class="entry"><div class="meta"><b>${esc(e.date)}</b><span class="tag plain">${esc(e.crop)}</span><span class="tag plain">${esc(e.work)}</span>${e.field ? `<span>${esc(e.field)}</span>` : ''}${e.hours ? `<span>${fmt(e.hours, 1)}시간</span>` : ''}${e.cost ? `<span>${fmt(e.cost, 0)}원</span>` : ''}</div>
            ${e.input ? `<p><b>쓴 자재</b> ${esc(e.input)}</p>` : ''}${e.memo ? `<p>${esc(e.memo)}</p>` : ''}
            <div><button class="btn small danger" data-diary-del="${esc(e.id)}">삭제</button></div></div>`).join('') + '</div>' : '<p class="sub">아직 기록이 없습니다. 오늘 한 작업을 적어 보세요.</p>'}
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
    <div class="link-grid top"><a class="link-card" href="#/tools"><b>비료 계산기</b><span>내 면적에 비료 몇 포대가 필요한지</span></a><a class="link-card" href="#/diary"><b>영농일지</b><span>오늘 한 작업, 쓴 자재, 비용 적기</span></a></div>
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
  else html = '<div class="stack"><p class="empty">페이지를 찾을 수 없습니다. <a href="#/">오늘 화면으로</a></p></div>';
  $app.innerHTML = html;
  document.body.classList.toggle('is-home', page === 'home');
  const nav = page === 'crop' ? 'crops' : page === 'tools' ? 'links' : page;
  document.querySelectorAll('[data-nav]').forEach((a) => { const on = a.dataset.nav === nav; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  motion();
  if (page === 'tools') paintTools();
  if (page === 'calendar') document.querySelectorAll('.filter .chip.on').forEach((el) => { const box = el.parentElement; box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - 16); });
  if (page === 'crop') {
    const c = BY_ID.get(String(seg[1]));
    document.title = c ? `${fullName(c)} — 영농노트` : '영농노트';
    paintCropFert();
    const s = q.get('s');
    if (s) requestAnimationFrame(() => document.getElementById('s-' + s)?.scrollIntoView());
  } else document.title = '영농노트 — 농사에 필요한 정보만, 한눈에';
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
  const t = e.target.closest('[data-fav],[data-go],[data-jump],[data-print],[data-area-reset],[data-diary-del],[data-diary-csv],[data-diary-backup],[data-reset],[data-yr-step]');
  if (!t) return;
  if (t.dataset.fav) { e.preventDefault(); toggleFav(t.dataset.fav); }
  else if (t.dataset.go) location.hash = t.dataset.go;
  else if (t.dataset.jump) document.getElementById('s-' + t.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if ('print' in t.dataset) window.print();
  else if ('areaReset' in t.dataset) { store.set('area', { v: 300, u: 'pyeong' }); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (t.dataset.yrStep) paintYear(Number(document.querySelector('[data-yr]').value) + Number(t.dataset.yrStep));
  else if (t.dataset.diaryDel) { if (confirm('이 기록을 삭제할까요?')) { store.set('diary', diary().filter((x) => x.id !== t.dataset.diaryDel)); render(); toast('기록을 삭제했습니다.'); } }
  else if ('diaryCsv' in t.dataset) {
    const cols = ['date', 'crop', 'work', 'field', 'input', 'hours', 'cost', 'memo'];
    const head = ['날짜', '작목', '작업', '필지', '투입자재', '작업시간', '비용', '메모'];
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
function setArea(v, u) { store.set('area', { v: Number(v) || 0, u }); }
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('[data-live]')) {
    document.querySelector('[data-results]').innerHTML = cropResults(t.value, t.dataset.cat);
    const p = new URLSearchParams(); if (t.dataset.cat) p.set('cat', t.dataset.cat); if (t.value.trim()) p.set('q', t.value.trim());
    history.replaceState(null, '', '#/crops' + (p.size ? '?' + p : ''));
  } else if (t.matches('[data-area],[data-area-unit]')) {
    const root = t.closest('section');
    setArea(root.querySelector('[data-area]').value, root.querySelector('[data-area-unit]').value);
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
  } else if (t.matches('[data-tool-crop]')) paintTools();
  else if (t.matches('[data-yr]')) paintYear(Number(t.value));
});
document.addEventListener('change', (e) => {
  const t = e.target;
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
load().then((d) => { META = d; lastPath = location.hash.split('?')[0]; render(); })
  .catch((err) => { $app.innerHTML = `<div class="stack"><p class="empty">${esc(err.message)}. 연결 상태를 확인한 뒤 새로고침해 주세요.</p></div>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
