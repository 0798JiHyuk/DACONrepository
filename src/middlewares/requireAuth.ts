import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user?.id) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "Login required", details: {} },
    });
  }
  next();
}
