// 실제 브라우저 종단 테스트: 가짜 카메라에 ISBN 바코드를 띄워 스캔 → 등록 → 기록 → 재스캔 → 백업까지 확인합니다.
// 사용법: npm run build && npx vite preview --port 4173 & NODE_PATH=$(npm root -g) node tests/e2e.mjs [스크린샷폴더]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const bwipjs = require('bwip-js');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const SHOTS = process.argv[2];
const ISBN = '9780140328721';

const png = await bwipjs.toBuffer({ bcid: 'ean13', text: ISBN, scale: 4, height: 22, includetext: true, backgroundcolor: 'FFFFFF', paddingwidth: 12, paddingheight: 6 });
// 사진 인식용: 한글책 ISBN 바코드
const KO_ISBN = '9788937460449';
const koPng = await bwipjs.toBuffer({ bcid: 'ean13', text: KO_ISBN, scale: 3, height: 18, includetext: true, backgroundcolor: 'FFFFFF', paddingwidth: 12, paddingheight: 6 });
const barcodeUrl = `data:image/png;base64,${png.toString('base64')}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// 틀린 키 시험에서 나오는 401 응답 로그는 예상된 것이므로 제외합니다.
page.on('console', (m) => m.type() === 'error' && !m.text().includes('status of 401') && errors.push(m.text()));

// 가짜 카메라: 캔버스에 바코드를 그린 스트림을 돌려줍니다.
await page.addInitScript((src) => {
  window.__gumCalls = [];
  navigator.mediaDevices.enumerateDevices = async () => [
    { kind: 'videoinput', deviceId: 'cam-a', label: 'camera2 0, facing back', groupId: '' },
    { kind: 'videoinput', deviceId: 'cam-b', label: 'camera2 2, facing back', groupId: '' },
    { kind: 'videoinput', deviceId: 'cam-f', label: 'camera2 1, facing front', groupId: '' },
  ];
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.__gumCalls.push(constraints);
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const g = c.getContext('2d');
    const draw = () => {
      g.fillStyle = '#ddd';
      g.fillRect(0, 0, c.width, c.height);
      if (!window.__noBarcode) g.drawImage(img, (c.width - img.width) / 2, (c.height - img.height) / 2);
      requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(15);
  };
}, barcodeUrl);

// 외부 조회는 고정 응답으로 대체합니다.
await page.route('https://www.googleapis.com/**', (r) =>
  !r.request().url().includes(ISBN) ? r.fulfill({ contentType: 'application/json', body: '{"totalItems":0}' }) : r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ totalItems: 1, items: [{ volumeInfo: { title: 'Fantastic Mr Fox', authors: ['Roald Dahl'], publisher: 'Puffin' } }] }),
  }),
);
await page.route('https://openlibrary.org/**', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
// 카카오: 올바른 키(test-key)일 때만 데미안을 돌려줍니다. 국립중앙도서관: 키 오류.
await page.route('https://dapi.kakao.com/**', (r) =>
  r.request().headers().authorization === 'KakaoAK test-key'
    ? r.fulfill({
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ documents: [{ title: '데미안', authors: ['헤르만 헤세'], publisher: '민음사', thumbnail: '' }] }),
      })
    : r.fulfill({ status: 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }),
);
await page.route('https://www.nl.go.kr/**', (r) =>
  r.fulfill({
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ RESULT: 'ERROR', ERR_MESSAGE: '유효하지 않은 인증키 값입니다.' }),
  }),
);

const sheet = page.locator('.sheet');
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const step = (s) => console.log('✓', s);
async function expectCount(locator, n, msg) {
  for (let i = 0; i < 50; i++) {
    if ((await locator.count()) === n) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`${msg}: ${n}건이어야 하는데 ${await locator.count()}건`);
}

await page.goto(BASE);
await page.getByText('먼저 아이를 등록해 주세요').waitFor();
await shot('01-onboarding');
await page.getByLabel('이름').fill('하윤');
await page.getByLabel('출생연도').fill('2018');
await page.getByRole('button', { name: '추가' }).click();
await page.getByRole('heading', { name: '오늘의 독서' }).waitFor();
step('첫 아이 등록 → 홈');

await page.locator('a.nav-item', { hasText: '설정' }).click();
await page.getByRole('button', { name: '+ 아이 추가' }).click();
await page.getByLabel('이름').fill('도윤');
await page.getByRole('button', { name: '추가' }).click();
await page.getByText('도윤').waitFor();
await page.getByText('초2').waitFor();
step('둘째 추가, 학년 표시(2018년생=초2)');

await page.locator('a.nav-item', { hasText: '오늘' }).click();
await page.getByRole('button', { name: '바코드 찍고 기록하기' }).click();
await page.getByRole('dialog', { name: '바코드 스캔' }).waitFor();
await shot('02-scanner');
await page.getByText('새 책 등록').waitFor({ timeout: 15000 });
await page.getByText('Google Books에서 책 정보를 가져왔습니다').waitFor();
if ((await page.getByLabel('제목 *').inputValue()) !== 'Fantastic Mr Fox') throw new Error('제목 자동 입력 실패');
step('가짜 카메라 바코드 인식 → 책 정보 자동 입력');

await page.getByPlaceholder('예: 2.3').fill('4.1');
await page.getByPlaceholder('예: Oxford Reading Tree').fill('Roald Dahl');
await shot('03-book-form');
await page.getByRole('button', { name: '저장하고 기록하기' }).click();
await page.getByRole('heading', { name: '독서 기록' }).waitFor();

await sheet.getByRole('button', { name: '하윤' }).click();
await sheet.getByRole('button', { name: '도윤' }).click();
await sheet.getByRole('button', { name: '집중듣기', exact: true }).click();
await sheet.getByRole('button', { name: '20분', exact: true }).click();
await page.getByRole('button', { name: '횟수 늘리기' }).click();
await sheet.getByRole('button', { name: '😍 좋아함', exact: true }).click();
await page.getByPlaceholder('예: 따라 말하기를 좋아함').fill('여우 목소리 흉내');
await shot('04-log-form');
await page.getByRole('button', { name: '기록 저장' }).click();
await page.getByText('하윤, 도윤 · 집중듣기 기록했습니다.').waitFor();
step('두 아이 동시 기록 저장');

const rows = page.locator('.log-row');
await expectCount(rows, 2, '오늘 기록');
await page.getByText('최근 읽은 책 · 바로 기록').waitFor();
await shot('05-home');
step('홈에 오늘 기록 2건, 최근 책 표시');

// 같은 책 재스캔 → 등록 없이 바로 기록 화면, 직전 값(집중듣기·20분) 미리 선택
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByRole('heading', { name: '독서 기록' }).waitFor({ timeout: 15000 });
if ((await sheet.getByRole('button', { name: '집중듣기', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('직전 활동이 기본값이 아님');
if ((await sheet.getByRole('button', { name: '20분', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('직전 시간이 기본값이 아님');
step('재스캔 → 바로 기록 화면, 직전 값 기본 선택');
await page.getByRole('button', { name: '닫기' }).click();

// 아이 필터
await page.locator('.chips').first().getByRole('button', { name: '도윤' }).click();
await expectCount(rows, 1, '아이 필터');
step('아이별 필터');

// 기록 수정
await rows.first().click();
await page.getByRole('heading', { name: '기록 수정' }).waitFor();
await sheet.getByRole('button', { name: '30분', exact: true }).click();
await page.getByRole('button', { name: '수정 저장' }).click();
await page.getByText('집중듣기 · 30분').waitFor();
step('기록 수정');

// 책 상세
await page.locator('a.nav-item', { hasText: '책장' }).click();
await page.getByRole('heading', { name: '책장' }).waitFor();
await page.locator('button.book-row', { hasText: 'Fantastic Mr Fox' }).click();
await page.getByText('누적 횟수').waitFor();
await page.getByText('4회').waitFor();
await shot('06-book-detail');
step('책 상세: 누적 4회(2회×2명)');

// 날짜별 기록
await page.locator('a.nav-item', { hasText: '기록' }).click();
await page.getByRole('heading', { name: '날짜별 기록' }).waitFor();
await page.getByRole('button', { name: '전체' }).click();
await page.getByText('2건').waitFor();
await page.getByRole('button', { name: '이전 날' }).click();
await page.getByText('이 날의 기록이 없습니다.').waitFor();
step('날짜 이동');

// 백업
await page.locator('a.nav-item', { hasText: '설정' }).click();
await page.getByRole('heading', { name: '설정' }).waitFor();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 내보내기' }).click()]);
const backup = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
if (backup.logs.length !== 2 || backup.children.length !== 2 || backup.books.length !== 1) throw new Error('백업 내용 오류');
await shot('07-settings');
if (!/^reading-log-backup-\d{8}-\d{4}\.json$/.test(download.suggestedFilename())) throw new Error('백업 파일명 오류: ' + download.suggestedFilename());
step(`백업 파일 ${download.suggestedFilename()}`);

// 바코드 없는 자료 직접 등록 (한글책) - 카메라에 바코드가 보이지 않는 상태
await page.evaluate(() => (window.__noBarcode = true));
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByRole('button', { name: '바코드 없는 책·DVD·음원 직접 등록' }).click();
await page.getByLabel('제목 *').fill('구름빵');
await page.getByRole('button', { name: '한글책' }).click();
await page.getByPlaceholder('예: 초등 1~2학년, 5세 이상').fill('4세 이상');
await page.getByRole('button', { name: '저장하고 기록하기' }).click();
await page.getByRole('heading', { name: '독서 기록' }).waitFor();
if (await sheet.getByRole('button', { name: '집중듣기', exact: true }).count()) throw new Error('한글책에 집중듣기가 보이면 안 됨');
await sheet.getByRole('button', { name: '하윤' }).click();
await sheet.getByRole('button', { name: '읽어주기', exact: true }).click();
await page.getByRole('button', { name: '기록 저장' }).click();
await page.getByText('하윤 · 읽어주기 기록했습니다.').waitFor();
step('바코드 없는 한글책 등록·읽어주기 기록');

// 사진으로 인식: 카메라에 바코드가 안 보이는 상태에서 사진 파일로 인식
await page.getByRole('button', { name: '바코드 스캔' }).click();
{
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '📸 사진으로 인식' }).click()]);
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: koPng });
}
await page.getByText('새 책 등록').waitFor({ timeout: 15000 });
if ((await page.getByText(`ISBN ${KO_ISBN}`).count()) !== 1) throw new Error('사진 인식 ISBN 불일치');
if ((await sheet.getByRole('button', { name: '한글책' }).getAttribute('aria-pressed')) !== 'true') throw new Error('978-89 책은 한글책 기본');
await page.getByText('설정에서 카카오 API 키를 넣어주세요').waitFor();
await page.getByRole('link', { name: /네이버에서 ISBN 검색/ }).waitFor();
await page.getByRole('button', { name: '닫기' }).click();
step('사진으로 인식 → 한글책 기본 선택, 키 없을 때 안내·검색 버튼');

// 바코드가 없는 사진 → 안내 후 다시 시도 가능
await page.getByRole('button', { name: '바코드 스캔' }).click();
const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
{
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '📸 사진으로 인식' }).click()]);
  await chooser.setFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank });
}
await page.getByText('사진에서 바코드를 찾지 못했습니다').waitFor();
await page.getByRole('button', { name: '실시간 스캔 다시 켜기' }).waitFor();
await shot('08-scanner-photo-retry');
await page.getByRole('button', { name: '닫기' }).click();
step('바코드 없는 사진 안내');

// 새로고침 후에도 데이터 유지
await page.reload();
await page.locator('a.nav-item', { hasText: '오늘' }).click();
await page.getByRole('heading', { name: '오늘의 독서' }).waitFor();
await page.getByRole('button', { name: '전체' }).click();
await expectCount(rows, 3, '새로고침 후');
step('새로고침 후 데이터 유지');

// 잘못된 ISBN 직접 입력
await page.evaluate(() => (window.__noBarcode = true));
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByLabel('ISBN 직접 입력').fill('1234567890123');
await page.getByRole('button', { name: '확인', exact: true }).click();
await page.getByText('올바른 ISBN이 아닙니다').waitFor();
step('잘못된 ISBN 안내');

// 카메라: 4K부터 요청, 해상도 표시, 카메라 전환과 기억
await page.getByRole('button', { name: '닫기' }).click({ timeout: 5000 });
await page.evaluate(() => (window.__gumCalls = []));
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByText(/1280×720 · /).waitFor();
const first = await page.evaluate(() => window.__gumCalls[0]);
if (first.video.width.ideal !== 3840) throw new Error('4K를 먼저 요청해야 함: ' + JSON.stringify(first));
await page.getByRole('button', { name: '🔄 카메라 전환' }).click();
await page.waitForFunction(() => window.__gumCalls.some((c) => c.video.deviceId?.exact));
const switched = await page.evaluate(() => window.__gumCalls.at(-1).video.deviceId.exact);
await page.getByRole('button', { name: '닫기' }).click();
await page.evaluate(() => (window.__gumCalls = []));
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByText(/1280×720 · /).waitFor();
const remembered = await page.evaluate(() => window.__gumCalls[0].video.deviceId?.exact);
if (!switched || remembered !== switched) throw new Error(`카메라 기억 실패: ${switched} → ${remembered}`);
await shot('09-scanner-tools');
await page.getByRole('button', { name: '닫기' }).click();
step(`4K 우선 요청·해상도 표시·카메라 전환(${switched}) 기억`);

// 한글책: 설정에서 카카오 키 입력 → 연결 확인 → 한글책 조회
await page.locator('a.nav-item', { hasText: '설정' }).click();
await page.getByLabel('카카오 REST API 키 (추천)').fill('wrong');
await page.getByRole('button', { name: '저장하고 연결 확인' }).click();
await page.getByText('카카오 키가 올바르지 않습니다').waitFor();
await page.getByLabel('카카오 REST API 키 (추천)').fill('test-key');
await page.getByLabel(/국립중앙도서관 인증키/).fill('bad');
await page.getByRole('button', { name: '저장하고 연결 확인' }).click();
await page.getByText('✅ 카카오 연결됨 (시험 조회: 데미안)').waitFor();
await page.getByText('국립중앙도서관: 유효하지 않은 인증키 값입니다.').waitFor();
await shot('10-key-settings');
await page.evaluate(() => (window.__noBarcode = true));
await page.getByRole('button', { name: '바코드 스캔' }).click();
await page.getByLabel('ISBN 직접 입력').fill('9788937460449');
await page.getByRole('button', { name: '확인', exact: true }).click();
await page.getByText('카카오에서 책 정보를 가져왔습니다').waitFor();
if ((await page.getByLabel('제목 *').inputValue()) !== '데미안') throw new Error('한글책 제목 조회 실패');
await page.getByRole('button', { name: '닫기' }).click();
step('카카오 키 확인(틀린 키/맞는 키) → 한글책 자동 조회');

if (errors.length) throw new Error('콘솔 오류:\n' + errors.join('\n'));
console.log('ALL PASSED');
await browser.close();
