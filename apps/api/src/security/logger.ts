import pino from "pino";

const sensitiveKeys = new Set([
  "authorization",
  "cpf",
  "cnpj",
  "email",
  "filePath",
  "jwt",
  "password",
  "passwordHash",
  "phone",
  "senha",
  "telefone",
  "token"
]);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[MaxDepth]";
  if (Array.isArray(value)) return value.map((item) => sanitizeLogData(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      if (entry === undefined) return [];
      if (sensitiveKeys.has(key.toLowerCase())) return [[key, "[Redacted]"]];
      return [[key, sanitizeLogData(entry, depth + 1)]];
    })
  );
}

export function errorToLog(error: unknown) {
  if (!(error instanceof Error)) return { error: sanitizeLogData(error) };
  const coded = error as Error & { code?: string; status?: number; statusCode?: number };
  return sanitizeLogData({
    name: error.name,
    message: error.message,
    code: coded.code,
    status: coded.status ?? coded.statusCode
  });
}
