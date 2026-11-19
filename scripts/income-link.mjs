// 농사로 소득자료 작목(예: "시설딸기(토경)", "노지가을무", "봄감자")을 영농노트 작목(농작업일정)과 잇는다.
// 같은 작물만 잇는다 — 값이 크게 다른 품목(예: 한라봉↔노지감귤)은 잇지 않는다. 단독 실행하면 data/income.json의 byCrop만 다시 만든다.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const norm = (s) => String(s).replace(/\s+/g, '');
// 재배 방식·철 앞말을 뗀 작물 이름: 시설딸기(토경)→딸기, 노지가을무→무, 고랭지배추→배추, 봄감자→감자
export const baseName = (s) => norm(String(s).replace(/\(.*$/, '')).replace(/^(시설|노지)/, '').replace(/^(고랭지|봄|가을|여름|겨울)/, '');
const ALIAS = { 벼: ['논벼', '쌀'], '토마토·방울토마토': ['토마토', '방울토마토'], 일반보리: ['겉보리', '쌀보리', '보리'], 맥주보리: ['맥주보리'], 결구상추: ['상추'], '양앵두(체리)': ['체리'], 풋콩: ['콩'], '들깨(종실)': ['들깨'], 파프리카: ['착색단고추'], 파: ['대파'], 옥수수: ['풋옥수수'], '담근먹이 옥수수': [] };
// 같은 이름이라도 상품이 달라 값이 크게 다른 것: 결구상추(↔잎상추), 단호박·늙은호박(↔애호박), 한라봉(↔노지감귤), 들깻잎(↔들깨 종실)
const BLOCK = new Set(['한라봉(부지화)', '들깨(잎)', '결구상추', '호박(단호박)', '호박(늙은호박)']);
export function linkIncome(crops, incomeCrops) {
  const byCrop = {};
  for (const c of crops) {
    if (BLOCK.has(c.name)) continue;
    const cands = new Set(ALIAS[c.name] ?? [norm(c.name), baseName(c.name), ...String(c.name).replace(/\(.*?\)/g, '').split('·').map(norm)]);
    const hit = incomeCrops.filter((o) => cands.has(baseName(o.name)) || cands.has(norm(String(o.name).replace(/\(.*$/, ''))));
    // 작형이 분명히 시설이거나 노지이면, 반대쪽 자료(시설고추↔노지 건고추처럼 상품이 다름)는 잇지 않는다
    const txt = `${c.name} ${c.type || ''}`;
    const isCov = /시설|하우스|촉성|반촉성|억제|수경|비가림/.test(txt);
    const isOpen = /노지|보통재배|보통기재배|고랭지|직파|전작|답리작/.test(txt);
    const ok = hit.filter((o) => !((isOpen && !isCov && /^시설/.test(o.name)) || (isCov && !isOpen && /^노지/.test(o.name))));
    if (!ok.length) continue;
    // 작형 글에 있는 말(고랭지·봄·가을)과 같은 자료를 앞에, 그다음 시설/노지가 맞는 것
    const score = (o) => (['고랭지', '봄', '가을'].some((w) => txt.includes(w) && o.name.includes(w)) ? 0 : 2) + ((/^시설/.test(o.name) === isCov) ? 0 : 1);
    ok.sort((a, b) => score(a) - score(b));
    byCrop[c.id] = ok.map((o) => o.code);
    continue;
    byCrop[c.id] = hit.map((o) => o.code);
  }
  return byCrop;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = JSON.parse(await readFile('data/crops.json', 'utf8'));
  const inc = JSON.parse(await readFile('data/income.json', 'utf8'));
  inc.byCrop = linkIncome(bundle.crops || bundle, inc.crops);
  await writeFile('data/income.json', JSON.stringify(inc, null, 1));
  console.log('연결', Object.keys(inc.byCrop).length);
}
