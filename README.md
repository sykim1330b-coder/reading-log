# 우리집 독서기록

책 뒷면의 ISBN 바코드를 폰 카메라로 찍어 아이들의 독서 활동(집중듣기·흘려듣기·읽기·읽어주기)을 기록하는 개인용 웹앱(PWA)입니다.
서버나 로그인 없이 **폰 브라우저 안(IndexedDB)** 에만 저장하고, 백업 파일로 보관합니다.

## 1단계(MVP) 기능

- **자녀 프로필 여러 명**: 이름·출생연도(학년 자동 표시)·색상. 화면 위에서 아이별로 걸러 보기
- **바코드 스캔**: 978/979로 시작하는 ISBN만 인식. 카메라를 쓸 수 없으면 ISBN 직접 입력
- **책 정보 자동 조회**: 조회 서버(선택) → Google Books → Open Library 순서로 찾고, 못 찾으면 직접 입력
- **책 등록**: 영어/한글 구분, 시리즈, 유형, 소장 구분, 등급
  - 영어책: AR, Lexile, 우리집 단계 (AR·Lexile 사이트를 ISBN 복사와 함께 열어주는 버튼)
  - 한글책: 권장 학년·연령, 우리집 단계, ISBN 부가기호로 독자대상(아동·청소년 등) 자동 표시(조회 서버 사용 시)
- **바코드 없는 자료**(DVD·음원·오래된 책) 직접 등록
- **활동 기록**: 날짜, 아이(여러 명 동시), 활동 유형, 시간(분), 횟수, 반응(😍🙂😑), 메모
  - 이미 등록된 책을 찍으면 바로 기록 화면이 뜨고, 직전 기록의 활동·시간이 미리 선택됨
- **오늘 화면**: 아이별 오늘 요약, 오늘 기록, 최근 읽은 책에서 바로 기록
- **날짜별 기록**: 날짜를 옮겨 가며 보기, 눌러서 수정·삭제
- **책장·책 상세**: 검색, 영어/한글 필터, 책별 누적 횟수·시간·반응·기록 이력
- **백업**: JSON 내보내기(공유 시트 또는 다운로드)·복원, 7일 이상 백업하지 않으면 홈에 알림

## 폰에서 쓰는 법

1. 배포된 주소(예: `https://sykim1330b-coder.github.io/reading-log/`)를 폰 브라우저로 엽니다.
2. **홈 화면에 추가**합니다.
   - iPhone: Safari → 공유 버튼 → "홈 화면에 추가"
   - Android: Chrome → 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"
3. 처음 스캔할 때 카메라 권한을 허용합니다.

> ⚠️ 기록은 그 폰의 브라우저에만 저장됩니다. iPhone은 홈 화면에 추가하지 않고 Safari 탭으로만 쓰면 오래 쓰지 않을 때 데이터가 지워질 수 있습니다. **설정 → 백업 내보내기**로 정기적으로 카톡·드라이브에 보관하세요.

## 개발

```bash
npm install
npm run dev        # http://localhost:5173 (카메라는 localhost 또는 https에서만 동작)
npm test           # 단위 테스트
npm run build      # dist/ 생성
```

종단 테스트(가짜 카메라에 바코드를 띄워 전체 흐름 확인, Playwright 필요):

```bash
npm run build && npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node tests/e2e.mjs
```

## 배포 (GitHub Pages, 무료)

처음 한 번만 설정합니다.

1. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
2. GitHub 웹에서 **Add file → Create new file**, 파일 이름에 `.github/workflows/deploy.yml` 을 입력하고
   [`deploy/github-pages.yml`](deploy/github-pages.yml) 내용을 그대로 붙여넣은 뒤 **Commit changes**.

이후 `main` 브랜치가 바뀔 때마다 테스트·빌드 후 GitHub Pages에 자동으로 올라갑니다(Actions 탭에서 진행 상황 확인).

## 한글책 조회 서버 (선택, 무료)

Google Books·Open Library는 키 없이 쓸 수 있지만 한글책 정보가 부족합니다.
국립중앙도서관(부가기호 포함)과 카카오 책검색을 쓰려면 `worker/`의 Cloudflare Worker를 배포합니다.
API 키는 Worker 안에만 보관되고, 독서기록 데이터는 Worker로 전송되지 않습니다(ISBN만 보냄).

1. API 키 발급(무료)
   - 국립중앙도서관 ISBN 서지정보: https://www.nl.go.kr/seoji/ → Open API → 인증키 신청
   - 카카오: https://developers.kakao.com → 애플리케이션 추가 → REST API 키
2. Cloudflare 계정을 만든 뒤:
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put NL_CERT_KEY
   npx wrangler secret put KAKAO_REST_KEY
   npx wrangler deploy
   ```
   `wrangler.toml`의 `ALLOWED_ORIGINS`가 앱 주소의 origin(예: `https://sykim1330b-coder.github.io`)과 같아야 합니다.
3. 앱의 **설정 → 책 정보 조회 서버**에 배포된 주소(`https://book-lookup.<계정>.workers.dev`)를 넣습니다.

## 구조

```
src/
  lib/        types, db(Dexie), isbn, lookup, repo, backup, date, constants
  components/ Scanner(ZXing), BookFormSheet, LogFormSheet, ChildEditor, common
  pages/      Home, Logs, Books, BookDetail, Settings
  flow.tsx    스캔 → 조회 → 등록 → 기록 흐름과 시트 상태
worker/       한글책 조회용 Cloudflare Worker (선택)
tests/        단위 테스트(vitest), e2e.mjs(Playwright)
```

## 다음 단계

- 2단계: 연속 스캔(시리즈 여러 권), 캘린더 보기, 엑셀 내보내기, 제목 검색으로 책 등록
- 3단계: 활동 유형·등급·반응 통계, 아이별 비교, 목표
