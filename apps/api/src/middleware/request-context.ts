import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../security/logger.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startedAtMs: number;
    }
  }
}

function requestIdFromHeader(value: string | undefined) {
  if (!value) return randomUUID();
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._:-]{8,80}$/.test(trimmed)) return randomUUID();
  return trimmed;
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = requestIdFromHeader(req.header("x-request-id"));
  req.startedAtMs = Date.now();
  res.setHeader("x-request-id", req.requestId);

  res.on("finish", () => {
    logger.info({
      requestId: req.requestId,
      userId: req.user?.id,
      role: req.user?.role,
      action: `HTTP ${req.method} ${req.originalUrl}`,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.startedAtMs
    }, "http_request");
  });

  next();
}
