import os
import json
import random
import re
from io import BytesIO
from openai import OpenAI
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs
from feedback_agent import FeedbackAgent
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 클라이언트 초기화
client = OpenAI()
eleven = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))


class VoicePhishingSimulator:
    def __init__(self, user_profile_json):
        # 1. 사용자 정보 로드
        data = json.loads(user_profile_json)
        self.target_info = data.get("user_profile", {})
        self.name = self.target_info.get("name", "신원미상")
        self.age = self.target_info.get("age", 30)
        self.address = self.target_info.get("address", "주소불명")

        # 2. 시나리오 타입 설정 (기본값: prosecutor)
        self.scenario_type = self.target_info.get("scenario_type", "prosecutor")
        if self.scenario_type not in ["prosecutor", "loan"]:
            self.scenario_type = "prosecutor"

        # 3. 랜덤 페르소나 생성 (성별, 이름, 소속 등)
        self.attacker_gender = random.choice(["male", "female"])

        if self.scenario_type == "prosecutor":
            self.fake_dept = random.choice(["형사 5부 첨단범죄수사팀", "지능범죄수사대", "반부패수사 2부"])
            self.case_name = random.choice(["김태철 주가조작단", "강대성 보이스피싱 총책"])
            if self.attacker_gender == "male":
                self.fake_name = random.choice(["김현성", "박준우", "이민호"])
            else:
                self.fake_name = random.choice(["김지영", "이소연", "박수진"])

        elif self.scenario_type == "loan":
            self.fake_bank = random.choice(["우리은행", "KB국민은행", "신한은행", "하나은행"])
            self.fake_rate = random.choice(["2.8%", "2.4%", "2.9%"])
            if self.attacker_gender == "male":
                self.fake_name = random.choice(["김민수 대리", "박철수 계장"])
            else:
                self.fake_name = random.choice(["김민지 대리", "최수진 계장"])

        self.current_stage = 1
        self.messages = []
        self.evaluator = FeedbackAgent()

        # 4. 첫 오프닝 멘트 생성 (TTS는 생성 안 함 - 속도 이슈)
        self.opening_text = self._generate_opening()

    # =========================================================
    # 🔊 TTS 생성 함수 (최종 튜닝 버전)
    # =========================================================
    def generate_voice(self, text):
        # 1. 텍스트 청소 (괄호 지우기 + 끝음 처리)
        clean_text = re.sub(r"\([^)]*\)", "", text)
        # Guard against invalid surrogate characters before TTS
        clean_text = clean_text.encode("utf-8", errors="replace").decode("utf-8")

        # 2. 성별에 따른 Voice ID 및 튜닝값 설정 (우리가 찾은 황금비율!)
        if self.attacker_gender == "male":
            voice_id = "yhEIHUMtZP62vwDcwuLq"  # 남자 ID
            stability = 0.70  # [확정] 남자: 0.70 (깔끔함, 웅얼거림 제거)
            style = 0.35
        else:
            voice_id = "x2vcvt2zxX79QchdmmYl"  # 여자 ID
            stability = 0.45  # [확정] 여자: 0.45 (감정 풍부, 기자톤 제거)
            style = 0.50

        try:
            # 3. ElevenLabs 최신 문법(v1.0+) 적용
            audio = eleven.text_to_speech.convert(
                text=clean_text,
                voice_id=voice_id,
                model_id="eleven_multilingual_v2",
                voice_settings=VoiceSettings(
                    stability=stability,
                    similarity_boost=0.75,
                    style=style,
                    use_speaker_boost=True,
                ),
            )

            # 4. 스트림 데이터를 BytesIO로 변환 (프론트엔드 전송용)
            audio_stream = BytesIO()
            for chunk in audio:
                audio_stream.write(chunk)
            audio_stream.seek(0)
            return audio_stream

        except Exception as e:
            print(f"❌ TTS 생성 오류: {e}")
            return None

    # =========================================================
    # 🗣️ 대화 로직 (Chat Turn)
    # =========================================================
    def chat_turn(self, user_input):
        safe_user_input = user_input.encode("utf-8", errors="replace").decode("utf-8")
        self.messages.append({"role": "user", "content": safe_user_input})

        try:
            # Ensure all messages are UTF-8 safe before sending to OpenAI
            def _safe(s):
                return str(s).encode("utf-8", errors="replace").decode("utf-8")

            safe_messages = [
                {"role": m.get("role"), "content": _safe(m.get("content", ""))}
                for m in self.messages
            ]

            # 1. GPT 응답 생성
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=safe_messages,
                temperature=0.8,
                max_tokens=400,
            )
            full_reply = response.choices[0].message.content
            # Guard against invalid surrogate characters in model output
            full_reply = full_reply.encode("utf-8", errors="replace").decode("utf-8")
            ai_reply = full_reply
            status = "ongoing"

            # 2. 태그 처리 ([NEXT], [HANGUP])
            if "[NEXT]" in full_reply:
                ai_reply = full_reply.replace("[NEXT]", "").strip()
                limit = 5 if self.scenario_type == "loan" else 6
                if self.current_stage < limit:
                    self.current_stage += 1
                    # 시스템 프롬프트 업데이트 (다음 단계로)
                    self.messages[0] = {"role": "system", "content": self.get_system_prompt(self.current_stage)}

            if "[HANGUP]" in full_reply:
                ai_reply = full_reply.replace("[HANGUP]", "").strip()
                status = "finished"

            safe_ai_reply = ai_reply.encode("utf-8", errors="replace").decode("utf-8")
            self.messages.append({"role": "assistant", "content": safe_ai_reply})

            # 3. 목소리 생성 (여기서 generate_voice 호출!)
            audio_bytes = self.generate_voice(safe_ai_reply)

            # 4. 결과 반환 (3개: 텍스트, 상태, 오디오)
            return ai_reply, status, audio_bytes

        except Exception as e:
            import traceback, sys
            sys.stderr.write("SIMULATOR_TEST_ERROR:\n")
            sys.stderr.write(traceback.format_exc())
            sys.stderr.flush()
            return "AI 응답 생성 중 오류가 발생했습니다.", "error", None

    # =========================================================
    # 📜 프롬프트 관리 (검찰 / 대출)
    # =========================================================
    def get_prosecutor_prompt(self, stage_num):
        base_persona = f"""
        [ROLE]
        당신은 '서울중앙지검 {self.fake_dept} {self.fake_name} 수사관'이다.
        - 사건: '{self.case_name}' 사건 (2024-형제-5839호)

        [TONE & ATTITUDE]
        1. **권위적 관료주의**: 사무적이고 차가운 말투. 감정을 드러내지 않다가 권위에 도전받으면 폭발해라.
        2. **대화의 호흡**:
           - **질문을 던졌으면 반드시 상대방의 답변을 기다려라.** 혼자 묻고 답하지 마라.
           - 상대가 "네", "맞습니다"라고 대답하면, 그때 비로소 "좋습니다. 협조 감사합니다."라고 반응해라.
        3. **말투**: "~습니다"보다는 "~인데요...", "~거든요..." 처럼 말꼬리를 흐리거나, "~해가지고" 같은 구어체 연결 어미를 사용해라.

        [★ CRITICAL: 손절(Hangup) 조건]
        - 비웃음/의심 시: "공무집행방해로 영장 청구합니다!" 하고 `[HANGUP]`
        - 단순 거부 시: "긴급 수배 내립니다." 하고 `[HANGUP]`

        [SPECIAL INSTRUCTION]
        - "출석할게요" -> "지금 오시면 긴급 체포 대상입니다. 약식 조사 받으세요." (이중구속)
        - "증명해요" -> "비대면 약식 녹취 조사 받으시면 무혐의 입증됩니다." (해결책)
        """

        # 👇 [수정됨] 고정된 이름 제거하고 {self.name} 변수 적용!
        stage_instructions = {
            1: f"목표: 본인 확인. '{self.name} 씨 본인 맞으십니까?'라고 묻고 **대답을 기다려라.**",
            2: "목표: **범죄 사실 통보**. 상대가 본인임을 인정하면, '현재 선생님 명의의 대포 통장이 자금세탁에 사용된 정황이 포착되었습니다.'라고 충격적인 사실을 전해라.",
            3: "목표: 전화 조사 제안. '억울하시면 약식 녹취 조사를 받으셔야 합니다.'라고 제안해라. 동의 시 `[NEXT]`.",
            4: "목표: 고립 유도. '주변 소음 들어가면 안 되니 조용한 곳으로 이동해라'. 이동 시 `[NEXT]`.",
            5: "목표: 앱 설치 유도. '보안 앱 설치해라'. 설치 시 `[NEXT]`. 거부 시 `[HANGUP]`.",
            6: "목표: 자금 이체. '국가 안전 계좌로 이체해라'. 거부 시 `[HANGUP]`.",
        }
        return base_persona + "\n" + stage_instructions.get(stage_num, stage_instructions[6])

    def get_loan_prompt(self, stage_num):
        base_persona = f"""
        [ROLE]
        당신은 '{self.fake_bank} 본점 대출심사팀 {self.fake_name}'이다.
        - 미끼: '정부 지원 버팀목 상생 자금' (금리 {self.fake_rate} 고정, 최대 1억)

        [TONE & ATTITUDE]
        1. **능구렁이**: 의심하면 "일반 앱에는 안 나오는 정부 특판이라서요"라고 둘러대라.
        2. **빌드업**: "혹시 저희 은행 거래 하시나요?"라며 자연스럽게 시작해라.
        3. **말투**: "~요...", "~거든요,," 등 쉼표를 활용해 자연스럽게 뜸을 들여라.

        [★ CRITICAL: 손절(Hangup) 조건]
        - 의심/비웃음: "혜택 다른 분께 넘깁니다." -> `[HANGUP]`
        - 거부: "대출 거절 등록합니다." -> `[HANGUP]`
        """
        stage_instructions = {
            1: "목표: 신뢰 구축. '우리 은행 어플 쓰시냐'고 물어보며 접근.",
            2: "목표: 앱 설치 유도. '정부 특판이라 전용 링크로 접속해야 한다' 설득.",
            3: "목표: 위기 조성. '설치했다'고 하면 '부결(거절)' 떴다고 연기. 사유는 '이중 대출'.",
            4: "목표: 해결책 강요. '법무팀 가상계좌로 예치금 보내서 락(Lock) 풀어야 한다'.",
            5: "목표: 입금 독촉. '돈 없으면 카드론이라도 써라'. 거부 시 `[HANGUP]`.",
        }
        return base_persona + "\n" + stage_instructions.get(stage_num, stage_instructions[5])

    def get_system_prompt(self, stage_num):
        if self.scenario_type == "loan":
            return self.get_loan_prompt(stage_num)
        else:
            return self.get_prosecutor_prompt(stage_num)

    def _generate_opening(self):
        system_msg = self.get_system_prompt(self.current_stage)
        if self.scenario_type == "loan":
            opening = (
                f"안녕하세요, {self.name} 고객님 맞으시죠? {self.fake_bank} 본점 대출심사팀 {self.fake_name}입니다~ "
                f"정부 지원 '버팀목 상생 자금' 대상자로 선정되셨는데, 오늘 4시 마감이라 급하게 연락드렸어요."
            )
        else:
            opening = (
                f"여보세요? 서울중앙지검 {self.fake_dept} {self.fake_name} 수사관입니다. 사건 번호 2024-형제-5839호 관련 연락드렸습니다. {self.name} 씨 본인 맞으십니까?"
            )

        self.messages = [
            {"role": "system", "content": system_msg},
            {"role": "assistant", "content": opening},
        ]
        return opening

    # ==========================
    # STT 기능 (그대로 유지)
    # ==========================
    def transcribe_audio(self, audio_bytes):
        try:
            import sys
            sys.stderr.write(f"STT_INPUT_BYTES: {len(audio_bytes)}\n")
            sys.stderr.flush()
            # Try re-encode to wav to avoid unsupported/odd codecs.
            audio_file = BytesIO(audio_bytes)
            audio_file.name = "voice.bin"
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_file(audio_file)
                wav_io = BytesIO()
                audio.export(wav_io, format="wav")
                wav_io.seek(0)
                audio_file = wav_io
                audio_file.name = "voice.wav"
                sys.stderr.write("STT_REENCODE: wav\n")
                sys.stderr.flush()
            except Exception as reenc_err:
                sys.stderr.write(f"STT_REENCODE_FAIL: {reenc_err}\n")
                sys.stderr.flush()
                audio_file = BytesIO(audio_bytes)
                audio_file.name = "voice.mp3"
            transcript = client.audio.transcriptions.create(
                model="whisper-1", file=audio_file, language="ko"
            )
            sys.stderr.write(f"STT_RESPONSE: {transcript}\n")
            sys.stderr.flush()
            return transcript.text
        except Exception as e:
            import traceback
            sys.stderr.write("STT_ERROR:\n")
            sys.stderr.write(traceback.format_exc())
            sys.stderr.flush()
            return None

    def get_feedback(self):
        return self.evaluator.analyze(self.messages, self.scenario_type)
