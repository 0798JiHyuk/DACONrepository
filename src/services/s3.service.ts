import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";

function getRequiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getRequiredEnvAny(names: string[]) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  throw new Error(`Missing env: ${names.join(" or ")}`);
}

function sanitizeFilename(name: string) {
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function buildKey(prefix: string, originalName: string) {
  const safe = sanitizeFilename(originalName || "audio.mp3");
  const date = new Date();
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const ts = Date.now();
  const p = prefix ? prefix.replace(/^\//, "").replace(/\/$/, "") + "/" : "";
  return `${p}${y}/${m}/${d}/${ts}-${safe}`;
}

let cached: S3Client | null = null;

function getClient() {
  if (cached) return cached;
  const region = getRequiredEnv("AWS_REGION");
  cached = new S3Client({
    region,
    credentials: {
      accessKeyId: getRequiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
  return cached;
}

export async function uploadVoiceToS3(file: Express.Multer.File, prefixOverride?: string) {
  const bucket = getRequiredEnvAny(["AWS_S3_BUCKET", "S3_BUCKET"]);
  const prefix = prefixOverride || process.env.AWS_S3_PREFIX || "uploads/voice";
  const key = buildKey(prefix, file.originalname);

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "audio/mpeg",
    })
  );

  const publicBase = process.env.AWS_S3_PUBLIC_BASE_URL;
  const region = process.env.AWS_REGION;
  const url =
    publicBase && publicBase.length > 0
      ? `${publicBase.replace(/\/$/, "")}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return { url, key, bucket };
}

function coerceKeyFromUrlOrKey(input: string, bucket: string) {
  if (!input) return input;
  if (!input.startsWith("http://") && !input.startsWith("https://")) return input;
  try {
    const u = new URL(input);
    let p = u.pathname.replace(/^\//, "");
    if (p.startsWith(`${bucket}/`)) p = p.slice(bucket.length + 1);
    return p;
  } catch {
    return input;
  }
}

export async function getPresignedGetUrl(keyOrUrl: string, expiresSeconds: number) {
  const bucket = getRequiredEnvAny(["AWS_S3_BUCKET", "S3_BUCKET"]);
  const key = coerceKeyFromUrlOrKey(keyOrUrl, bucket);
  const client = getClient();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: expiresSeconds });
}
