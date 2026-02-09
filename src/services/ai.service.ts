import { simulatorChatTurn, simulatorFeedback, simulatorTranscribe } from "./simulator.service";
import { getPresignedGetUrl } from "./s3.service";

function removeSurrogates(str: string) {
  return str.replace(/[\uD800-\uDFFF]/g, "");
}

function sanitizeUtf8(str: string) {
  return Buffer.from(str, "utf8").toString("utf8");
}

function sanitizeText(str: string) {
  return removeSurrogates(sanitizeUtf8(str));
}

function sanitizeMaybe(v: string | null | undefined) {
  if (!v) return v ?? null;
  return sanitizeText(v);
}

function sanitizeList(list: string[] | undefined) {
  if (!list) return [];
  return list.map((s) => sanitizeText(String(s)));
}

export async function aiGenerateLongformReply(input: {
  sessionId: number;
  turnNo: number;
  inputMode?: "text" | "voice";
  userText: string | null;
  userAudioUrl: string | null;
  userProfileJson?: string;
}) {
  const enabled = process.env.SIMULATOR_ENABLED === "true";
  let userText = input.userText;
  if (enabled && (!userText || userText.length === 0) && input.inputMode === "voice" && input.userAudioUrl) {
    try {
      const presigned =
        input.userAudioUrl.includes("X-Amz-Signature") || input.userAudioUrl.includes("x-amz-signature")
          ? input.userAudioUrl
          : await getPresignedGetUrl(input.userAudioUrl, 600);
      const transcript = await simulatorTranscribe({
        sessionId: input.sessionId,
        audioUrl: presigned,
        userProfileJson: input.userProfileJson,
      });
      userText = transcript || userText;
    } catch (_err) {
      return {
        aiText: "AI 응답 생성 중 오류가 발생했습니다.",
        aiAudioUrl: null as string | null,
        aiAudioBase64: null as string | null,
        status: "error",
        errorCode: "AI_STT_ERROR",
        flags: [],
        userText: null as string | null,
      };
    }
  }

  if (enabled && userText) {
    try {
      const sim = await simulatorChatTurn({
        sessionId: input.sessionId,
        userInput: userText || "",
        userProfileJson: input.userProfileJson,
      });
      const safeText = sanitizeText(sim.responseText || "");
      if (!safeText) {
        return {
          aiText: "AI 응답 생성 중 오류가 발생했습니다.",
          aiAudioUrl: null as string | null,
          aiAudioBase64: null as string | null,
          status: "error",
          errorCode: "AI_TEXT_EMPTY_AFTER_SANITIZE",
          flags: [],
          userText,
        };
      }
      return {
        aiText: safeText,
        aiAudioUrl: null as string | null,
        aiAudioBase64: sim.audioBase64,
        status: sim.status,
        flags: [],
        userText,
      };
    } catch (_err) {
      return {
        aiText: "AI 응답 생성 중 오류가 발생했습니다.",
        aiAudioUrl: null as string | null,
        aiAudioBase64: null as string | null,
        status: "error",
        errorCode: "AI_SIMULATOR_ERROR",
        flags: [],
        userText,
      };
    }
  }

  const fallbackText = sanitizeText(
    "서울중앙지검입니다. 계좌 관련 문제가 있어 본인 확인이 필요합니다."
  );
  return {
    aiText: fallbackText || "AI 응답 생성 중 오류가 발생했습니다.",
    aiAudioUrl: "https://example.com/ai.mp3",
    aiAudioBase64: null as string | null,
    status: "ongoing",
    flags: [
      { flagType: "impersonation", keyword: "Seoul Prosecutors", severity: 3 },
      { flagType: "personal_info_request", keyword: "confirm your identity", severity: 4 },
    ],
    userText,
  };
}

export async function aiScoreLongformSession(_input: { sessionId: number }) {
  const enabled = process.env.SIMULATOR_ENABLED === "true";
  if (enabled) {
    try {
      const fb = await simulatorFeedback({ sessionId: _input.sessionId });
      const coaching = sanitizeMaybe(fb.advice ?? "");
      const summary = sanitizeMaybe(fb.summary ?? "");
      const goodPoints = sanitizeList(fb.good_points);
      const improvementPoints = sanitizeList(fb.bad_points);
      return {
        score: fb.score ?? 0,
        analysisData: fb.detailed_analysis ?? {},
        aiSummary: summary || "",
        aiCoaching: coaching || "",
        goodPoints,
        improvementPoints,
      };
    } catch (_err) {
      // fall through to placeholder
    }
  }

  return {
    score: 65,
    analysisData: { panicScore: 0.7, complianceRisk: 0.5 },
    aiSummary: "User was initially flustered but recovered with questions.",
    aiCoaching: "Prepare a short script for impersonation calls.",
    goodPoints: ["Tried to verify the caller's identity"],
    improvementPoints: ["Attempted to share personal info", "Delayed hang up"],
  };
}
