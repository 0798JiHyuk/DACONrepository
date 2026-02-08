import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { verifyPassword } from "../utils/password";

export const authRoutes = Router();

authRoutes.post("/login", async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "Invalid body", details: body.error.flatten() },
    });
  }

  const { email, password } = body.data;

  const { rows } = await pool.query(
    `SELECT id, email, password_hash, name
     FROM users
     WHERE email = $1`,
    [email]
  );

  const user = rows[0];
  if (!user || !user.password_hash) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", details: {} },
    });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", details: {} },
    });
  }

  req.session.user = { id: user.id };

  return res.json({ success: true, data: { userId: user.id }, error: null });
});

authRoutes.get("/me", async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "Login required", details: {} },
    });
  }

  const { rows } = await pool.query(
    `SELECT id, email, name, phone, provider, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return res.json({ success: true, data: rows[0], error: null });
});

authRoutes.post("/logout", async (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("cheongeum.sid");
    res.json({ success: true, data: {}, error: null });
  });
});
