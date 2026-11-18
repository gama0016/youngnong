// 잘못된 내용 알리기 · 건의하기 (2026-11-17)
//
// 로그인 없이 보낸다. 사진·정보가 틀렸거나 건의·제안이 있을 때 쓰는 창구다.
// 받는 곳은 리프노트의 접수 API(POST /api/reports, site: 'nong')이고,
// 보낸 글과 보고 있던 화면만 저장한다 — 누가 보냈는지(IP·기기)와 내 농사 기록은 보내지 않는다.
//
// 유형 값(photo·info·suggestion·other)과 글자 수 상한, 숨은 칸 이름(website)은
// 리프노트 src/lib/reports.ts 와 맞춘 것이다. 한쪽을 바꾸면 다른 쪽도 같이 바꾼다.
// app.js 와 따로 돈다 — 이 파일이 깨져도 영농노트 본체에는 영향이 없다.

const LEAF_ORIGIN = 'https://leafnote.kr';
// 리프노트가 내보낸 화면(leafnote.kr/nong)에서는 같은 주소로, 옛 주소(github.io)에서는 리프노트로 보낸다
const ENDPOINT = location.origin === LEAF_ORIGIN ? '/api/reports' : `${LEAF_ORIGIN}/api/reports`;
const SITE = 'nong';
const MIN = 5;
const MAX = 1000;
const KINDS = [
  ['photo', '사진이 잘못됐습니다'],
  ['info', '정보·수치가 잘못됐습니다'],
  ['suggestion', '건의·제안이 있습니다'],
  ['other', '그 밖의 문제'],
];

const openBtn = document.getElementById('report-open');
let dialog = null;

/** 지금 보고 있는 화면 — 해시 경로와 제목. 일지·내 농사에 적은 내용은 넣지 않는다 */
function where() {
  const path = (location.hash || '#/').split('?')[0];
  const h1 = document.querySelector('#app h1');
  const title = h1 ? h1.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return { path, title };
}

function build() {
  const d = document.createElement('dialog');
  d.className = 'rp';
  d.setAttribute('aria-labelledby', 'rp-title');
  d.innerHTML = `
    <form class="rp-form" novalidate>
      <h2 id="rp-title">잘못된 내용 알리기 · 건의하기</h2>
      <p class="rp-lead">로그인 없이 보낼 수 있습니다. 확인해서 고치겠습니다.</p>
      <fieldset class="rp-kinds">
        <legend>무엇을 알려 주시나요?</legend>
        ${KINDS.map(([v, label], i) => `<label class="rp-kind"><input type="radio" name="kind" value="${v}"${i === 0 ? ' checked' : ''}><span>${label}</span></label>`).join('')}
      </fieldset>
      <p class="rp-where" data-rp-where></p>
      <label class="f" for="rp-message">내용
        <textarea id="rp-message" name="message" rows="5" required minlength="${MIN}" maxlength="${MAX}" placeholder="어디가 어떻게 다른지, 또는 무엇을 바라는지 적어 주세요. 예) 고추 정식 시기가 우리 지역과 다릅니다."></textarea>
      </label>
      <p class="rp-count"><span data-rp-count>0</span> / ${MAX}자</p>
      <div class="rp-hp" aria-hidden="true"><label>이 칸은 비워 두세요<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="rp-note">이름·전화번호 같은 개인정보는 적지 말아 주세요. 답장은 드리지 않습니다. 보낸 글과 보고 있던 화면 이름만 저장하고, 누가 보냈는지와 내 농사 기록은 저장하지 않습니다.</p>
      <div class="rp-actions">
        <button type="submit" class="btn primary" data-rp-submit>보내기</button>
        <button type="button" class="btn quiet" data-rp-close>닫기</button>
      </div>
      <p class="rp-status" role="status" aria-live="polite" data-rp-status></p>
    </form>`;
  document.body.appendChild(d);

  const form = d.querySelector('form');
  const textarea = d.querySelector('textarea');
  const count = d.querySelector('[data-rp-count]');
  const status = d.querySelector('[data-rp-status]');
  const submit = d.querySelector('[data-rp-submit]');
  const say = (text, kind = '') => { status.textContent = text; status.className = `rp-status${kind ? ` is-${kind}` : ''}`; };

  textarea.addEventListener('input', () => { count.textContent = String(textarea.value.length); });
  // 바깥(어두운 배경)을 누르면 닫는다 — dialog 자신이 눌린 경우가 배경이다
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-rp-close]')) d.close(); });
  d.addEventListener('close', () => openBtn.focus());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    if (message.length < MIN) { say(`조금 더 자세히 적어 주세요(${MIN}자 이상).`, 'error'); textarea.focus(); return; }
    const w = where();
    const body = {
      site: SITE,
      kind: form.elements.kind.value || 'other',
      message: message.slice(0, MAX),
      pagePath: `${w.path}${w.title ? ` · ${w.title}` : ''}`.slice(0, 300),
      website: form.elements.website.value,
    };
    submit.disabled = true;
    say('보내는 중입니다…');
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        say('보냈습니다. 알려 주셔서 고맙습니다.', 'ok');
        form.reset(); count.textContent = '0';
        setTimeout(() => { if (d.open) d.close(); }, 1800);
      } else if (res.status === 429) {
        say('지금 접수가 몰려 있습니다. 잠시 뒤 다시 보내 주세요.', 'error');
      } else {
        say('보내지 못했습니다. 내용을 확인하고 다시 시도해 주세요.', 'error');
      }
    } catch {
      say('통신이 되지 않아 보내지 못했습니다. 적은 글은 그대로 두었으니 잠시 뒤 다시 눌러 주세요.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  d.rpOpen = () => {
    const w = where();
    d.querySelector('[data-rp-where]').textContent = `보고 있던 화면: ${w.title || '첫 화면'}`;
    say('');
    d.showModal();
    textarea.focus();
  };
  return d;
}

if (openBtn) {
  openBtn.addEventListener('click', () => {
    if (!dialog) dialog = build();
    dialog.rpOpen();
  });
}
