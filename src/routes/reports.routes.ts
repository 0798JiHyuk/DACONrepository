import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middlewares/requireAuth";

export const reportsRoutes = Router();

// GET /api/reports/weekly?mode=short|long
reportsRoutes.get("/weekly", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;

  const query = z
    .object({
      mode: z.enum(["short", "long"]),
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid query", details: query.error.flatten() },
    });
  }

  const { rows } = await pool.query(
    `
    SELECT *
    FROM weekly_reports
    WHERE user_id = $1 AND mode = $2
    ORDER BY week_start DESC
    LIMIT 1
    `,
    [userId, query.data.mode]
  );

  res.json({ success: true, data: rows[0] ?? null, error: null });
});
