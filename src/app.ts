import express from "express";
import cors from "cors";
import session from "express-session";
import { env } from "./config/env";
import { routes } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );

  app.use(
    session({
      name: "cheongeum.sid",
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.nodeEnv === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24,
      },
    })
  );

  app.use("/api", routes);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use(errorHandler);

  return app;
}
