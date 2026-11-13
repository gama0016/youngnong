// data/crops/*.json → data/crops.json (사이트가 읽는 단일 번들). 실행: node scripts/build-data.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const KINDS = ['sow', 'nursery', 'plant', 'manage', 'fert', 'pest', 'harvest', 'etc'];
const CATS = ['논농사', '밭농사', '채소', '과수', '화훼', '버섯', '약초', '사료작물', '축산'];
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null || v === '' ? null : String(v).trim());
const pt = (t) => {
  const m = Number(t?.m);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  const p = Number(t?.p);
  return { m, p: [1, 2, 3].includes(p) ? p : null };
};
const META = /페이지|옮김|schedule|start\/end|stages|null|JSON|fetch|스키마|추출|원문 표가|평탄화|확인되지 않|비워|표기 그대로|환산한 것|임의|본 데이터/i;

// ---- 날짜 보완: 원문 본문(단계별 작업의 시기 문구, 일정 항목의 문구)에 글로 적힌 월·순을 읽어 달력에 넣는다.
// 이렇게 채운 항목은 est: true 로 표시되고 화면에서 "추정"으로 구분된다. 상대 시기(○○ 후 20일 등)는 읽지 않는다.
const XP = { 상: [1, 1], 하: [3, 3], 상순: [1, 1], 초순: [1, 1], 초: [1, 1], 중순: [2, 2], 중: [2, 2], 하순: [3, 3], 말: [3, 3], 상중순: [1, 2], 중하순: [2, 3], 초중순: [1, 2] };
const X = '(상중순|중하순|초중순|상순|초순|중순|하순|[상중하초](?=\\s*[~∼-]))';
const RE = [
  // 4월 하순~5월 상순 / 4월~5월 상순 / 4월 하순~5월
  [new RegExp(`(\\d{1,2})월\\s*${X}?\\s*[~∼-]\\s*(\\d{1,2})월\\s*${X}?`), (m) => ({ a: [+m[1], m[2]], b: [+m[3], m[4]] })],
  // 11월 상순~중순
  [new RegExp(`(\\d{1,2})월\\s*${X}\\s*[~∼-]\\s*${X}`), (m) => ({ a: [+m[1], m[2]], b: [+m[1], m[3]] })],
  // 2~3월
  [/(\d{1,2})\s*[~∼-]\s*(\d{1,2})월/, (m) => ({ a: [+m[1], null], b: [+m[2], null] })],
  // 4.15~5.10
  [/(\d{1,2})\.\s?(\d{1,2})\.?\s*[~∼-]\s*(\d{1,2})\.\s?(\d{1,2})/, (m) => ({ a: [+m[1], +m[2] <= 10 ? '상순' : +m[2] <= 20 ? '중순' : '하순'], b: [+m[3], +m[4] <= 10 ? '상순' : +m[4] <= 20 ? '중순' : '하순'] })],
  // 6월 초순 / 5월
  [new RegExp(`(\\d{1,2})월\\s*${X}?`), (m) => ({ a: [+m[1], m[2]], b: [+m[1], m[2]] })],
];
const RELATIVE = /이후|이전|부터|까지|한계|년차|년째|일령|주령|개월|일\s*(전|후|째|경|이내)|직후|직전|\d\s*일간|기준|다름|확인 필요/;
function parsePeriod(seg) {
  if (RELATIVE.test(seg)) return null;
  for (const [re, f] of RE) {
    const m = seg.match(re);
    if (!m) continue;
    const { a, b } = f(m);
    if (!(a[0] >= 1 && a[0] <= 12 && b[0] >= 1 && b[0] <= 12)) return null;
    const pa = a[1] ? XP[a[1]][0] : null;
    const pb = b[1] ? XP[b[1]][1] : null;
    return { start: { m: a[0], p: pa }, end: { m: b[0], p: pb }, text: m[0].trim(), label: seg.slice(0, m.index).replace(/[:：,·\s(]+$/, '').trim() };
  }
  return null;
}
function parseTiming(text) {
  const out = [];
  for (const part of String(text).split(/\s*\/\s*/)) {
    let group = '';
    for (const seg of part.split(/\s*,\s*/)) {
      const g = seg.match(/^([^:：]{1,14})[:：]\s*/);
      if (g) group = g[1].trim();
      const p = parsePeriod(g ? seg.slice(g[0].length) : seg);
      if (!p) continue;
      p.label = [group, p.label].filter(Boolean).join(' ').slice(0, 24);
      out.push(p);
    }
  }
  return out.slice(0, 6);
}
const KW = [[/씨뿌|파종|직파|접종/, 'sow'], [/모\s?기르|육묘|모판|못자리|가식|옮겨/, 'nursery'], [/아주심|정식|이앙|모내기|심기|심는|삽식/, 'plant'], [/수확|출하|거두|따기|캐기|베기|채취/, 'harvest'], [/거름|비료|시비|추비/, 'fert'], [/방제|소독|약제|병해|해충/, 'pest']];
const kindOf = (t) => (KW.find(([re]) => re.test(t)) || [, 'manage'])[1];
const norm = (t) => String(t).replace(/[\s·,()（）]/g, '');
function backfill(c) {
  let added = 0;
  // 1) 일정 항목 자신의 문구
  for (const s of c.schedule) {
    if (s.start || !s.text) continue;
    const ps = parseTiming(s.text);
    if (ps.length === 1 && !ps[0].label) { s.start = ps[0].start; s.end = ps[0].end; s.est = true; added++; }
  }
  // 2) 단계별 작업의 시기 문구
  for (const st of c.stages) {
    if (!st.timing) continue;
    const ps = parseTiming(st.timing);
    if (!ps.length) continue;
    const key = norm(st.title);
    if (c.schedule.some((s) => s.start && !s.est && (norm(s.task).includes(key) || key.includes(norm(s.task))))) continue; // 원문 표에 이미 날짜가 있는 작업
    const undated = c.schedule.find((s) => !s.start && norm(s.task) === key);
    if (undated && ps.length === 1) { Object.assign(undated, { start: ps[0].start, end: ps[0].end, est: true, text: undated.text || st.timing }); added++; continue; }
    for (const p of ps) {
      const task = p.label ? `${st.title} (${p.label})` : st.title;
      if (c.schedule.some((s) => s.start && norm(s.task) === norm(task))) continue;
      c.schedule.push({ task, kind: kindOf(st.title), region: null, start: p.start, end: p.end, text: p.text, est: true });
      added++;
    }
  }
  // 3) 병해충 발생 시기 문구 → "○○ 주의"
  for (const pz of c.pests) {
    if (!pz.timing) continue;
    const ps = parseTiming(pz.timing);
    if (ps.length !== 1) continue;
    const task = `${pz.name} 주의`;
    if (c.schedule.some((s) => norm(s.task) === norm(task))) continue;
    c.schedule.push({ task, kind: 'pest', region: null, start: ps[0].start, end: ps[0].end, text: pz.timing, est: true });
    added++;
  }
  return added;
}
const warn = [];
let estTotal = 0;
const crops = [];
for (const f of readdirSync(join(root, 'crops')).filter((f) => f.endsWith('.json')).sort()) {
  let c;
  try { c = JSON.parse(readFileSync(join(root, 'crops', f), 'utf8')); } catch (e) { warn.push(`${f}: JSON 오류 ${e.message}`); continue; }
  if (!str(c.name)) { warn.push(`${f}: name 없음`); continue; }
  const id = Number(f.replace('.json', ''));
  const cat = CATS.includes(c.category) ? c.category : (warn.push(`${f}: 분류 '${c.category}' → 기타`), '기타');
  const fert = c.fertilizer && arr(c.fertilizer.rows).length ? {
    unit: str(c.fertilizer.unit) || '', columns: arr(c.fertilizer.columns).map(String),
    rows: arr(c.fertilizer.rows).map((r) => ({ name: String(r.name), values: arr(r.values).map((v) => (v === '' ? null : v)) })),
    note: str(c.fertilizer.note),
  } : null;
  const crop = {
    id, name: str(c.name), type: str(c.type), category: cat, sciName: str(c.sciName), family: str(c.family), summary: str(c.summary),
    env: arr(c.env).filter((e) => str(e?.label) && str(e?.value)).map((e) => ({ label: str(e.label), value: str(e.value) })),
    schedule: arr(c.schedule).filter((s) => str(s?.task)).map((s) => {
      const start = pt(s.start);
      return { task: str(s.task), kind: KINDS.includes(s.kind) ? s.kind : 'etc', region: str(s.region), start, end: start ? pt(s.end) : null, text: str(s.text) };
    }),
    stages: arr(c.stages).filter((s) => str(s?.title)).map((s) => ({ title: str(s.title), timing: str(s.timing), items: arr(s.items).filter((i) => str(i?.label)).map((i) => ({ label: str(i.label), value: str(i.value) || '' })) })),
    fertilizer: fert,
    pests: arr(c.pests).filter((p) => str(p?.name)).map((p) => ({ name: str(p.name), kind: str(p.kind), timing: str(p.timing), control: str(p.control) })),
    disasters: arr(c.disasters).filter((d) => str(d?.risk)).map((d) => ({ risk: str(d.risk), timing: str(d.timing), measures: arr(d.measures).map(String) })),
    // 수집 과정 메모(스키마·추출 관련)는 화면에 내지 않고 dataNotes 로 분리
    notes: arr(c.notes).map(String).filter((n) => !META.test(n)),
    dataNotes: arr(c.notes).map(String).filter((n) => META.test(n)),
    source: `https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=${id}`,
  };
  // 내용이 하나도 없는 페이지(제목과 그림뿐)는 싣지 않는다
  if (!crop.schedule.length && !crop.stages.length && !crop.fertilizer && !crop.pests.length && !crop.disasters.length && !crop.env.length) { warn.push(`${f}: 내용 없음 → 제외`); continue; }
  estTotal += backfill(crop);
  crops.push(crop);
}
crops.sort((a, b) => a.name.localeCompare(b.name, 'ko') || (a.type || '').localeCompare(b.type || '', 'ko'));
writeFileSync(join(root, 'crops.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: '농촌진흥청 농사로 농작업일정', crops }));
console.log(`작목 ${crops.length}개 → data/crops.json (본문 시기 문구로 보완한 일정 ${estTotal}건)`);
if (warn.length) console.log('경고:\n' + warn.join('\n'));
