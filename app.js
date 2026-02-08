const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = 3000;

// 1. 미들웨어 설정
app.use(cors()); // 프론트엔드 접속 허용
app.use(express.json()); // JSON 데이터 읽기 허용

// 2. 파일 업로드 설정 (방법 B)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // 파일이 저장될 로컬 폴더
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // 파일명 중복 방지
  },
});
const upload = multer({ storage: storage });

// 3. 테스트 API
app.get("/", (req, res) => {
  res.send("🛡️ 가디언 보이스 로컬 서버 작동 중!");
});

// 4. 음성 업로드 API (방법 B 맛보기)
app.post("/api/experience/record", upload.single("voiceFile"), (req, res) => {
  if (!req.file) return res.status(400).send("파일이 없습니다.");

  console.log("받은 파일 정보:", req.file);
  res.json({
    message: "서버에 임시 저장 완료!",
    filePath: req.file.path, // 나중에 민재님이 이걸 S3로 보낼 예정
  });
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
