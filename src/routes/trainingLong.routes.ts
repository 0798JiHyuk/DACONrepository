import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middlewares/requireAuth";
import { aiGenerateLongformReply, aiScoreLongformSession } from "../services/ai.service";

export const trainingLongRoutes = Router();

// GET /api/training/scenarios
trainingLongRoutes.get("/scenarios", requireAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT id, title, category FROM training_scenarios ORDER BY id DESC`);
  res.json({ success: true, data: { items: rows }, error: null });
});

// POST /api/training/longs/sessions
trainingLongRoutes.post("/longs/sessions", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const body = z.object({ scenarioId: z.number().int().optional() }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid body", details: body.error.flatten() },
    });
  }

  const scenarioId = body.data.scenarioId ?? null;

  const { rows } = await pool.query(
    `
    INSERT INTO longform_sessions (user_id, scenario_id, status)
    VALUES ($1, $2, 'in_progress')
    RETURNING id
    `,
    [userId, scenarioId]
  );

  res.status(201).json({ success: true, data: { sessionId: rows[0].id }, error: null });
});

// POST /api/training/longs/messages
trainingLongRoutes.post("/longs/messages", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const body = z
    .object({
      sessionId: z.number().int(),
      turnNo: z.number().int().min(1),
      inputMode: z.enum(["text", "voice"]),
      text: z.string().nullable().optional(),
      userAudioUrl: z.string().url().nullable().optional(),
      meta: z.record(z.any()).optional(),
      userProfileJson: z.string().optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid body", details: body.error.flatten() },
    });
  }

  const { sessionId, turnNo, inputMode } = body.data;

  const sess = await pool.query(`SELECT id, user_id, status FROM longform_sessions WHERE id=$1`, [sessionId]);
  if (!sess.rows[0] || sess.rows[0].user_id !== userId) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Not your session", details: {} },
    });
  }
  if (sess.rows[0].status !== "in_progress") {
    return res.status(409).json({
      success: false,
      data: null,
      error: { code: "SESSION_NOT_ACTIVE", message: "Session is not in progress", details: {} },
    });
  }

  let userText = body.data.text ?? null;
  const userAudioUrl = body.data.userAudioUrl ?? null;

  const insertedUser = await pool.query(
    `
    INSERT INTO longform_messages (session_id, turn_no, role, text, user_audio_url, input_mode, meta)
    VALUES ($1, $2, 'user', $3, $4, $5, $6)
    RETURNING id
    `,
    [sessionId, turnNo, userText, userAudioUrl, inputMode, body.data.meta ?? {}]
  );

  const ai = await aiGenerateLongformReply({
    sessionId,
    turnNo,
    inputMode,
    userText,
    userAudioUrl,
    userProfileJson: body.data.userProfileJson,
  });

  if (!userText && ai.userText) {
    userText = ai.userText;
    await pool.query(`UPDATE longform_messages SET text=$2 WHERE id=$1`, [insertedUser.rows[0].id, userText]);
  }

  const aiTextSafe = (ai.aiText || "").replace(/[\uD800-\uDFFF]/g, "");

  const audioBase64Raw = ai.aiAudioBase64 ?? null;
  const disableAudioBase64 = process.env.LONGFORM_AUDIO_BASE64_DISABLED === "true";
  const maxBase64 = Number(process.env.LONGFORM_AUDIO_BASE64_MAX_LEN ?? 500000);
  const audioBase64 =
    disableAudioBase64 || (audioBase64Raw && audioBase64Raw.length > maxBase64)
      ? null
      : audioBase64Raw;

  const insertedAi = await pool.query(
    `
    INSERT INTO longform_messages (session_id, turn_no, role, text, input_mode, meta)
    VALUES ($1, $2, 'ai', $3, 'text', $4)
    RETURNING id
    `,
    [
      sessionId,
      turnNo,
      aiTextSafe,
      { aiAudioUrl: ai.aiAudioUrl, aiAudioBase64: audioBase64, status: ai.status },
    ]
  );

  for (const f of ai.flags) {
    await pool.query(
      `
      INSERT INTO longform_flags (session_id, message_id, flag_type, keyword, severity)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [sessionId, insertedUser.rows[0].id, f.flagType, f.keyword ?? null, f.severity ?? 1]
    );
  }

  console.info("[longs/messages] turn", {
    sessionId,
    turnNo,
    inputMode,
    userText: ai.userText ?? userText,
    aiText: ai.aiText,
    status: ai.status,
  });

  res.json({
    success: true,
    data: {
      userText: ai.userText ?? userText,
      aiText: ai.aiText,
      aiAudioUrl: ai.aiAudioUrl,
      aiAudioBase64: audioBase64,
      status: ai.status,
      flags: ai.flags,
      messageIds: { user: insertedUser.rows[0].id, ai: insertedAi.rows[0].id },
    },
    error: null,
  });
});

// POST /api/training/longs/sessions/:id/finish
trainingLongRoutes.post("/longs/sessions/:id/finish", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  const sessionId = Number(req.params.id);

  const sess = await pool.query(`SELECT id, user_id, status FROM longform_sessions WHERE id=$1`, [sessionId]);
  if (!sess.rows[0] || sess.rows[0].user_id !== userId) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Not your session", details: {} },
    });
  }

  const aiScore = await aiScoreLongformSession({ sessionId });

  await pool.query(
    `
    UPDATE longform_sessions
    SET status='done',
        score=$2,
        analysis_data=$3,
        ai_summary=$4,
        ai_coaching=$5,
        good_points=$6,
        improvement_points=$7,
        ended_at=now()
    WHERE id=$1
    `,
    [
      sessionId,
      aiScore.score,
      aiScore.analysisData,
      aiScore.aiSummary,
      aiScore.aiCoaching,
      JSON.stringify(aiScore.goodPoints ?? []),
      JSON.stringify(aiScore.improvementPoints ?? []),
    ]
  );

  const s2 = await pool.query(`SELECT scenario_id FROM longform_sessions WHERE id=$1`, [sessionId]);
  const scenarioId = s2.rows[0]?.scenario_id;

  if (scenarioId) {
    await pool.query(
      `
      INSERT INTO training_results (user_id, type, scenario_id, score)
      VALUES ($1, 'long', $2, $3)
      `,
      [userId, scenarioId, aiScore.score]
    );
  }

  const final = await pool.query(
    `SELECT id, status, score, ai_summary, ai_coaching, good_points, improvement_points, ended_at
     FROM longform_sessions WHERE id=$1`,
    [sessionId]
  );

  res.json({ success: true, data: final.rows[0], error: null });
});
