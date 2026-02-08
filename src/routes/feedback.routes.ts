import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middlewares/requireAuth";

export const feedbackRoutes = Router();

// GET /api/feedback/summary
feedbackRoutes.get("/summary", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const { rows } = await pool.query(
    `
    SELECT *
    FROM feedback_summaries
    WHERE user_id = $1
    `,
    [userId]
  );

  res.json({ success: true, data: rows[0] ?? null, error: null });
});
