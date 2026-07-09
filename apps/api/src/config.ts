import "dotenv/config";

const insecureJwtSecrets = new Set(["dev-secret", "troque-este-segredo-em-producao", "changeme", "secret"]);
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
  isProduction: process.env.NODE_ENV === "production",
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? (process.env.NODE_ENV === "production" ? 300 : 5000)),
  webOrigins: Array.from(new Set([
    ...(process.env.WEB_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...viteDevOrigins
  ]))
};
