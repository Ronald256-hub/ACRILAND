import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import multer from "multer";
import { BusinessRuleError } from "../domain/rules.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof BusinessRuleError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: "Validation failed.", details: err.flatten() });
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Profile photo is larger than the configured upload limit." });
    return res.status(400).json({ error: "Unable to process the uploaded file." });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ error: "A record with one of these unique values already exists." });
  }
  console.error(err);
  return res.status(500).json({ error: "Unable to complete the request. The technical error has been logged." });
}
