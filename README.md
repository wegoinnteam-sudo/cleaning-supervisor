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
- `청소스케쥴` 시트를 읽어 내일부터 7일간의 예상 객실 청소배정(CHECK OUT 객실 수, 실제 청소 객실 수, 포지션별 근무 직원, NOTE)을 보여주며, 매 요청마다 최신 값을 다시 읽어옵니다.

## 설정

환경변수 예시는 `.env.example`에 있습니다.

서비스 계정 권장 설정:

```bash
cp .env.example .env
```

`.env`에 아래 값을 입력합니다.

```bash
GOOGLE_SHEET_GID=160745438
GOOGLE_SCHEDULE_SHEET_NAME=청소스케쥴
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
GOOGLE_SCHEDULE_SHEET_NAME=청소스케쥴
GOOGLE_API_KEY=...
```

또는 서비스 계정을 쓸 경우:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Cloudflare에서 줄바꿈이 있는 private key가 잡히지 않으면 아래처럼 base64 값으로 대신 설정할 수 있습니다.

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY_BASE64=base64로_인코딩한_private_key
```

로컬에서 base64 값은 아래 명령으로 만들 수 있습니다.

```bash
node -e "import fs from 'fs'; import dotenv from 'dotenv'; const env = dotenv.parse(fs.readFileSync('.env')); process.stdout.write(Buffer.from(env.GOOGLE_PRIVATE_KEY || '', 'utf8').toString('base64'))"
```

객실 체크박스를 여러 사용자가 공유하려면 Cloudflare KV namespace를 만들고 Pages Function 바인딩을 추가합니다.

```text
Binding type: KV namespace
Variable name: ROOM_CHECKS
KV namespace: cleaning-supervisor-room-checks
```

체크 상태는 날짜별 key로 저장되므로 새 한국시간 날짜가 되면 자동으로 빈 체크 상태로 시작합니다.

## 린넨 자동 갱신

매일 한국시간 13:07에 Amenity Request의 `Extra foot towel`을 다시 계산해 린넨 시트의 `세탁필요수량`만 덮어쓸 수 있습니다. `들어온수량`은 자동 갱신에서 수정하지 않습니다.

Cloudflare Pages 환경변수와 Cron Worker 환경변수에 같은 값을 설정합니다.

```text
AUTO_REFRESH_SECRET=충분히_긴_랜덤_문자열
```

Cron Worker는 `wrangler.linen-auto-refresh.toml` 설정을 사용합니다. 스케줄 `7 4 * * *`는 UTC 기준이며 한국시간 13:07입니다.

## API

```text
GET /api/cleaning-assignment
GET /api/cleaning-assignment?refresh=true
GET /api/cleaning-forecast
GET /api/room-checks?date=2026.05.18
POST /api/room-checks
```

응답에는 `rooms`, `countsByType`, `total`, `byStaff`, `date`, `updatedAt`가 포함됩니다.

## 린넨 재고 파악 — 신규 기록 카테고리

기존 린넨 재고파악(입고·세탁필요수량)과 별도로 마지막 카테고리에 추가했습니다.
6개 수량은 기본 0이며 음수·소수·안전한 정수 범위를 벗어난 값과 전체 0을 거부합니다.
저장 성공 응답을 확인한 경우만 초기화합니다. 실패 시 입력값과 요청 ID를 유지하며
자동 재시도하지 않습니다. 결과가 불확실하면 입력을 잠그고 같은 저장 버튼으로 같은
요청을 확인합니다. 카테고리를 전환해도 진행 중인 요청을 유지합니다.

### 인증과 대상 시트 설정

기존 GOOGLE_SPREADSHEET_ID는 변경하지 마세요. 신규 기능 대상은
`1a8jUbszQLpq-mzbfIV4oPgxrGxFCrFAnc4lhlzVzL-w`로 분리되어 있습니다.

- `GOOGLE_STOCK_SPREADSHEET_ID`: 선택사항. 지정한다면 위 ID와 동일해야 합니다.
- `GOOGLE_STOCK_SHEET_TAB_NAME`: 실제 탭 이름. 비어 있으면 Google API가 반환한
  실제 탭들의 2행 E~J 품목명을 비교하고 6개 품목이 중복 없이 일치하는 탭이 하나일 때만 사용합니다. A~D의 헤더는 비교하지 않습니다.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: 기존 서비스 계정 이메일을 재사용합니다.
- `GOOGLE_PRIVATE_KEY` 또는 `GOOGLE_PRIVATE_KEY_BASE64`: 기존 서버 인증 키를 재사용합니다.
- Express에서는 기존 `GOOGLE_APPLICATION_CREDENTIALS` 방식도 사용할 수 있습니다.

Google Cloud 프로젝트에서 Google Sheets API를 활성화하고, 대상 스프레드시트의
공유 메뉴에서 **GOOGLE_SERVICE_ACCOUNT_EMAIL에 설정한 실제 이메일**을 편집자로
추가하세요. 현재 작업 환경에는 인증 환경변수가 없어 실제 계정 이메일과 실제 탭
이름을 확인하지 못했습니다. 임의의 탭을 생성하지 않습니다.
Codespaces에서는 Secrets 또는 무시되는 `.env`에 설정하고 API 프로세스를 재시작하세요.
Cloudflare Pages에서는 서버 환경변수/Secrets로 설정한 후 재배포하세요.
인증 키를 `VITE_` 환경변수로 만들거나 소스에 넣지 마세요.
기존 앱에는 코드상 로그인 미들웨어가 없으며 신규 경로도 기존 API와 같은 접근
구조를 따릅니다. 기존 호스팅 접근 제한이 있다면 `/api/linen-stock`에도 적용하세요.

### 저장 방식과 보호 장치

공통 로직은 `shared/linenStock.js`, 로컬 Express API와 Cloudflare Pages API는
각각 `server/services/linenStock.js`, `functions/api/linen-stock.js`입니다.
서버에서 한국 날짜 `YYYY. M. D`와 고정값을 만들고 E~J를
`싱글 이불, 더블 이불, 베개, 발매트, 싱글 매트리스, 더블 매트리스` 순서로
숫자(0 포함)로 기록합니다. E~J 열의 순서가 바뀌어도 2행의 품목명에 맞춰 수량을 배치합니다. A~D에는 날짜, Dirty sheet, sv, Rewash를 직접 기록합니다.

`appendCells`로 시트에서 데이터가 있는 마지막 행 바로 다음 빈 행에 새 기록을 추가합니다.
중간 빈 행은 채우지 않고 기존 행을 수정·정렬·이동하지 않습니다.
마지막 기록의 A열이 비어 있어도 다른 열에 값이 있으면 해당 행 뒤에 추가합니다.

요청 UUID에서 파생한 양의 metadataId와 수량 지문을 Google developerMetadata에
저장합니다. 행 추가와 메타데이터 생성은 하나의 원자적 batchUpdate입니다.
같은 ID를 동시에 생성하면 Google의 ID 유일성 검증으로 전체 요청이 실패하여
두 번째 행을 추가하지 않습니다. 사용자 재시도는 메타데이터를 조회해 저장 완료를
확인합니다. 드문 해시 충돌은 다른 요청의 성공으로 처리하지 않고 실패합니다.
메타데이터를 삭제하면 중복 방지 이력을 잃으며, Sheets의 메타데이터 한도에
도달하면 저장은 실패합니다. 새로고침/브라우저 종료 전 결과가 불확실한 경우
시트에서 실제 기록을 먼저 확인하세요(요청 상태는 현재 앱 세션에서 유지됨).
추가 위치는 Google Sheets가 저장 시점의 마지막 데이터 행을 기준으로 결정합니다.

### 검증 결과 및 남은 확인

```bash
node server/tests/linenStock.test.js
npm run lint
npm run build
```

모킹 테스트는 날짜 경계, 매핑, 0 및 잘못된 수량, 3행 시작, 중간 공백,
동일 날짜 별도 행, 이전 날짜 기록 보존, 탭·헤더 검증, 인증·네트워크 실패,
동시 요청, 응답 유실 후 중복 방지를 검증합니다.
실제 브라우저 모바일 조작과 기존 앱 전체 기능의 회귀 테스트는 아직 미실시입니다.
실제 Sheets 통합 테스트 역시 인증 정보가 없어 미실시이며, 실제 테스트 기록은
사용자가 승인한 후에만 추가합니다. 기존 카테고리·저장 로직·DB는 유지했습니다.
Google API 근거: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
