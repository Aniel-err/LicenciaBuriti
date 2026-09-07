import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { sweepNotifications } from "../notifications/sweep.js";
import { auditContext, recordAudit } from "../security/audit.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const unreadOnly = req.query.unread === "true";
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 100
  });
  return res.json(notifications);
});

notificationsRouter.patch("/read-all", async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true }
  });
  await recordAudit(req.user, "NOTIFICATION_READ_ALL", "Notification", null, { count: result.count }, auditContext(req));
  return res.json({ updated: result.count });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const notification = await prisma.notification.findFirst({ where: { id, userId: req.user!.id } });
  if (!notification) return res.status(404).json({ error: "Notificação não encontrada" });
  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
  return res.json(updated);
});

notificationsRouter.post("/sweep", allowRoles("ADMIN"), async (req, res) => {
  const result = await sweepNotifications();
  await recordAudit(req.user, "NOTIFICATION_SWEEP", "Notification", null, result, auditContext(req));
  return res.json(result);
});
