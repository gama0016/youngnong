// 농사로 Open API(농작업일정)에서 원자료를 받아 data/raw/ 에 저장한다.
//   NONGSARO_API_KEY=발급받은키 node scripts/fetch-nongsaro.mjs
// 키는 농사로(www.nongsaro.go.kr)에서 Open API 신청 후 발급받는다. 키는 어떤 파일에도 기록하지 않는다.
//
// 호출 순서 (서비스: farmWorkingPlanNew)
//   workScheduleGrpList                       분류 목록 (codeNm, kidofcomdtySeCode)
//   workScheduleLst?kidofcomdtySeCode=        분류별 작목 목록 (cntntsNo, sj, 첨부파일)
//   workScheduleDtl?cntntsNo=                 작목 농작업일정 본문 (cn: HTML)
//   workScheduleEraInfoLst?cntntsNo=          작형 정보 (htmlCn: HTML)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = (process.env.NONGSARO_API_KEY || '').trim();
const BASE = process.env.NONGSARO_BASE || 'http://api.nongsaro.go.kr/service/farmWorkingPlanNew'; // 이 API는 http 로만 응답한다
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'raw');
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean); // 시험용: 특정 cntntsNo 만

if (!KEY) {
  console.error('NONGSARO_API_KEY 가 없습니다. 농사로 Open API 인증키를 환경변수로 넣어 주세요.');
  process.exit(2);
}

const hide = (s) => String(s).split(KEY).join('***'); // 응답에 키가 되돌아와도 저장·출력하지 않는다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// 단순한 농사로 응답 XML(header + body/items/item)만 다룬다
function parse(xml) {
  const tag = (src, name) => { const m = src.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1].trim()) : null; };
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const o = {};
    for (const f of m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) o[f[1]] = decode(f[2].trim());
    for (const f of m[1].matchAll(/<(\w+)\s*\/>/g)) o[f[1]] = '';
    return o;
  });
  return {
    code: tag(xml, 'resultCode'),
    msg: tag(xml, 'resultMsg'),
    total: Number(tag(xml, 'totalCount')) || null,
    items,
  };
}

let calls = 0;
const samples = {};
async function call(op, params = {}) {
  const qs = new URLSearchParams({ apiKey: KEY, ...params });
  const url = `${BASE}/${op}?${qs}`;
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      calls++;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = parse(text);
      if (r.code && !/^0+$/.test(r.code)) {
        const e = new Error(`농사로 API 오류 ${r.code}: ${hide(r.msg || '')}`);
        e.fatal = ['11', '12', '20', '30', '31', '32', '33'].includes(r.code); // 키·서비스 문제는 다시 시도해도 같다
        throw e;
      }
      if (!samples[op]) samples[op] = hide(text).slice(0, 20000);
      await sleep(250); // 서버에 부담을 주지 않도록 천천히
      return r;
    } catch (e) {
      last = e;
      if (e.fatal) break;
      await sleep(1000 * attempt * attempt);
    }
  }
  throw new Error(`${op} ${hide(JSON.stringify(params))} 실패: ${hide(last?.message || last)}`);
}
async function callAll(op, params) {
  const rows = 100;
  const first = await call(op, { ...params, numOfRows: rows, pageNo: 1 });
  const items = [...first.items];
  const pages = first.total ? Math.ceil(first.total / rows) : 1;
  for (let p = 2; p <= pages; p++) items.push(...(await call(op, { ...params, numOfRows: rows, pageNo: p })).items);
  return items;
}
const save = (rel, obj) => { const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, hide(JSON.stringify(obj, null, 1)) + '\n'); };

const t0 = Date.now();
const groups = await callAll('workScheduleGrpList');
console.log(`분류 ${groups.length}개: ${groups.map((g) => g.codeNm).join(', ')}`);
const index = [];
const failed = [];
for (const g of groups) {
  const list = await callAll('workScheduleLst', { kidofcomdtySeCode: g.kidofcomdtySeCode });
  console.log(`- ${g.codeNm}: 작목 ${list.length}개`);
  for (const it of list) {
    const id = String(it.cntntsNo || '').trim();
    if (!id || (ONLY.length && !ONLY.includes(id))) continue;
    try {
      const dtl = await call('workScheduleDtl', { cntntsNo: id });
      let era = [];
      try { era = (await call('workScheduleEraInfoLst', { cntntsNo: id })).items; } catch (e) { console.warn(`  작형 정보 없음 ${id}: ${e.message}`); }
      const d = dtl.items[0] || {};
      save(`dtl/${id}.json`, {
        cntntsNo: id,
        title: it.sj || d.cntntsSj || '',
        group: g.codeNm,
        groupCode: g.kidofcomdtySeCode,
        groupName: d.kidofcomdtySeCodeNm || null,
        list: it,          // 목록 항목 그대로 (첨부파일 정보 포함)
        detail: d,         // cn: 농작업일정 본문 HTML
        era: era.map((e) => e.htmlCn ?? e), // 작형 정보 HTML
      });
      index.push({ cntntsNo: id, title: it.sj || d.cntntsSj || '', group: g.codeNm });
    } catch (e) {
      failed.push({ cntntsNo: id, title: it.sj, error: e.message });
      console.warn(`  실패 ${id} ${it.sj}: ${e.message}`);
    }
  }
}
save('index.json', { fetchedAt: new Date().toISOString(), groups: groups.map((g) => ({ code: g.kidofcomdtySeCode, name: g.codeNm, sort: g.sort })), crops: index, failed });
for (const [op, xml] of Object.entries(samples)) { mkdirSync(join(OUT, 'samples'), { recursive: true }); writeFileSync(join(OUT, 'samples', `${op}.xml`), xml); }
console.log(`작목 ${index.length}개 저장, 실패 ${failed.length}개, API 호출 ${calls}회, ${Math.round((Date.now() - t0) / 1000)}초`);
if (!index.length) process.exit(1);
