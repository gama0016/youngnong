// 농사로 「작목별병해충」(menuId=PS00202)에서 내 작목의 병·해충 상세(발생환경·증상·생태·피해·방제방법·사진)를 받아
//   data/pests/index.json        작목 이름 → 농사로 작목 코드, 우리 작목 id → 코드
//   data/pests/<작목코드>.json   그 작목의 병·해충 상세(원문 그대로, 줄바꿈만 정리)
// 로 저장한다. 사이트 HTML을 읽는 방식이라 농사로에 닿는 곳(GitHub Actions)에서 돌린다. 원문을 고치거나 보태지 않는다.
// MODE=probe 이면 구조 확인용 원본 HTML 몇 장만 data/pests-raw/ 에 저장한다. ONLY=VC011205,FC010101 처럼 일부만 받을 수 있다.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const BASE = 'https://www.nongsaro.go.kr/portal/ps/pss/pssa';
const UA = 'Mozilla/5.0 (compatible; youngnong-data/1.0; +https://leafnote.kr/nong/)';
const TABS = { FC: '식량작물', FT: '과수', FL: '화훼', VC: '채소', IC: '특용작물' };
const DELAY = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (r.ok) { await sleep(DELAY); return await r.text(); }
      console.log('HTTP', r.status, url);
    } catch (e) { console.log('ERR', e.message, url); }
    await sleep(2000 * (i + 1));
  }
  return null;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', '#39': "'" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
const text = (html) => decode(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ''))
  .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');

const MODE = process.env.MODE || 'full';
if (MODE === 'probe') {
  await mkdir('data/pests-raw', { recursive: true });
  const h = await get(`${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=VC&sKidofcomdtyCode=VC011205`);
  if (h) await writeFile('data/pests-raw/list-vc-gochu.html', h);
  process.exit(0);
}

// 우리 작목 이름 → 비교용 후보 이름들. "토마토·방울토마토" → 토마토, 방울토마토 / "길경(도라지)" → 길경, 도라지
const norm = (s) => String(s).replace(/\s+/g, '');
function candidates(name) {
  const out = new Set();
  const base = name.replace(/\(.*?\)/g, '');
  out.add(norm(name)); out.add(norm(base));
  for (const m of name.matchAll(/\(([^)]*)\)/g)) for (const x of m[1].split(/[,·]/)) out.add(norm(x));
  for (const x of base.split('·')) out.add(norm(x));
  return [...out].filter((x) => x.length >= 1);
}
const bundle = JSON.parse(await readFile('data/crops.json', 'utf8'));
const ours = (bundle.crops || bundle).map((c) => ({ id: c.id, name: c.name, cands: candidates(c.name) }));

// 1) 분류 탭마다 작목 목록
const kcrops = [];
for (const [tab, tabName] of Object.entries(TABS)) {
  const h = await get(`${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=${tab}`);
  if (!h) { console.log('목록 실패', tab); continue; }
  for (const m of h.matchAll(/fncSearch\('(\w+)'\)[^>]*>([^<]*)</g)) kcrops.push({ code: m[1], name: decode(m[2]).trim(), tab, tabName });
}
console.log('농사로 작목', kcrops.length);
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const byCrop = {};
const want = new Map();
for (const o of ours) {
  const hits = kcrops.filter((k) => o.cands.includes(norm(k.name)));
  if (!hits.length) continue;
  byCrop[o.id] = [...new Set(hits.map((k) => k.code))];
  for (const k of hits) if (!only.length || only.includes(k.code)) want.set(k.code, k);
}
console.log('맞는 작목', want.size, '/ 우리 작목', ours.length, '중', Object.keys(byCrop).length);

// 2) 작목별 목록 → 3) 상세
const detailCache = new Map();
function parseDetail(h, code) {
  const title = (h.match(/<meta name="title" content="([^"]*)"/) || h.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1] || '';
  const t = text(title).replace(/\n/g, ' ').trim();
  const name = t.replace(/\s*\(.*$/, '').trim();
  const latin = (t.match(/\((.*)\)\s*$/) || [])[1] || '';
  const sections = [];
  const box = h.slice(h.indexOf('info_pest'), h.indexOf('사진정보') > 0 ? h.indexOf('사진정보') : undefined);
  for (const m of box.matchAll(/<strong>([^<]+)<\/strong>\s*<p>([\s\S]*?)<\/p>/g)) {
    const head = text(m[1]);
    const body = text(m[2]);
    if (head && body) sections.push([head, body]);
  }
  const photos = [];
  const pz = h.slice(h.indexOf('사진정보'));
  for (const m of pz.matchAll(/<img src="(https:\/\/ncpms\.rda\.go\.kr\/[^"]+)"[^>]*?alt="([^"]*)"/g)) {
    if (photos.length >= 6) break;
    photos.push({ src: decode(m[1]), cap: decode(m[2]).trim() });
  }
  return { code, kind: code[0] === 'H' ? '해충' : '병', name, latin, sections, photos };
}
await mkdir('data/pests', { recursive: true });
const index = { source: '농촌진흥청 농사로 「작목별병해충」 (https://www.nongsaro.go.kr/portal/ps/pss/pssa/photoSearchLst.ps?menuId=PS00202) · 사진: 국가농작물병해충관리시스템', fetched: new Date().toISOString().slice(0, 10), crops: {}, byCrop };
let nItems = 0;
for (const k of want.values()) {
  const h = await get(`${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=${k.tab}&sKidofcomdtyCode=${k.code}`);
  if (!h) continue;
  const codes = [...new Set([...h.matchAll(/fncDetail\('([DH]\d+)'\)/g)].map((m) => m[1]))];
  const items = [];
  for (const code of codes) {
    if (!detailCache.has(code)) {
      const url = code[0] === 'H' ? `${BASE}/hlsctSearchDtl.ps?menuId=PS00202&hlsctCode=${code}` : `${BASE}/sicknsSearchDtl.ps?menuId=PS00202&sicknsCode=${code}`;
      const d = await get(url);
      detailCache.set(code, d ? parseDetail(d, code) : null);
    }
    const it = detailCache.get(code);
    if (it && it.name) items.push(it);
  }
  nItems += items.length;
  index.crops[k.code] = { name: k.name, tab: k.tabName, n: items.length };
  await writeFile(`data/pests/${k.code}.json`, JSON.stringify({ code: k.code, name: k.name, tab: k.tabName, items }));
  console.log(k.code, k.name, items.length);
}
await writeFile('data/pests/index.json', JSON.stringify(index, null, 1));
await rm('data/pests-raw', { recursive: true, force: true });
console.log('끝: 작목', Object.keys(index.crops).length, '항목', nItems);
