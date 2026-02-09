import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth";
import { getPresignedGetUrl, uploadVoiceToS3 } from "../services/s3.service";

export const uploadsRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// GET /api/uploads/presign?key=...&expires=600
uploadsRoutes.get("/presign", requireAuth, async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "BAD_REQUEST", message: "key is required", details: {} },
    });
  }

  const expiresRaw = Number(req.query.expires ?? process.env.AWS_S3_PRESIGN_EXPIRES ?? 600);
  const expiresSeconds = Math.min(600, Math.max(300, expiresRaw));

  try {
    const url = await getPresignedGetUrl(key, expiresSeconds);
    return res.json({
      success: true,
      data: { url, expiresSeconds },
      error: null,
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to build presigned URL";
    return res.status(503).json({
      success: false,
      data: null,
      error: { code: "S3_NOT_CONFIGURED", message: msg, details: {} },
    });
  }
});

const PREFIX_BY_TYPE: Record<string, string> = {
  voice: "uploads/voice",
  records: "uploads/records",
  clones: "uploads/clones",
  shorts: "uploads/shorts",
};

// POST /api/uploads/:type  (type: voice|records|clones|shorts)
uploadsRoutes.post("/:type", requireAuth, upload.single("voiceFile"), async (req, res) => {
  const type = String(req.params.type || "").toLowerCase();
  const prefix = PREFIX_BY_TYPE[type];

  if (!prefix) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "INVALID_TYPE", message: "Unsupported upload type", details: { type } },
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "NO_FILE", message: "voiceFile is required", details: {} },
    });
  }

  try {
    const result = await uploadVoiceToS3(req.file, prefix);
    return res.status(201).json({
      success: true,
      data: {
        url: result.url,
        key: result.key,
        bucket: result.bucket,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
      error: null,
    });
  } catch (err: any) {
    const msg = err?.message || "S3 upload failed";
    return res.status(503).json({
      success: false,
      data: null,
      error: { code: "S3_NOT_CONFIGURED", message: msg, details: {} },
    });
  }
});
