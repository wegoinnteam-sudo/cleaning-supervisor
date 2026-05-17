# Cleaning Supervisor

Google Spreadsheet를 읽어서 오늘 청소해야 하는 객실 목록과 직원별 청소 배정 목록을 생성하는 운영 도구입니다.

## 기능

- 한국시간 기준 오늘 날짜를 계산합니다.
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

## API

```text
GET /api/cleaning-assignment
GET /api/cleaning-assignment?refresh=true
```

응답에는 `rooms`, `countsByType`, `total`, `byStaff`, `date`, `updatedAt`가 포함됩니다.
