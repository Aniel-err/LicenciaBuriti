import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export async function recordAudit(
  user: AuthUser | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: {
      userId: user?.id,
      action,
      entity,
      entityId: entityId ?? undefined,
      metadata
    }
  });
}
