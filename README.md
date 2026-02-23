# Guardian Server

보이스피싱 대응 학습 서비스 **Guardian(천금)** 의 백엔드 서버입니다.  
Express + TypeScript 기반 REST API를 제공하며, 다음 기능을 지원합니다.

- 세션 기반 회원 인증
- 숏폼(퀴즈형) 보이스피싱 판별 훈련
- 롱폼(대화형) 시뮬레이션 훈련
- 훈련 결과 리포트/피드백 조회
- 음성 업로드(S3) 및 Presigned URL 발급
- 음성 클로닝 체험(ElevenLabs 연동)

## 1. Tech Stack

- Runtime: Node.js, TypeScript
- Framework: Express
- DB: PostgreSQL (`pg`)
- Auth: `express-session` (쿠키 세션)
- Validation: `zod`
- File Upload: `multer`
- Cloud Storage: AWS S3 (`@aws-sdk/client-s3`)
- External AI/TTS (optional): Python simulator bridge, ElevenLabs

## 2. Project Structure

```text
guardian-server/
├─ src/
│  ├─ app.ts                # 앱/미들웨어 구성
│  ├─ server.ts             # 서버 엔트리포인트
│  ├─ routes/               # API 라우트
│  ├─ services/             # 비즈니스 로직 (AI/S3/클로닝 등)
│  ├─ repositories/         # DB 접근 계층
│  ├─ middlewares/          # 인증/에러 처리
│  ├─ db/                   # DB 풀/트랜잭션
│  └─ config/               # 환경변수 로딩
├─ scripts/
│  ├─ simulator_bridge.py   # Node <-> Python 시뮬레이터 브리지
│  └─ db-check.js           # DB 연결 체크 스크립트
├─ API.md                   # 상세 API 명세
├─ FRONTEND_GUIDE.md        # 프론트 연동 가이드
├─ .env.example             # 환경변수 예시
└─ package.json
```

## 3. Prerequisites

- Node.js 18+
- npm
- PostgreSQL 접근 가능한 `DATABASE_URL`
- (선택) Python 3.10+ (시뮬레이터 사용 시)
- (선택) AWS S3 계정
- (선택) ElevenLabs API Key

## 4. Installation

```bash
npm install
```

환경변수 파일 생성:

```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

## 5. Environment Variables

핵심 변수 (`.env.example` 기준):

- `NODE_ENV` : 실행 환경 (`development` / `production`)
- `PORT` : 서버 포트 (기본 4000)
- `DATABASE_URL` : PostgreSQL 연결 문자열
- `SESSION_SECRET` : 세션 서명 키
- `CORS_ORIGIN` : 허용할 프론트엔드 주소

S3 사용 시:

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX`
- `AWS_S3_PUBLIC_BASE_URL`
- `AWS_S3_PRESIGN_EXPIRES`

시뮬레이터/외부 API 사용 시:

- `SIMULATOR_ENABLED` (`true`/`false`)
- `SIMULATOR_PYTHON`
- `SIMULATOR_BRIDGE`
- `OPENAI_API_KEY` (Python 시뮬레이터 내부 사용 가능)
- `ELEVENLABS_API_KEY` (음성 클로닝)

## 6. Run

개발 서버:

```bash
npm run dev
```

빌드:

```bash
npm run build
```

프로덕션 실행:

```bash
npm start
```

헬스체크:

```bash
GET /health
# { "ok": true }
```

## 7. API Overview

Base path: `/api`

- `auth` : 회원가입/로그인/로그아웃/내 정보
- `training/shorts` : 숏폼 훈련 문제/세션/정답 제출
- `training/longs` : 롱폼 시뮬레이션 세션/대화/종료
- `experience` : 음성 클로닝 체험 기록
- `feedback` : 사용자 피드백 요약
- `reports` : 주간 리포트 조회
- `uploads` : 음성 파일 업로드 및 presign URL 발급

상세 스펙은 `API.md`를 확인하세요.

## 8. Python Simulator (Optional)

롱폼 대화에서 실제 시뮬레이터 응답을 사용하려면:

1. `SIMULATOR_ENABLED=true` 설정
2. Python 의존성 설치

```bash
pip install -r ai-requirements.txt
```

3. `SIMULATOR_PYTHON`, `SIMULATOR_BRIDGE` 경로 확인

시뮬레이터 비활성화 시에는 서버 내부 fallback 응답을 사용합니다.

## 9. Notes for Submission

- 본 레포는 백엔드 API 서버입니다.
- 세션 쿠키 인증을 사용하므로 프론트 요청에서 `credentials: "include"` 설정이 필요합니다.
- `node_modules`, `.env` 등 민감/대용량 파일은 커밋하지 않습니다.

## 10. Quick Check

DB 연결 확인:

```bash
node scripts/db-check.js
```

성공 시 `DB_OK 1` 로그가 출력됩니다.
