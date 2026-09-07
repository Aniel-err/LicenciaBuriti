import "dotenv/config";

const insecureJwtSecrets = new Set(["dev-secret", "troque-este-segredo-em-producao", "changeme", "secret"]);
const isProduction = process.env.NODE_ENV === "production";
const viteDevOrigins = [5173, 5174, 5175, 5176, 5177, 5178, 5179].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`
]);

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || insecureJwtSecrets.has(secret)) {
    throw new Error("JWT_SECRET deve ser definido com pelo menos 32 caracteres e nao pode usar valores padrao.");
  }
  return secret;
}

export const config = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: requireJwtSecret(),
  isProduction,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? (isProduction ? 300 : 5000)),
  appUrl: process.env.APP_URL?.trim() || (isProduction ? "" : "http://localhost:5173"),
  smtp: {
    host: process.env.SMTP_HOST?.trim() || "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM?.trim() || "Licenca Buriti <nao-responda@buriti.ma.gov.br>"
  },
  passwordResetMinutes: Number(process.env.PASSWORD_RESET_MINUTES ?? 30),
  notificationSweepMinutes: Math.max(5, Number(process.env.NOTIFICATION_SWEEP_MINUTES ?? 360)),
  documentSigningSecret: process.env.DOCUMENT_SIGNING_SECRET?.trim() || "",
  webOrigins: (() => {
    const origins = Array.from(new Set([
      ...(process.env.WEB_ORIGIN ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...(isProduction ? [] : viteDevOrigins)
    ]));
    if (isProduction && origins.length === 0) {
      throw new Error("WEB_ORIGIN deve ser definido em producao.");
    }
    return origins;
  })()
};
