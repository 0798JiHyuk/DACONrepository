import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middlewares/requireAuth";

export const trainingShortRoutes = Router();

// GET /api/training/shorts
trainingShortRoutes.get("/shorts", requireAuth, async (req, res) => {
  const categoryCode = typeof req.query.categoryCode === "string" ? req.query.categoryCode : null;
  const limit = Math.min(Number(req.query.limit ?? 5), 20);

  const params: any[] = [];
  let where = `WHERE is_active = true`;
  if (categoryCode) {
    params.push(categoryCode);
    where += ` AND category_code = $${params.length}`;
  }
  params.push(limit);

  const { rows } = await pool.query(
    `
    SELECT id, audio_url, category_code
    FROM training_shorts
    ${where}
    ORDER BY random()
    LIMIT $${params.length}
    `,
    params
  );

  const items = rows.map((r) => ({
    id: r.id,
    audioUrl: r.audio_url,
    categoryCode: r.category_code,
  }));

  res.json({ success: true, data: { items }, error: null });
});

// POST /api/training/shorts/sessions
trainingShortRoutes.post("/shorts/sessions", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const body = z
    .object({ totalRounds: z.number().int().min(1).max(20).default(5) })
    .safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid body", details: body.error.flatten() },
    });
  }

  const totalRounds = body.data.totalRounds;

  const { rows } = await pool.query(
    `
    INSERT INTO shortform_sessions (user_id, total_rounds)
    VALUES ($1, $2)
    RETURNING id
    `,
    [userId, totalRounds]
  );

  res.status(201).json({ success: true, data: { sessionId: rows[0].id }, error: null });
});

// POST /api/training/shorts/attempts
trainingShortRoutes.post("/shorts/attempts", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const body = z
    .object({
      sessionId: z.number().int(),
      roundNo: z.number().int().min(1).max(20),
      shortId: z.number().int(),
      userChoice: z.enum(["real", "fake"]),
      timeMs: z.number().int().min(0).max(10 * 60 * 1000).optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid body", details: body.error.flatten() },
    });
  }

  const { sessionId, roundNo, shortId, userChoice, timeMs } = body.data;

  const sess = await pool.query(`SELECT id, user_id FROM shortform_sessions WHERE id=$1`, [sessionId]);
  if (!sess.rows[0] || sess.rows[0].user_id !== userId) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Not your session", details: {} },
    });
  }

  const q = await pool.query(`SELECT answer, triggers, explanation FROM training_shorts WHERE id=$1`, [shortId]);
  if (!q.rows[0]) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Short not found", details: {} },
    });
  }

  const correctAnswer = q.rows[0].answer;
  const isCorrect = correctAnswer === userChoice;

  await pool.query(
    `
    INSERT INTO shortform_attempts (session_id, round_no, short_id, user_choice, is_correct, time_ms)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [sessionId, roundNo, shortId, userChoice, isCorrect, timeMs ?? null]
  );

  await pool.query(
    `
    INSERT INTO training_results (user_id, type, short_id, user_choice, is_correct, score, time_ms)
    VALUES ($1, 'short', $2, $3, $4, $5, $6)
    `,
    [userId, shortId, userChoice, isCorrect, isCorrect ? 10 : 0, timeMs ?? null]
  );

  const agg = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct
    FROM shortform_attempts
    WHERE session_id = $1
    `,
    [sessionId]
  );

  const total = agg.rows[0].total;
  const correct = agg.rows[0].correct;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  const score = correct * 10;

  await pool.query(
    `
    UPDATE shortform_sessions
    SET correct_count = $2,
        score = $3,
        accuracy = $4
    WHERE id = $1
    `,
    [sessionId, correct, score, accuracy]
  );

  return res.json({
    success: true,
    data: {
      isCorrect,
      correctAnswer,
      triggers: q.rows[0].triggers ?? [],
      explanation: q.rows[0].explanation ?? null,
      session: { totalAnswered: total, correctCount: correct, score, accuracy },
    },
    error: null,
  });
});

// POST /api/training/shorts/sessions/:id/finish
trainingShortRoutes.post("/shorts/sessions/:id/finish", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  const sessionId = Number(req.params.id);

  const sess = await pool.query(`SELECT id, user_id, ended_at FROM shortform_sessions WHERE id=$1`, [sessionId]);
  if (!sess.rows[0] || sess.rows[0].user_id !== userId) {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Not your session", details: {} },
    });
  }

  await pool.query(`UPDATE shortform_sessions SET ended_at = now() WHERE id=$1`, [sessionId]);

  const aiFeedback = "AI feedback (placeholder)";

  await pool.query(`UPDATE shortform_sessions SET ai_feedback=$2 WHERE id=$1`, [sessionId, aiFeedback]);

  const final = await pool.query(
    `SELECT id, score, correct_count, accuracy, ai_feedback FROM shortform_sessions WHERE id=$1`,
    [sessionId]
  );

  res.json({ success: true, data: final.rows[0], error: null });
});
