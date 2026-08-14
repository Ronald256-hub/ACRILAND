import type { NextFunction, Request, Response } from "express";

export const requirePermission = (...keys: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return res.status(401).json({ error: "Authentication required." });
  const ok = keys.every((key) => req.auth!.permissions.has(key));
  if (!ok) return res.status(403).json({ error: "You are not authorized to perform this action." });
  next();
};

export const requireAnyPermission = (...keys: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return res.status(401).json({ error: "Authentication required." });
  const ok = keys.some((key) => req.auth!.permissions.has(key));
  if (!ok) return res.status(403).json({ error: "You are not authorized to perform this action." });
  next();
};
