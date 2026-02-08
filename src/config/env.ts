import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: process.env.SESSION_SECRET!,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};

for (const [k, v] of Object.entries(env)) {
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing env: ${k}`);
  }
}
