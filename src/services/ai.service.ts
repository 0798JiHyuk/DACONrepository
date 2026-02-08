export async function aiGenerateLongformReply(input: {
  sessionId: number;
  turnNo: number;
  userText: string | null;
  userAudioUrl: string | null;
}) {
  return {
    aiText:
      "Seoul Prosecutors Office. There is an issue with your account. Please confirm your identity.",
    aiAudioUrl: "https://example.com/ai.mp3",
    flags: [
      { flagType: "impersonation", keyword: "Seoul Prosecutors", severity: 3 },
      { flagType: "personal_info_request", keyword: "confirm your identity", severity: 4 },
    ],
  };
}

export async function aiScoreLongformSession(_input: { sessionId: number }) {
  return {
    score: 65,
    analysisData: { panicScore: 0.7, complianceRisk: 0.5 },
    aiSummary: "User was initially flustered but recovered with questions.",
    aiCoaching: "Prepare a short script for impersonation calls.",
    goodPoints: ["Tried to verify the caller's identity"],
    improvementPoints: ["Attempted to share personal info", "Delayed hang up"],
  };
}
