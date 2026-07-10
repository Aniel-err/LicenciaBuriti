import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { errorToLog, logger } from "../security/logger.js";

type ErrorBody = {
  error: string;
  code: string;
};

type HttpLikeError = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
};

function statusCodeFromError(error: unknown) {
  if (error instanceof ZodError) return 400;
  if (error instanceof multer.MulterError) return 400;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return 409;
    if (error.code === "P2025") return 404;
  }
  if (error instanceof SyntaxError && "body" in error) return 400;
  if (error instanceof Error) {
    const status = (error as HttpLikeError).status ?? (error as HttpLikeError).statusCode;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return 500;
}

function codeFromStatus(status: number) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

function messageFromError(error: unknown, status: number) {
  if (error instanceof ZodError) return "Revise os dados enviados e tente novamente.";
  if (error instanceof multer.MulterError) return "Nao foi possivel processar o arquivo enviado.";
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "Ja existe um registro com essas informacoes.";
    if (error.code === "P2025") return "Registro nao encontrado.";
  }
  if (error instanceof SyntaxError && "body" in error) return "O conteudo enviado nao esta em um formato valido.";

  if (status === 400) return "Revise os dados enviados e tente novamente.";
  if (status === 401) return "Sua sessao expirou. Entre novamente.";
  if (status === 403) return "Voce nao tem permissao para executar esta acao.";
  if (status === 404) return "Nao encontramos o recurso solicitado.";
  if (status === 409) return "Nao foi possivel concluir porque os dados entram em conflito com outro registro.";
  if (status === 413) return "O arquivo ou conteudo enviado e maior que o limite permitido.";
  if (status === 429) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  return "Nao foi possivel concluir a operacao agora. Tente novamente em instantes.";
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ErrorBody = {
    error: "Nao encontramos o recurso solicitado.",
    code: "NOT_FOUND"
  };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const status = statusCodeFromError(error);
  const body: ErrorBody = {
    error: messageFromError(error, status),
    code: codeFromStatus(status)
  };
  logger[status >= 500 ? "error" : "warn"]({
    requestId: req.requestId,
    userId: req.user?.id,
    role: req.user?.role,
    action: `ERROR ${req.method} ${req.originalUrl}`,
    method: req.method,
    path: req.path,
    statusCode: status,
    error: errorToLog(error)
  }, "request_error");
  res.status(status).json(body);
};
