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
const warn = [];
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
  crops.push({
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
  });
}
crops.sort((a, b) => a.name.localeCompare(b.name, 'ko') || (a.type || '').localeCompare(b.type || '', 'ko'));
writeFileSync(join(root, 'crops.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: '농촌진흥청 농사로 농작업일정', crops }));
console.log(`작목 ${crops.length}개 → data/crops.json`);
if (warn.length) console.log('경고:\n' + warn.join('\n'));
