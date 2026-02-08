import { Request, Response, NextFunction } from "express";

export function validate(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "Invalid body", details: parsed.error.flatten() },
      });
    }
    req.body = parsed.data;
    next();
  };
}
