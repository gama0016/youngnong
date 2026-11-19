// 농사로 「농산물소득정보」(농촌진흥청 농산물소득조사, 10a당 총수입·수량·가격·경영비·소득)를 받아 data/income.json 으로 저장한다.
// 사이트 HTML/조회 응답을 읽는 방식이라 농사로에 닿는 곳(GitHub Actions)에서 돌린다. 값은 원문 그대로 옮긴다.
// MODE=probe 이면 구조 확인용 원본만 data/income-raw/ 에 저장한다.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const BASE = 'https://www.nongsaro.go.kr/portal/ps/psb/psbf';
const UA = 'Mozilla/5.0 (compatible; youngnong-data/1.0; +https://leafnote.kr/nong/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, opt = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { ...opt, headers: { 'user-agent': UA, ...(opt.headers || {}) } });
      const t = await r.text();
      console.log(r.status, t.length, url.slice(0, 160));
      await sleep(500);
      if (r.ok) return t;
    } catch (e) { console.log('ERR', e.message, url); }
    await sleep(2000 * (i + 1));
  }
  return null;
}
const MODE = process.env.MODE || 'full';
if (MODE === 'probe') {
  await mkdir('data/income-raw', { recursive: true });
  const pages = {
    list: `${BASE}/agricultIncomeInfoLst.ps?menuId=PS65441`,
  };
  for (const [k, u] of Object.entries(pages)) { const h = await get(u); if (h) await writeFile(`data/income-raw/${k}.html`, h); }
  // 페이지가 부르는 스크립트(조회 주소를 찾기 위해)
  const h = await get(pages.list);
  const srcs = [...(h || '').matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/jquery|common|lib|vendor|swiper|gtag|google/i.test(s)).slice(0, 8);
  let i = 0;
  for (const s of srcs) { const u = s.startsWith('http') ? s : `https://www.nongsaro.go.kr${s}`; const t = await get(u); if (t) await writeFile(`data/income-raw/script${i++}.js`, t); }
}

if (MODE === 'full') {
  const json = async (u) => { const t = await get(u, { headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } }); try { return JSON.parse(t); } catch { console.log('JSON 아님', u); return null; } };
  const AREA = '697001'; // 전국
  const uppers = (await json(`${BASE}/selectCsfcCodeLst.ps?codeGroup=696&topCode=true&orderCode=ordr&csfcCode=upper`))?.resultCodeList || [];
  console.log('대분류', uppers.map((u) => `${u.code}:${u.codeNm}`).join(', '));
  const num = (s) => { const v = Number(String(s).replace(/[^\d.-]/g, '')); return Number.isFinite(v) && String(s).trim() !== '' && String(s).trim() !== '-' ? v : null; };
  const cell = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const out = [];
  for (const up of uppers) {
    const lowers = (await json(`${BASE}/selectCsfcCodeLst.ps?upperCode=${up.code}&csfcCode=lower`))?.resultCodeList || [];
    for (const lo of lowers) {
      const years = ((await json(`${BASE}/selectSearchYearLst.ps?areaCode=${AREA}&orderCode=desc&lowerCode=${lo.code}`))?.resultCodeList || []).map((y) => String(y.YEAR)).slice(0, 3);
      const rows = [];
      for (const y of years) {
        const h = await get(`${BASE}/agricultIncomeInfoLst.ps?menuId=PS65441&areaCode=${AREA}&upperCode=${up.code}&lowerCode=${lo.code}&year=${y}&srchInfo=AVRG_INCOME`);
        if (!h) continue;
        const tb = (h.match(/<caption>\s*<strong>작물 경영성과 상세<\/strong>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/) || [])[1] || '';
        for (const tr of tb.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
          const c = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => cell(m[1]));
          if (c.length >= 7 && c[1] === '전국') rows.push({ year: Number(c[0]), revenue: num(c[2]), yieldKg: num(c[3]), price: num(c[4]), cost: num(c[5]), income: num(c[6]) });
        }
        const unit = (h.match(/<span class="t1">([^<]*)<\/span>/) || [])[1];
        if (unit && !lo.unit) lo.unit = unit;
      }
      const uniq = [...new Map(rows.map((r) => [r.year, r])).values()].sort((a, b) => b.year - a.year);
      if (!uniq.length) { console.log('자료 없음', lo.code, lo.codeNm); continue; }
      const unit = lo.code === '696071' ? '4년1기작/10a' : up.code === '696004' || up.code === '696005' ? '연/10a' : '년1기작/10a';
      out.push({ code: lo.code, name: String(lo.codeNm).trim(), group: String(up.codeNm).trim(), unit, years: uniq });
      console.log(lo.code, lo.codeNm, uniq.map((r) => `${r.year}:${r.price}원/kg`).join(' '));
    }
  }
  const sig = new Set(out.map((o) => JSON.stringify(o.years[0])));
  if (out.length > 5 && sig.size < out.length / 2) { console.log('작목마다 같은 값이 나와 조회가 잘못된 것으로 보고 멈춘다'); process.exit(1); }
  // 우리 작목과 이름 맞추기(괄호 앞 이름). 같은 작물의 다른 이름만 잇는다.
  const norm = (s) => String(s).replace(/\s+/g, '');
  const head = (s) => norm(String(s).replace(/\(.*$/, ''));
  const ALIAS = { 벼: ['논벼', '쌀', '벼'], '토마토·방울토마토': ['토마토', '방울토마토'], '한라봉(부지화)': ['감귤', '만감류', '부지화', '한라봉'], 단감: ['단감', '감'], 참다래: ['참다래', '키위'], 일반보리: ['보리', '겉보리', '쌀보리'], 맥주보리: ['맥주보리', '보리'], 결구상추: ['상추'], '길경(도라지)': ['도라지'], '더덕(양유)': ['더덕'], '산약(마)': ['마'], '양앵두(체리)': ['체리'], '셀러리(양미나리)': ['셀러리'], '감귤(노지재배)': ['감귤'], '감귤(시설재배)': ['감귤'], 풋콩: ['콩'], '들깨(종실)': ['들깨'], '들깨(잎)': ['들깨잎', '깻잎'] };
  const bundle = JSON.parse(await readFile('data/crops.json', 'utf8'));
  const byCrop = {};
  for (const c of bundle.crops || bundle) {
    const cands = new Set([norm(c.name), head(c.name), ...(ALIAS[c.name] || []).map(norm)]);
    for (const x of String(c.name).replace(/\(.*?\)/g, '').split('·')) cands.add(norm(x));
    const hit = out.filter((o) => cands.has(head(o.name)) || cands.has(norm(o.name)));
    if (hit.length) byCrop[c.id] = hit.map((o) => o.code);
  }
  await writeFile('data/income.json', JSON.stringify({
    source: '농촌진흥청 농산물소득조사 — 농사로 「농산물소득정보」 (https://www.nongsaro.go.kr/portal/ps/psb/psbf/agricultIncomeInfoLst.ps?menuId=PS65441), 전국 평균, 10a당',
    note: '총수입 = 수량 × 가격(농가 판매가 기준) + 부산물, 경영비 = 생산에 들어간 비용(자가노동비 제외), 소득 = 총수입 − 경영비',
    fetched: new Date().toISOString().slice(0, 10), crops: out, byCrop,
  }, null, 1));
  await rm('data/income-raw', { recursive: true, force: true });
  console.log('끝: 소득자료', out.length, '우리 작목 연결', Object.keys(byCrop).length);
}
