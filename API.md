# API 설계서 (현재 구현 기준)

**공통**
- 인증: 세션 쿠키 `cheongeum.sid`
- 유저 식별: `req.session.user.id`
- 응답 포맷:
```json
{ "success": true, "data": {}, "error": null }
```

---

## Auth

### POST /api/auth/register
- Request
```json
{ "email": "a@b.com", "password": "pw1234", "name": "홍길동", "phone": "01012345678" }
```
- Response
```json
{ "success": true, "data": { "userId": 1 }, "error": null }
```

### POST /api/auth/login
- Request
```json
{ "email": "a@b.com", "password": "pw" }
```
- Response
```json
{ "success": true, "data": { "userId": 1 }, "error": null }
```

### GET /api/auth/me
- 인증 필요
- Response
```json
{ "success": true, "data": { "id": 1, "email": "...", "name": "...", "phone": "...", "provider": "...", "created_at": "..." }, "error": null }
```

### POST /api/auth/logout
- 인증 필요
- Response
```json
{ "success": true, "data": {}, "error": null }
```

---

## Shorts (숏폼 퀴즈)

### GET /api/training/shorts
- 인증 필요
- Query: `categoryCode?`, `limit?` (default 5, max 20)
- Response
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "audioUrl": "uploads/shorts/2026/02/09/123.mp3",
        "audioPlayUrl": "https://...presigned...",
        "categoryCode": "..."
      }
    ]
  },
  "error": null
}
```

### POST /api/training/shorts/sessions
- 인증 필요
- Request
```json
{ "totalRounds": 5 }
```
- Response
```json
{ "success": true, "data": { "sessionId": 101 }, "error": null }
```

### POST /api/training/shorts/attempts
- 인증 필요
- Request
```json
{ "sessionId": 101, "roundNo": 1, "shortId": 12, "userChoice": "real", "timeMs": 8200 }
```
- Response
```json
{
  "success": true,
  "data": {
    "isCorrect": false,
    "correctAnswer": "fake",
    "triggers": [],
    "explanation": null,
    "session": { "totalAnswered": 1, "correctCount": 0, "score": 0, "accuracy": 0 }
  },
  "error": null
}
```

### POST /api/training/shorts/sessions/:id/finish
- 인증 필요
- Response
```json
{ "success": true, "data": { "id": 101, "score": 80, "correct_count": 4, "accuracy": 80.0, "ai_feedback": "..." }, "error": null }
```

---

## Longs (롱폼 대화형)

### GET /api/training/scenarios
- 인증 필요
- Response
```json
{ "success": true, "data": { "items": [{ "id": 1, "title": "...", "category": "..." }] }, "error": null }
```

### POST /api/training/longs/sessions
- 인증 필요
- Request
```json
{ "scenarioId": 1 }
```
- Response
```json
{ "success": true, "data": { "sessionId": 55 }, "error": null }
```

### POST /api/training/longs/messages
- 인증 필요
- Request
```json
{
  "sessionId": 55,
  "turnNo": 1,
  "inputMode": "text",
  "text": "무슨 소리세요?",
  "userAudioUrl": null,
  "meta": { "sttConfidence": null, "durationMs": null },
  "userProfileJson": "{\"user_profile\": {\"name\": \"김철수\", \"scenario_type\": \"loan\"}}"
}
```
- Response
```json
{
  "success": true,
  "data": {
    "userText": "무슨 소리세요?",
    "aiText": "...",
    "aiAudioUrl": "https://...",
    "aiAudioBase64": "base64...",
    "status": "ongoing",
    "flags": [{ "flagType": "impersonation", "keyword": "Seoul Prosecutors", "severity": 3 }],
    "messageIds": { "user": 1, "ai": 2 }
  },
  "error": null
}
```
- 설명
  - `inputMode="voice"` 이고 `text`가 비어있을 경우, 서버가 STT를 수행해 `userText`에 반영합니다.

### POST /api/training/longs/sessions/:id/finish
- 인증 필요
- Response
```json
{
  "success": true,
  "data": {
    "id": 55,
    "status": "done",
    "score": 65,
    "ai_summary": "...",
    "ai_coaching": "...",
    "good_points": [],
    "improvement_points": [],
    "ended_at": "..."
  },
  "error": null
}
```
- 설명
  - `score`, `ai_summary`, `ai_coaching`, `good_points`, `improvement_points`는 시뮬레이터 피드백 결과를 반영합니다.

---

## Experience (딥페이크 체험)

### POST /api/experience/voice-clone
- 인증 필요
- Content-Type: `multipart/form-data`
- Form Field: `voiceFile` (파일), `phishingText` (문자열)
- Response
```json
{
  "success": true,
  "data": {
    "audioBase64": "base64...",
    "mimeType": "audio/mpeg"
  },
  "error": null
}
```

### POST /api/experience/records
- 인증 필요
- Request
```json
{ "originalUrl": "https://...", "note": "..." }
```
- Response
```json
{ "success": true, "data": { "recordId": 1 }, "error": null }
```

### POST /api/experience/clones
- 인증 필요
- Request
```json
{ "recordId": 1, "clonedUrl": "https://...", "model": "elevenlabs" }
```
- Response
```json
{ "success": true, "data": { "cloneId": 1 }, "error": null }
```

### GET /api/experience/records
- 인증 필요
- Response
```json
{ "success": true, "data": { "items": [{ "id": 1, "original_url": "...", "note": "...", "created_at": "..." }] }, "error": null }
```

---

## Feedback / Reports

### GET /api/feedback/summary
- 인증 필요
- Response
```json
{ "success": true, "data": { /* feedback_summaries row */ }, "error": null }
```

### GET /api/reports/weekly?mode=short|long
- 인증 필요
- Response
```json
{ "success": true, "data": { /* weekly_reports row */ }, "error": null }
```

---

## Uploads (음성 업로드)

### GET /api/uploads/presign?key=...&expires=600
- 인증 필요
- Query:
  - `key` (필수): S3 object key 또는 기존 URL
  - `expires` (선택): 만료 초 (300~600으로 강제)
- Response
```json
{ "success": true, "data": { "url": "https://...presigned...", "expiresSeconds": 600 }, "error": null }
```

### POST /api/uploads/:type
- 인증 필요
- Content-Type: `multipart/form-data`
- Form Field: `voiceFile` (파일)
- `type` 값: `voice` | `records` | `clones` | `shorts`
- S3 경로 규칙:
  - `uploads/voice/`
  - `uploads/records/`
  - `uploads/clones/`
  - `uploads/shorts/`
- Response
```json
{
  "success": true,
  "data": {
    "url": "https://.../uploads/voice/2026/02/08/123-voice.mp3",
    "key": "uploads/voice/2026/02/08/123-voice.mp3",
    "bucket": "your-bucket",
    "size": 123456,
    "mimeType": "audio/mpeg"
  },
  "error": null
}
```

---

## Health

### GET /health
```json
{ "ok": true }
```
