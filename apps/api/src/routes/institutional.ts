import { InstitutionalContentType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../security/audit.js";

const contentSchema = z.object({
  type: z.nativeEnum(InstitutionalContentType),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(500).optional(),
  body: z.string().trim().min(10).max(50000),
  reference: z.string().trim().max(500).optional(),
  publishedAt: z.coerce.date().optional(),
  isPublished: z.boolean().default(true)
});

const newsSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
  publishedAt: z.coerce.date().optional(),
  isPublished: z.boolean().default(true)
});

export const institutionalRouter = Router();
institutionalRouter.use(requireAuth, allowRoles("ADMIN", "ANALISTA"));

institutionalRouter.get("/content", async (_req, res) => {
  const content = await prisma.institutionalContent.findMany({ orderBy: [{ type: "asc" }, { publishedAt: "desc" }] });
  return res.json(content);
});

institutionalRouter.post("/content", async (req, res) => {
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Conteudo institucional invalido", details: parsed.error.flatten() });
  const content = await prisma.institutionalContent.create({ data: parsed.data });
  await recordAudit(req.user, "INSTITUTIONAL_CONTENT_CREATE", "InstitutionalContent", content.id, {
    type: content.type,
    isPublished: content.isPublished
  });
  return res.status(201).json(content);
});

institutionalRouter.patch("/content/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Conteudo institucional invalido", details: parsed.error.flatten() });
  const content = await prisma.institutionalContent.update({ where: { id }, data: parsed.data });
  await recordAudit(req.user, "INSTITUTIONAL_CONTENT_UPDATE", "InstitutionalContent", id, {
    type: content.type,
    isPublished: content.isPublished
  });
  return res.json(content);
});

institutionalRouter.delete("/content/:id", allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  await prisma.institutionalContent.delete({ where: { id } });
  await recordAudit(req.user, "INSTITUTIONAL_CONTENT_DELETE", "InstitutionalContent", id);
  return res.status(204).send();
});

institutionalRouter.get("/news", async (_req, res) => {
  const news = await prisma.news.findMany({ orderBy: { publishedAt: "desc" } });
  return res.json(news);
});

institutionalRouter.post("/news", async (req, res) => {
  const parsed = newsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Noticia invalida", details: parsed.error.flatten() });
  const news = await prisma.news.create({ data: parsed.data });
  await recordAudit(req.user, "NEWS_CREATE", "News", news.id, { isPublished: news.isPublished });
  return res.status(201).json(news);
});

institutionalRouter.patch("/news/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const parsed = newsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Noticia invalida", details: parsed.error.flatten() });
  const news = await prisma.news.update({ where: { id }, data: parsed.data });
  await recordAudit(req.user, "NEWS_UPDATE", "News", id, { isPublished: news.isPublished });
  return res.json(news);
});

institutionalRouter.delete("/news/:id", allowRoles("ADMIN"), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  await prisma.news.delete({ where: { id } });
  await recordAudit(req.user, "NEWS_DELETE", "News", id);
  return res.status(204).send();
});
