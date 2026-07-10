import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { sanitizeLogData } from "./logger.js";

type AuditContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

export function auditContext(req: Request, before?: Prisma.InputJsonValue, after?: Prisma.InputJsonValue): AuditContext {
  return {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.header("user-agent") ?? undefined,
    before,
    after
  };
}

export async function recordAudit(
  user: AuthUser | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  metadata?: Prisma.InputJsonValue,
  context?: AuditContext
) {
  await prisma.auditLog.create({
    data: {
      userId: user?.id,
      requestId: context?.requestId,
      action,
      entity,
      entityId: entityId ?? undefined,
      ip: context?.ip,
      userAgent: context?.userAgent,
      metadata: metadata ? sanitizeLogData(metadata) as Prisma.InputJsonValue : undefined,
      before: context?.before ? sanitizeLogData(context.before) as Prisma.InputJsonValue : undefined,
      after: context?.after ? sanitizeLogData(context.after) as Prisma.InputJsonValue : undefined
    }
  });
}
