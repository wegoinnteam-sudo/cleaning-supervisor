# Cleaning Supervisor

Google Spreadsheet를 읽어서 오늘 청소해야 하는 객실 목록과 직원별 청소 배정 목록을 생성하는 운영 도구입니다.

## 기능

- 한국시간 기준 오늘 날짜를 계산합니다.
- 기본 대상 탭은 `gid=160745438`입니다.
- 시트 2행에서 오늘 날짜와 같은 열을 찾습니다.
- 4행부터 46행까지 객실 정보를 확인합니다.
- 오늘 날짜 열의 셀 배경색이 빨간색 또는 회색 계열이면 청소 대상 객실로 분류합니다.
- C열 ROOM TYPE, E열 ROOM NUMBER, 오늘 날짜 셀의 직원 이름을 읽습니다.
- ROOM TYPE별 개수, 총 객실 수, 직원별 배정 목록을 생성합니다.
- 매일 00:00 한국시간에 서버 캐시를 자동 갱신합니다.

## 설정

환경변수 예시는 `.env.example`에 있습니다.

서비스 계정 권장 설정:

```bash
cp .env.example .env
```

`.env`에 아래 값을 입력합니다.

```bash
GOOGLE_SHEET_GID=160745438
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Google Spreadsheet는 서비스 계정 이메일에 보기 권한으로 공유해야 합니다.

공개 공유 시트 테스트용으로는 `GOOGLE_API_KEY`를 사용할 수 있습니다.

## 실행

터미널 2개에서 실행합니다.

```bash
npm run dev:api
```

```bash
npm run dev
```

브라우저에서 Vite가 표시한 주소를 엽니다. 기본 API 주소는 `http://localhost:3001`이고, Vite 개발 서버가 `/api` 요청을 프록시합니다.

## Cloudflare Pages 배포

Cloudflare Pages는 정적 Vite 빌드만으로는 `/api/cleaning-assignment`를 실행하지 못합니다.
이 프로젝트는 `functions/api/cleaning-assignment.js` Pages Function으로 라이브 API를 제공합니다.

Pages 설정:

```text
Build command: npm run build
Build output directory: dist
```

Cloudflare Pages 환경변수에는 아래 중 하나를 설정합니다.

```text
GOOGLE_SPREADSHEET_ID=1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU
GOOGLE_SHEET_GID=160745438
GOOGLE_API_KEY=...
```

또는 서비스 계정을 쓸 경우:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

객실 체크박스를 여러 사용자가 공유하려면 Cloudflare KV namespace를 만들고 Pages Function 바인딩을 추가합니다.

```text
Binding type: KV namespace
Variable name: ROOM_CHECKS
KV namespace: cleaning-supervisor-room-checks
```

체크 상태는 날짜별 key로 저장되므로 새 한국시간 날짜가 되면 자동으로 빈 체크 상태로 시작합니다.

## API

```text
GET /api/cleaning-assignment
GET /api/cleaning-assignment?refresh=true
GET /api/room-checks?date=2026.05.18
POST /api/room-checks
```

응답에는 `rooms`, `countsByType`, `total`, `byStaff`, `date`, `updatedAt`가 포함됩니다.
