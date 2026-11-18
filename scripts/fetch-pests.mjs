// 농사로 「작목별병해충」(menuId=PS00202)에서 작목별 병·해충 상세(증상·발생환경·방제방법·사진)를 받아
// data/pests/<작목코드>.json 으로 저장한다. 사이트 HTML을 읽는 방식이라 GitHub Actions 등 농사로에 닿는 곳에서 돌린다.
// MODE=probe 이면 구조 확인용 원본 HTML 몇 장만 data/pests-raw/ 에 저장한다.
import { mkdir, writeFile } from 'node:fs/promises';
const BASE = 'https://www.nongsaro.go.kr/portal/ps/pss/pssa';
const UA = 'Mozilla/5.0 (compatible; youngnong-data/1.0; +https://leafnote.kr/nong/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (r.ok) return await r.text();
      console.log('HTTP', r.status, url);
    } catch (e) { console.log('ERR', e.message, url); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
const MODE = process.env.MODE || 'probe';
if (MODE === 'probe') {
  await mkdir('data/pests-raw', { recursive: true });
  const pages = {
    'list-vc-gochu': `${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=VC&sKidofcomdtyCode=VC011205`,
    'list-vc-gochu-p2': `${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=VC&sKidofcomdtyCode=VC011205&pageIndex=2`,
    'list-fc': `${BASE}/photoSearchLst.ps?menuId=PS00202&sKidofcomdtyTabCode=FC`,
    'list-root': `${BASE}/photoSearchLst.ps?menuId=PS00202`,
    'dtl-sickns': `${BASE}/sicknsSearchDtl.ps?menuId=PS00202&sicknsCode=D00000195`,
    'dtl-hlsct': `${BASE}/hlsctSearchDtl.ps?hlsctCode=H00000379&menuId=PS00202&sKidofcomdtyCode=IC051611&sKidofcomdtyTabCode=IC`,
  };
  for (const [k, u] of Object.entries(pages)) {
    const h = await get(u);
    console.log(k, h ? h.length : 'FAIL');
    if (h) await writeFile(`data/pests-raw/${k}.html`, h);
    await sleep(800);
  }
}
