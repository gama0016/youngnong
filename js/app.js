// 영농노트 — 정적 SPA (해시 라우팅). 데이터: data/crops.json (scripts/build-data.mjs 가 생성)
const $app = document.getElementById('app');
const KINDS = { sow: '파종', nursery: '육묘', plant: '심기', manage: '관리', fert: '비료', pest: '방제', harvest: '수확', etc: '기타' };
const CAT_ORDER = ['논농사', '밭농사', '채소', '과수', '화훼', '버섯', '약초', '사료작물', '축산'];
const XUN = ['상순', '중순', '하순'];

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
const today = () => new Date();
const xunOf = (d) => (d.getDate() <= 10 ? 1 : d.getDate() <= 20 ? 2 : 3);
const slot = (m, p) => (m - 1) * 3 + (p - 1); // 0..35
const nowSlot = () => slot(today().getMonth() + 1, xunOf(today()));
const fullName = (c) => c.name + (c.type ? ` (${c.type})` : '');

// 일정 항목 → [시작 slot, 끝 slot] (기간 없으면 null)
function range(s) {
  if (!s.start?.m) return null;
  const a = slot(s.start.m, s.start.p || 1);
  const e = s.end?.m ? s.end : s.start;
  const b = slot(e.m, e.p || (s.end?.m ? 3 : s.start.p || 3));
  return [a, b];
}
function covers(r, x) { return r && (r[0] <= r[1] ? x >= r[0] && x <= r[1] : x >= r[0] || x <= r[1]); }
function whenText(s) {
  if (s.text) return s.text;
  if (!s.start?.m) return '';
  const one = (t) => `${t.m}월${t.p ? ' ' + XUN[t.p - 1] : ''}`;
  return s.end?.m ? `${one(s.start)}~${one(s.end)}` : one(s.start);
}

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
const cats = () => {
  const m = new Map();
  for (const c of CROPS) m.set(c.category, (m.get(c.category) || 0) + 1);
  return [...m.entries()].sort((a, b) => (CAT_ORDER.indexOf(a[0]) + 99) % 99 - (CAT_ORDER.indexOf(b[0]) + 99) % 99);
};
const myCrops = () => CROPS.filter((c) => favs.has(String(c.id)));

// ---------- shared pieces ----------
const favBtn = (c) => `<button class="fav" data-fav="${c.id}" aria-pressed="${favs.has(String(c.id))}" aria-label="${esc(fullName(c))} 내 작목 ${favs.has(String(c.id)) ? '해제' : '추가'}" title="내 작목">★</button>`;
const cropCard = (c) => `<div class="crop-card-w" style="position:relative"><a class="crop-card" href="#/crop/${c.id}"><b>${esc(c.name)}</b><span>${esc(c.type || c.category)}</span></a>${favBtn(c)}</div>`;
const kindTag = (k) => `<span class="tag kind" data-kind="${esc(k || 'etc')}">${KINDS[k] || '기타'}</span>`;

function tasksAt(crops, x) {
  const out = [];
  for (const c of crops) for (const s of c.schedule || []) {
    const r = range(s);
    if (covers(r, x)) out.push({ c, s, r, ending: r[1] === x, starting: r[0] === x });
  }
  const ord = Object.keys(KINDS);
  return out.sort((a, b) => ord.indexOf(a.s.kind) - ord.indexOf(b.s.kind));
}

// ---------- views ----------
function viewHome() {
  const d = today();
  const x = nowSlot();
  const mine = myCrops();
  const tasks = tasksAt(mine, x);
  const next = tasksAt(mine, (x + 1) % 36).filter((t) => t.starting);
  const risks = mine.flatMap((c) => (c.disasters || []).map((r) => ({ c, r }))).slice(0, 6);

  const todo = (list, isNext) => list.map(({ c, s, ending, starting }) => `
    <a class="todo-item" href="#/crop/${c.id}">
      ${kindTag(s.kind)}
      <div><span class="todo-crop">${esc(fullName(c))}</span><br><b>${esc(s.task)}</b>${s.region ? ` <span class="tag">${esc(s.region)}</span>` : ''}
      <div class="when">${esc(whenText(s))}${isNext ? '' : ending ? ' · <span class="ending">이번 순까지</span>' : starting ? ' · 이번 순 시작' : ''}</div></div>
    </a>`).join('');

  return `<div class="stack">
    <section class="hero">
      <p class="date">${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${d.getMonth() + 1}월 ${XUN[xunOf(d) - 1]}</p>
      <h1>지금 해야 할 농작업</h1>
    </section>
    <form class="search-big" data-search role="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/></svg>
      <input type="search" name="q" placeholder="작목 검색 (예: 고추, 사과, 벼)" aria-label="작목 검색" autocomplete="off">
    </form>
    ${mine.length ? `
    <div class="grid-2">
      <section class="card"><h2>이번 순 작업 <small>${d.getMonth() + 1}월 ${XUN[xunOf(d) - 1]} · 내 작목 기준</small></h2>
        ${tasks.length ? `<div class="todo">${todo(tasks)}</div>` : '<p class="sub">이번 순에 시기가 표기된 작업이 없습니다. 작목 상세에서 전체 일정을 확인하세요.</p>'}
      </section>
      <div class="stack">
        <section class="card"><h2>다음 순에 시작 <small>미리 준비</small></h2>
          ${next.length ? `<div class="todo">${todo(next, true)}</div>` : '<p class="sub">다음 순에 새로 시작하는 작업이 없습니다.</p>'}
        </section>
        <section class="card"><h2>내 작목 <small>${mine.length}개</small></h2>
          <div class="crop-grid">${mine.map(cropCard).join('')}</div>
        </section>
      </div>
    </div>
    ${risks.length ? `<section class="card"><h2>내 작목 재해 대비 <small>미리 점검</small></h2>
      <div class="chips">${risks.map(({ c, r }) => `<a class="chip" href="#/crop/${c.id}?s=risk">${esc(c.name)} · ${esc(r.risk)}</a>`).join('')}</div></section>` : ''}
    ` : `
    <section class="card"><h2>내 작목을 먼저 골라 주세요</h2>
      <p class="sub" style="margin-bottom:14px">재배하는 작목의 ★를 누르면, 이 화면에 그 작목의 <b>이번 순 농작업</b>만 모아서 보여 드립니다. 가입 없이 이 기기에 저장됩니다.</p>
      <a class="btn primary" href="#/crops">작목 고르기</a>
    </section>
    <section class="card"><h2>이번 순 전체 작목 작업 <small>${d.getMonth() + 1}월 ${XUN[xunOf(d) - 1]}</small></h2>
      ${(() => { const all = tasksAt(CROPS, x).slice(0, 14); return all.length ? `<div class="todo">${todo(all)}</div><p style="margin-top:12px"><a class="btn small" href="#/calendar">달력에서 전체 보기</a></p>` : '<p class="sub">표시할 작업이 없습니다.</p>'; })()}
    </section>`}
  </div>`;
}

function viewCrops(q) {
  const term = (q.get('q') || '').trim();
  const cat = q.get('cat') || '';
  const list = CROPS.filter((c) => (!cat || c.category === cat) && (!term || fullName(c).includes(term)));
  const groups = new Map();
  for (const c of list) (groups.get(c.category) || groups.set(c.category, []).get(c.category)).push(c);
  const sorted = [...groups.entries()].sort((a, b) => (CAT_ORDER.indexOf(a[0]) + 99) % 99 - (CAT_ORDER.indexOf(b[0]) + 99) % 99);
  return `<div class="stack">
    <h1>작목</h1>
    <form class="search-big" data-search role="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/></svg>
      <input type="search" name="q" value="${esc(term)}" placeholder="작목 이름으로 찾기" aria-label="작목 검색" autocomplete="off">
    </form>
    <div class="chips scroll">
      <a class="chip ${cat ? '' : 'on'}" href="#/crops${term ? '?q=' + encodeURIComponent(term) : ''}">전체 <span class="n">${CROPS.length}</span></a>
      ${cats().map(([k, n]) => `<a class="chip ${cat === k ? 'on' : ''}" href="#/crops?cat=${encodeURIComponent(k)}${term ? '&q=' + encodeURIComponent(term) : ''}">${esc(k)} <span class="n">${n}</span></a>`).join('')}
    </div>
    <div>${sorted.length ? sorted.map(([k, v]) => `<h2 class="cat-h">${esc(k)} <small>${v.length}</small></h2><div class="crop-grid">${v.map(cropCard).join('')}</div>`).join('') : '<p class="empty">찾는 작목이 없습니다. 다른 이름으로 검색해 보세요.</p>'}</div>
  </div>`;
}

function gantt(c) {
  const rows = (c.schedule || []).map((s) => ({ s, r: range(s) })).filter((o) => o.r);
  if (!rows.length) return '';
  const x = nowSlot();
  const m = today().getMonth() + 1;
  const bar = (a, b, k) => `<i class="g-bar" data-kind="${esc(k || 'etc')}" style="grid-column:${a + 1}/${b + 2}"></i>`;
  return `<div class="gantt-wrap"><div class="gantt" role="img" aria-label="${esc(fullName(c))} 연간 농작업 달력">
    <div class="g-row"><span></span><div class="g-months">${Array.from({ length: 12 }, (_, i) => `<span class="${i + 1 === m ? 'now' : ''}">${i + 1}월</span>`).join('')}</div></div>
    ${rows.map(({ s, r }) => `<div class="g-row">
      <div class="g-label">${esc(s.task)}${s.region ? `<small>${esc(s.region)}</small>` : ''}</div>
      <div class="g-track" title="${esc(whenText(s))}">${r[0] <= r[1] ? bar(r[0], r[1], s.kind) : bar(r[0], 35, s.kind) + bar(0, r[1], s.kind)}<i class="g-now" style="left:${((x + 0.5) / 36) * 100}%"></i></div>
    </div>`).join('')}
  </div></div>
  <div class="legend">${Object.entries(KINDS).map(([k, v]) => `<span data-kind="${k}"><i></i>${v}</span>`).join('')}<span><i style="background:var(--accent);width:2px"></i>지금</span></div>`;
}

function fertTable(c, areaM2) {
  const f = c.fertilizer;
  if (!f?.rows?.length) return '';
  const per10a = /10\s*a/i.test(f.unit || '');
  const k = per10a ? areaM2 / 1000 : 1;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>구분</th>${(f.columns || []).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${f.rows.map((r) => `<tr><th>${esc(r.name)}</th>${(r.values || []).map((v) => `<td>${typeof v === 'number' ? fmt(v * k, 2) : esc(v ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function viewCrop(id, q) {
  const c = BY_ID.get(String(id));
  if (!c) return `<p class="empty">작목을 찾을 수 없습니다. <a href="#/crops">작목 목록</a></p>`;
  const noPeriod = (c.schedule || []).filter((s) => !range(s));
  const area = store.get('area', { v: 1000, u: 'm2' });
  const areaM2 = toM2(area.v, area.u);
  const has = { cal: (c.schedule || []).length, stage: (c.stages || []).length, fert: c.fertilizer?.rows?.length, pest: (c.pests || []).length, risk: (c.disasters || []).length };
  const jump = [['cal', '달력'], ['stage', '작업 방법'], ['fert', '비료'], ['pest', '병해충'], ['risk', '재해 대책']].filter(([k]) => has[k]);
  return `<div class="stack" data-crop="${c.id}">
    <p class="crumb"><a href="#/crops">작목</a> › <a href="#/crops?cat=${encodeURIComponent(c.category)}">${esc(c.category)}</a></p>
    <header class="crop-head">
      <div class="spread">
        <h1>${esc(c.name)}${c.type ? `<small>${esc(c.type)}</small>` : ''}</h1>
        <div class="row">
          <button class="btn" data-fav="${c.id}" aria-pressed="${favs.has(String(c.id))}">★ 내 작목</button>
          <a class="btn" href="#/diary?crop=${c.id}">일지 쓰기</a>
          <button class="btn" data-print>인쇄</button>
        </div>
      </div>
      ${c.sciName || c.family ? `<p class="sub">${esc([c.sciName, c.family].filter(Boolean).join(' · '))}</p>` : ''}
      ${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
    </header>
    ${jump.length > 1 ? `<nav class="jump chips scroll" aria-label="섹션 이동">${jump.map(([k, v]) => `<button class="chip" data-jump="${k}">${v}</button>`).join('')}</nav>` : ''}
    ${(c.env || []).length ? `<section class="card"><h2>재배 환경 기준</h2><dl class="facts">${c.env.map((e) => `<div class="fact"><dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl></section>` : ''}
    ${has.cal ? `<section class="card" id="s-cal"><h2>연간 농작업 달력</h2>
      ${gantt(c) || '<p class="sub">농사로 원문에 시기가 명시된 작업이 없습니다.</p>'}
      ${noPeriod.length ? `<p class="sub" style="margin:14px 0 8px">시기 미표기 작업 (원문 표 참조)</p><div class="chips">${noPeriod.map((s) => `<span class="tag" style="padding:5px 11px">${esc(s.task)}</span>`).join('')}</div>` : ''}
    </section>` : ''}
    ${has.stage ? `<section class="card" id="s-stage"><h2>단계별 작업 방법</h2>${c.stages.map((s) => `<div class="stage">
      <h3>${esc(s.title)}${s.timing ? `<small>${esc(s.timing)}</small>` : ''}</h3>
      <dl class="kv">${(s.items || []).map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join('')}</dl></div>`).join('')}</section>` : ''}
    ${has.fert ? `<section class="card" id="s-fert"><h2>비료 주는 양 <small data-fert-unit></small></h2>
      <div class="calc-bar">
        <label class="f">내 밭 면적<input type="number" inputmode="decimal" min="0" step="any" data-area value="${esc(area.v)}"></label>
        <label class="f">단위<select data-area-unit>${Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === area.u ? 'selected' : ''}>${u.label}</option>`).join('')}</select></label>
        <button class="btn" data-area-reset>기준(10a)으로</button>
      </div>
      <div data-fert>${fertTable(c, areaM2)}</div>
      ${c.fertilizer.note ? `<p class="sub" style="margin-top:10px">${esc(c.fertilizer.note)}</p>` : ''}
      <p class="sub" style="margin-top:10px">표의 성분량은 표준 기준입니다. 토양검정을 받으면 내 밭에 맞는 시비 처방을 받을 수 있습니다 (<a href="https://soil.rda.go.kr" target="_blank" rel="noopener">흙토람</a>). 실제 비료 포대 수는 <a href="#/tools?crop=${c.id}">계산기</a>에서 환산하세요.</p>
    </section>` : ''}
    ${has.pest ? `<section class="card" id="s-pest"><h2>병해충·생리장해</h2><div class="tbl-wrap"><table>
      <thead><tr><th>이름</th><th>구분</th><th class="wrap">발생 시기</th><th class="wrap">방제·대책</th></tr></thead>
      <tbody>${c.pests.map((p) => `<tr><th>${esc(p.name)}</th><td style="text-align:left">${esc(p.kind || '')}</td><td class="wrap">${esc(p.timing || '–')}</td><td class="wrap">${esc(p.control || '–')}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin-top:10px">등록 약제와 안전사용기준은 <a href="https://psis.rda.go.kr" target="_blank" rel="noopener">농약안전정보시스템</a>, 병해충 예찰·진단은 <a href="https://ncpms.rda.go.kr" target="_blank" rel="noopener">국가농작물병해충관리시스템</a>에서 확인하세요.</p>
    </section>` : ''}
    ${has.risk ? `<section class="card" id="s-risk"><h2>기상재해 대책</h2>${c.disasters.map((r) => `<div class="risk"><h3>${esc(r.risk)}${r.timing ? `<small>${esc(r.timing)}</small>` : ''}</h3><ul class="dots">${(r.measures || []).map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`).join('')}</section>` : ''}
    ${(c.notes || []).length ? `<section class="card"><h2>참고</h2><ul class="dots">${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    <p class="source">출처: 농촌진흥청 농사로 농작업일정 「${esc(fullName(c))}」 · <a href="${esc(c.source)}" target="_blank" rel="noopener">원문 보기</a></p>
  </div>`;
}

function viewCalendar(q) {
  const m = Math.min(12, Math.max(1, Number(q.get('m')) || today().getMonth() + 1));
  const scope = q.get('scope') || (favs.size ? 'mine' : 'all');
  const cat = q.get('cat') || '';
  const kind = q.get('kind') || '';
  const link = (o) => { const p = new URLSearchParams({ m, scope, cat, kind, ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); return '#/calendar?' + p; };
  const pool = (scope === 'mine' ? myCrops() : CROPS).filter((c) => !cat || c.category === cat);
  const groups = [];
  for (const c of pool) {
    const ts = (c.schedule || []).map((s) => ({ s, r: range(s) })).filter(({ s, r }) => r && (!kind || s.kind === kind) && [0, 1, 2].some((p) => covers(r, slot(m, p + 1))));
    if (ts.length) groups.push({ c, ts });
  }
  const curM = today().getMonth() + 1;
  return `<div class="stack">
    <h1>월별 농작업 달력</h1>
    <div class="months">${Array.from({ length: 12 }, (_, i) => `<button data-go="${link({ m: i + 1 })}" aria-pressed="${i + 1 === m}" class="${i + 1 === curM ? 'now' : ''}">${i + 1}월</button>`).join('')}</div>
    <div class="chips scroll">
      <a class="chip ${scope === 'mine' ? 'on' : ''}" href="${link({ scope: 'mine' })}">★ 내 작목</a>
      <a class="chip ${scope === 'all' ? 'on' : ''}" href="${link({ scope: 'all' })}">전체 작목</a>
      <span style="width:8px;flex:none"></span>
      <a class="chip ${cat ? '' : 'on'}" href="${link({ cat: '' })}">모든 분류</a>
      ${cats().map(([k]) => `<a class="chip ${cat === k ? 'on' : ''}" href="${link({ cat: k })}">${esc(k)}</a>`).join('')}
    </div>
    <div class="chips scroll">
      <a class="chip ${kind ? '' : 'on'}" href="${link({ kind: '' })}">모든 작업</a>
      ${Object.entries(KINDS).map(([k, v]) => `<a class="chip ${kind === k ? 'on' : ''}" href="${link({ kind: k })}">${v}</a>`).join('')}
    </div>
    <section class="card"><h2>${m}월 작업 <small>${groups.length}개 작목 · 칸은 상순/중순/하순</small></h2>
      ${groups.length ? groups.map(({ c, ts }) => `<div class="cal-group"><a href="#/crop/${c.id}">${esc(fullName(c))}</a><div class="cal-tasks">
        ${ts.map(({ s, r }) => `<div class="cal-task" data-kind="${esc(s.kind || 'etc')}">${kindTag(s.kind)}<span>${esc(s.task)}${s.region ? ` <span class="tag">${esc(s.region)}</span>` : ''}</span>
          <span class="when"><span class="xun" aria-hidden="true">${[1, 2, 3].map((p) => `<i class="${covers(r, slot(m, p)) ? 'on' : ''}"></i>`).join('')}</span> ${esc(whenText(s))}</span></div>`).join('')}
      </div></div>`).join('') : `<p class="empty">${scope === 'mine' && !favs.size ? '내 작목이 없습니다. <a href="#/crops">작목에서 ★</a>를 눌러 추가하세요.' : '이 달에 시기가 표기된 작업이 없습니다.'}</p>`}
    </section>
  </div>`;
}

// ---------- tools ----------
const UNITS = {
  m2: { label: '㎡', m2: 1 },
  pyeong: { label: '평', m2: 400 / 121 },
  a: { label: 'a (아르)', m2: 100 },
  danbo: { label: '단보 (10a·300평)', m2: 1000 },
  ha: { label: 'ha (정보)', m2: 10000 },
};
const toM2 = (v, u) => (Number(v) || 0) * (UNITS[u]?.m2 || 1);
const FERT_DEFAULT = { n: { name: '요소', pct: 46 }, p: { name: '용성인비', pct: 20 }, k: { name: '염화칼리', pct: 60 }, bag: 20 };

function viewTools(q) {
  const area = store.get('area', { v: 1000, u: 'm2' });
  const fc = store.get('fert', FERT_DEFAULT);
  const withFert = CROPS.filter((c) => c.fertilizer?.rows?.length);
  const sel = q.get('crop') || store.get('toolCrop', '') || (withFert[0]?.id ?? '');
  return `<div class="stack">
    <h1>계산기</h1>
    <section class="card"><h2>면적 환산</h2>
      <div class="form">
        <label class="f">면적<input type="number" inputmode="decimal" min="0" step="any" data-area value="${esc(area.v)}"></label>
        <label class="f">단위<select data-area-unit>${Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === area.u ? 'selected' : ''}>${u.label}</option>`).join('')}</select></label>
      </div>
      <dl class="facts" style="margin-top:14px" data-area-out></dl>
    </section>
    <section class="card"><h2>시비량 계산 <small>농사로 표준 시비량 × 내 면적</small></h2>
      ${withFert.length ? `
      <div class="form">
        <label class="f wide">작목<select data-tool-crop>${withFert.map((c) => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('')}</select></label>
      </div>
      <div data-tool-fert style="margin-top:14px"></div>
      <h3 style="margin:18px 0 8px">비료 실물량 환산 <span class="sub" style="font-weight:500">성분량 ÷ 비료의 성분 함량</span></h3>
      <div class="form">
        <label class="f">질소 비료 함량(%)<input type="number" min="1" max="100" step="any" data-fc="n" value="${esc(fc.n.pct)}"></label>
        <label class="f">인산 비료 함량(%)<input type="number" min="1" max="100" step="any" data-fc="p" value="${esc(fc.p.pct)}"></label>
        <label class="f">칼리 비료 함량(%)<input type="number" min="1" max="100" step="any" data-fc="k" value="${esc(fc.k.pct)}"></label>
        <label class="f">포대 무게(kg)<input type="number" min="1" step="any" data-fc="bag" value="${esc(fc.bag)}"></label>
      </div>
      <div data-tool-real style="margin-top:14px"></div>
      <p class="sub" style="margin-top:10px">기본값은 요소(질소 46%)·용성인비(인산 20%)·염화칼리(칼리 60%)입니다. 사용하는 비료 포대의 보증성분량으로 바꿔 계산하세요. 복합비료는 성분별로 겹치는 양을 감안해야 합니다.</p>
      ` : '<p class="sub">시비 표가 있는 작목 데이터가 없습니다.</p>'}
    </section>
  </div>`;
}
function paintTools() {
  const area = store.get('area', { v: 1000, u: 'm2' });
  const m2 = toM2(area.v, area.u);
  const out = document.querySelector('[data-area-out]');
  if (out) out.innerHTML = [['㎡', m2, 1], ['평', m2 / (400 / 121), 1], ['a', m2 / 100, 2], ['10a (단보)', m2 / 1000, 3], ['ha', m2 / 10000, 4]].map(([l, v, d]) => `<div class="fact"><dt>${l}</dt><dd>${fmt(v, d)}</dd></div>`).join('');
  const selEl = document.querySelector('[data-tool-crop]');
  if (!selEl) return;
  const c = BY_ID.get(String(selEl.value));
  store.set('toolCrop', selEl.value);
  document.querySelector('[data-tool-fert]').innerHTML = `<p class="sub" style="margin-bottom:8px">${fmt(m2, 0)}㎡ 기준 · 단위 ${/10\s*a/i.test(c.fertilizer.unit || '') ? 'kg' : esc(c.fertilizer.unit || '')}</p>` + fertTable(c, m2);
  const fc = store.get('fert', FERT_DEFAULT);
  const total = (re) => { const r = c.fertilizer.rows.find((x) => re.test(x.name)); const v = r?.values?.find((x) => typeof x === 'number'); return typeof v === 'number' && /10\s*a/i.test(c.fertilizer.unit || '') ? v * m2 / 1000 : null; };
  const rows = [['질소', /질소/, fc.n], ['인산', /인산/, fc.p], ['칼리', /칼리|칼륨|가리/, fc.k]].map(([n, re, f]) => { const t = total(re); const real = t == null ? null : t / (f.pct / 100); return `<tr><th>${n}</th><td>${fmt(t, 2)}</td><td>${fmt(f.pct, 1)}%</td><td>${fmt(real, 1)}</td><td>${real == null ? '–' : fmt(real / fc.bag, 1)}</td></tr>`; }).join('');
  document.querySelector('[data-tool-real]').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>성분</th><th>필요 성분량(kg)</th><th>비료 함량</th><th>비료 실물량(kg)</th><th>${fmt(fc.bag, 0)}kg 포대</th></tr></thead><tbody>${rows}</tbody></table></div><p class="sub" style="margin-top:8px">표의 첫 번째 수치 열(${esc(c.fertilizer.columns?.[0] || '합계')}) 기준입니다.</p>`;
}

// ---------- diary ----------
const WORKS = ['경운·정지', '파종', '육묘', '정식·이앙', '물 관리', '비료', '방제', '제초', '전정·유인', '수확', '출하', '기타'];
const diary = () => store.get('diary', []);
function viewDiary(q) {
  const list = diary().sort((a, b) => (a.date < b.date ? 1 : -1));
  const pre = q.get('crop') ? BY_ID.get(q.get('crop')) : null;
  const d = today();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const year = String(d.getFullYear());
  const yl = list.filter((e) => e.date.startsWith(year));
  const hours = yl.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const cost = yl.reduce((s, e) => s + (Number(e.cost) || 0), 0);
  const names = [...new Set([...myCrops().map(fullName), ...CROPS.map(fullName)])];
  return `<div class="stack">
    <h1>영농일지</h1>
    <p class="notice">일지는 이 기기(브라우저)에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 <b>백업</b>을 받아 두세요.</p>
    <div class="grid-2">
      <section class="card"><h2>오늘 작업 기록</h2>
        <form class="form" data-diary-form>
          <label class="f">날짜<input type="date" name="date" value="${iso}" required></label>
          <label class="f">작목<input type="text" name="crop" list="croplist" value="${esc(pre ? fullName(pre) : '')}" placeholder="예: 고추" required><datalist id="croplist">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="f">작업<select name="work">${WORKS.map((w) => `<option>${w}</option>`).join('')}</select></label>
          <label class="f">필지·하우스<input type="text" name="field" placeholder="예: 앞밭, 2동"></label>
          <label class="f wide">투입 자재 (비료·농약·종자 등, 사용량)<input type="text" name="input" placeholder="예: 요소 20kg"></label>
          <label class="f">작업 시간(시간)<input type="number" name="hours" min="0" step="0.5" inputmode="decimal"></label>
          <label class="f">비용(원)<input type="number" name="cost" min="0" step="1" inputmode="numeric"></label>
          <label class="f wide">메모<textarea name="memo" placeholder="생육 상태, 날씨, 특이사항"></textarea></label>
          <div class="wide"><button class="btn primary" type="submit">기록 저장</button></div>
        </form>
      </section>
      <div class="stack">
        <section class="card"><h2>${year}년 요약</h2>
          <div class="stat"><div><b>${yl.length}</b><span>기록</span></div><div><b>${fmt(hours, 1)}</b><span>작업 시간</span></div><div><b>${fmt(cost, 0)}</b><span>비용(원)</span></div></div>
          <div class="row" style="margin-top:14px">
            <button class="btn small" data-diary-csv>엑셀용 CSV 내보내기</button>
            <button class="btn small" data-diary-backup>백업 파일 받기</button>
            <label class="btn small">백업 불러오기<input type="file" accept="application/json" data-diary-restore hidden></label>
          </div>
        </section>
        <section class="card"><h2>기록 <small>${list.length}건</small></h2>
          ${list.length ? list.map((e) => `<div class="entry"><div class="meta"><b>${esc(e.date)}</b><span class="tag">${esc(e.crop)}</span><span class="tag">${esc(e.work)}</span>${e.field ? `<span>${esc(e.field)}</span>` : ''}${e.hours ? `<span>${fmt(e.hours, 1)}시간</span>` : ''}${e.cost ? `<span>${fmt(e.cost, 0)}원</span>` : ''}</div>
            ${e.input ? `<p><b>투입</b> ${esc(e.input)}</p>` : ''}${e.memo ? `<p>${esc(e.memo)}</p>` : ''}
            <div><button class="btn small danger" data-diary-del="${esc(e.id)}">삭제</button></div></div>`).join('') : '<p class="sub">아직 기록이 없습니다. 왼쪽에서 오늘 작업을 적어 보세요.</p>'}
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

// ---------- links ----------
const LINKS = [
  ['농사로', '농촌진흥청 농업기술 포털 (이 사이트의 원자료)', 'https://www.nongsaro.go.kr'],
  ['농약안전정보시스템', '작물별 등록 농약·안전사용기준 검색', 'https://psis.rda.go.kr'],
  ['국가농작물병해충관리시스템', '병해충 예찰·진단·방제 정보', 'https://ncpms.rda.go.kr'],
  ['흙토람', '토양검정·비료사용처방·토양 지도', 'https://soil.rda.go.kr'],
  ['농업날씨 365', '농업기상·작목별 기상재해 정보', 'https://weather.rda.go.kr'],
  ['농업기술길잡이', '작목별 표준 영농교본', 'https://www.nongsaro.go.kr/portal/ps/psb/psbx/cropEbookMain.ps?menuId=PS65290'],
  ['농사로 농작업일정', '작목별 농작업일정 원문·파일', 'https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleLst.ps?menuId=PS00087'],
  ['농촌진흥청', '보도자료·주간농사정보', 'https://www.rda.go.kr'],
];
function viewLinks(meta) {
  return `<div class="stack">
    <h1>더보기</h1>
    <section class="card"><h2>농촌진흥청 서비스 바로가기</h2>
      <div class="link-grid">${LINKS.map(([t, d, u]) => `<a class="link-card" href="${u}" target="_blank" rel="noopener"><b>${t} ↗</b><span>${d}</span></a>`).join('')}</div>
    </section>
    <section class="card"><h2>이 사이트의 자료</h2>
      <ul class="dots">
        <li>수록 작목 <b>${CROPS.length}</b>개 (작형 포함) · 자료 정리일 ${esc(meta.updated || '')}</li>
        <li>모든 수치는 농촌진흥청 농사로 「농작업일정」 원문에서 가져왔으며, 작목마다 원문 링크를 달아 두었습니다.</li>
        <li>원문에 시기가 명시되지 않은 작업은 달력에 넣지 않고 '시기 미표기 작업'으로 따로 표시합니다.</li>
        <li>이용 조건: 공공누리 제2유형 (출처표시, 상업적 이용금지).</li>
      </ul>
    </section>
    <section class="card"><h2>내 데이터</h2>
      <p class="sub" style="margin-bottom:12px">내 작목·면적·영농일지는 이 기기에만 저장됩니다.</p>
      <button class="btn danger" data-reset>이 기기의 내 데이터 모두 지우기</button>
    </section>
  </div>`;
}

// ---------- router ----------
let META = {};
function render() {
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(qs);
  const seg = path.split('/').filter(Boolean);
  const page = seg[0] || 'home';
  let html;
  if (page === 'home') html = viewHome();
  else if (page === 'crops') html = viewCrops(q);
  else if (page === 'crop') html = viewCrop(seg[1], q);
  else if (page === 'calendar') html = viewCalendar(q);
  else if (page === 'tools') html = viewTools(q);
  else if (page === 'diary') html = viewDiary(q);
  else if (page === 'links') html = viewLinks(META);
  else html = '<p class="empty">페이지를 찾을 수 없습니다. <a href="#/">홈으로</a></p>';
  $app.innerHTML = html;
  const nav = page === 'crop' ? 'crops' : page;
  document.querySelectorAll('[data-nav]').forEach((a) => { const on = a.dataset.nav === nav; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  if (page === 'tools') paintTools();
  if (page === 'crop') {
    const c = BY_ID.get(String(seg[1]));
    document.title = c ? `${fullName(c)} — 영농노트` : '영농노트';
    paintCropFert();
    const s = q.get('s');
    if (s) document.getElementById('s-' + s)?.scrollIntoView();
  } else document.title = '영농노트 — 농사에 필요한 정보만, 한눈에';
}
let lastPath = '';
window.addEventListener('hashchange', () => {
  const p = location.hash.split('?')[0];
  const keep = p === lastPath ? window.scrollY : 0;
  lastPath = p;
  render();
  window.scrollTo(0, keep);
});

function paintCropFert() {
  const root = document.querySelector('[data-crop]');
  const box = root?.querySelector('[data-fert]');
  if (!box) return;
  const c = BY_ID.get(root.dataset.crop);
  const area = store.get('area', { v: 1000, u: 'm2' });
  const m2 = toM2(area.v, area.u);
  box.innerHTML = fertTable(c, m2);
  const per10a = /10\s*a/i.test(c.fertilizer.unit || '');
  root.querySelector('[data-fert-unit]').textContent = per10a ? (m2 === 1000 ? '10a(1,000㎡·약 300평)당 kg' : `내 면적 ${fmt(m2, 0)}㎡ 기준 kg`) : (c.fertilizer.unit || '');
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-fav],[data-go],[data-jump],[data-print],[data-area-reset],[data-diary-del],[data-diary-csv],[data-diary-backup],[data-reset]');
  if (!t) return;
  if (t.dataset.fav) {
    e.preventDefault();
    const id = t.dataset.fav;
    favs.has(id) ? favs.delete(id) : favs.add(id);
    saveFavs();
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => b.setAttribute('aria-pressed', favs.has(id)));
  } else if (t.dataset.go) location.hash = t.dataset.go;
  else if (t.dataset.jump) document.getElementById('s-' + t.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if ('print' in t.dataset) window.print();
  else if ('areaReset' in t.dataset) { store.set('area', { v: 1000, u: 'm2' }); render(); }
  else if (t.dataset.diaryDel) { if (confirm('이 기록을 삭제할까요?')) { store.set('diary', diary().filter((x) => x.id !== t.dataset.diaryDel)); render(); } }
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
    }
  }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if ('search' in f.dataset) location.hash = '#/crops?q=' + encodeURIComponent(f.q.value.trim());
  else if ('diaryForm' in f.dataset) {
    const o = Object.fromEntries(new FormData(f));
    o.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    o.createdAt = new Date().toISOString();
    store.set('diary', [...diary(), o]);
    render();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('[data-area],[data-area-unit]')) {
    const root = t.closest('section');
    store.set('area', { v: Number(root.querySelector('[data-area]').value) || 0, u: root.querySelector('[data-area-unit]').value });
    paintCropFert(); paintTools();
  } else if (t.matches('[data-fc]')) {
    const fc = store.get('fert', FERT_DEFAULT);
    const v = Number(t.value);
    if (v > 0) { t.dataset.fc === 'bag' ? (fc.bag = v) : (fc[t.dataset.fc].pct = v); store.set('fert', fc); paintTools(); }
  } else if (t.matches('[data-tool-crop]')) paintTools();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.matches('[data-diary-restore]') || !t.files[0]) return;
  t.files[0].text().then((txt) => {
    const b = JSON.parse(txt);
    if (b.app !== 'youngnong' || !Array.isArray(b.diary)) throw new Error();
    const have = new Set(diary().map((x) => x.id));
    store.set('diary', [...diary(), ...b.diary.filter((x) => x && x.id && !have.has(x.id))]);
    (b.favs || []).forEach((id) => favs.add(String(id)));
    saveFavs();
    render();
  }).catch(() => alert('백업 파일을 읽을 수 없습니다.'));
});

// ---------- boot ----------
load().then((d) => { META = d; lastPath = location.hash.split('?')[0]; render(); })
  .catch((err) => { $app.innerHTML = `<p class="empty">${esc(err.message)}. 연결 상태를 확인한 뒤 새로고침해 주세요.</p>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
