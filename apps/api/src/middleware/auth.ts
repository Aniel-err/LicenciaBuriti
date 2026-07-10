import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { errorToLog, logger } from "../security/logger.js";
import { canRole, type PermissionAction } from "../security/permissions.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "EMPREENDEDOR" | "ANALISTA" | "FISCAL" | "ADMIN";
  entrepreneurId?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type TokenPayload = {
  sub?: string;
  id?: string;
};

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: "8h" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Autenticacao obrigatoria" });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    const userId = decoded.sub ?? decoded.id;
    if (!userId) {
      return res.status(401).json({ error: "Sessao invalida ou expirada" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        entrepreneur: { select: { id: true } }
      }
    });

    if (!user?.isActive) {
      return res.status(401).json({ error: "Sessao invalida ou expirada" });
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role, entrepreneurId: user.entrepreneur?.id ?? null };
    return next();
  } catch (error) {
    logger.warn({
      requestId: req.requestId,
      action: "AUTH_TOKEN_REJECTED",
      method: req.method,
      path: req.path,
      error: errorToLog(error)
    }, "auth_rejected");
    return res.status(401).json({ error: "Sessao invalida ou expirada" });
  }
}

export function allowRoles(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Permissao insuficiente" });
    }

    return next();
  };
}

export function allowPermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !canRole(req.user.role, action)) {
      return res.status(403).json({ error: "Permissao insuficiente" });
    }

    return next();
  };
}
