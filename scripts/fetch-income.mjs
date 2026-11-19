// 농사로 「농산물소득정보」(농촌진흥청 농산물소득조사, 10a당 총수입·수량·가격·경영비·소득)를 받아 data/income.json 으로 저장한다.
// 사이트 HTML/조회 응답을 읽는 방식이라 농사로에 닿는 곳(GitHub Actions)에서 돌린다. 값은 원문 그대로 옮긴다.
// MODE=probe 이면 구조 확인용 원본만 data/income-raw/ 에 저장한다.
import { mkdir, writeFile } from 'node:fs/promises';
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
const MODE = process.env.MODE === 'full' ? 'probe' : (process.env.MODE || 'probe'); // 전체 받기는 구조 확인 뒤에 만든다
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
