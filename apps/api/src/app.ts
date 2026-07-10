import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { catalogRouter } from "./routes/catalog.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { documentsRouter } from "./routes/documents.js";
import { documentTemplatesRouter } from "./routes/document-templates.js";
import { enterprisesRouter } from "./routes/enterprises.js";
import { entrepreneursRouter } from "./routes/entrepreneurs.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { officialDocumentsRouter } from "./routes/official-documents.js";
import { processesRouter } from "./routes/processes.js";
import { publicRouter } from "./routes/public.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { requestContext } from "./middleware/request-context.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.webOrigins }));
app.use(requestContext);
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  handler: (_req, res) => {
    res.status(429).json({
      error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
      code: "RATE_LIMITED"
    });
  }
}));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/dashboard", dashboardRouter);
app.use("/processes", processesRouter);
app.use("/entrepreneurs", entrepreneursRouter);
app.use("/enterprises", enterprisesRouter);
app.use("/inspections", inspectionsRouter);
app.use("/documents", documentsRouter);
app.use("/document-templates", documentTemplatesRouter);
app.use("/official-documents", officialDocumentsRouter);
app.use("/catalog", catalogRouter);
app.use("/public", publicRouter);
app.use("/reports", reportsRouter);
app.use("/settings", settingsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
