import { ConditionStatus, NotificationType, ProcessStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../security/logger.js";

const closedStatuses: ProcessStatus[] = [
  ProcessStatus.DEFERIDO,
  ProcessStatus.INDEFERIDO,
  ProcessStatus.ARQUIVADO
];

type Target = { id: string };

type NoticeInput = {
  users: Target[];
  processId?: string;
  conditionId?: string;
  type: NotificationType;
  title: string;
  message: string;
  dueAt?: Date | null;
  key: string;
};

function recipients(...groups: Array<Array<Target | null | undefined>>) {
  return [...new Map(
    groups.flat().filter((item): item is Target => Boolean(item?.id)).map((item) => [item.id, item])
  ).values()];
}

function noticesFor(input: NoticeInput): Prisma.NotificationCreateManyInput[] {
  return input.users.map((user) => ({
    userId: user.id,
    processId: input.processId,
    conditionId: input.conditionId,
    type: input.type,
    title: input.title,
    message: input.message,
    dueAt: input.dueAt ?? undefined,
    dedupeKey: `${user.id}:${input.key}`
  }));
}

export async function sweepNotifications() {
  const now = new Date();
  const settings = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  const alertDays = settings?.expirationAlertDays ?? 45;
  const alertLimit = new Date(now);
  alertLimit.setDate(alertLimit.getDate() + alertDays);

  const expiredConditions = await prisma.condition.updateMany({
    where: {
      dueDate: { lt: now },
      status: { in: [ConditionStatus.PENDENTE, ConditionStatus.EM_CUMPRIMENTO] }
    },
    data: { status: ConditionStatus.VENCIDA }
  });

  const [admins, processes, conditions, licenses, documentPendencies] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } }),
    prisma.process.findMany({
      where: { dueDate: { lte: alertLimit }, status: { notIn: closedStatuses } },
      select: {
        id: true,
        number: true,
        dueDate: true,
        analyst: { select: { id: true } },
        entrepreneur: { select: { user: { select: { id: true } } } }
      }
    }),
    prisma.condition.findMany({
      where: { dueDate: { lte: alertLimit }, status: { not: ConditionStatus.CUMPRIDA } },
      select: {
        id: true,
        description: true,
        dueDate: true,
        process: {
          select: {
            id: true,
            number: true,
            analyst: { select: { id: true } },
            entrepreneur: { select: { user: { select: { id: true } } } }
          }
        }
      }
    }),
    prisma.issuedDocument.findMany({
      where: { validUntil: { not: null, lte: alertLimit } },
      select: {
        id: true,
        number: true,
        validUntil: true,
        process: {
          select: {
            id: true,
            number: true,
            analyst: { select: { id: true } },
            entrepreneur: { select: { user: { select: { id: true } } } }
          }
        }
      }
    }),
    prisma.process.findMany({
      where: {
        status: ProcessStatus.AGUARDANDO_DOCUMENTOS,
        documents: { some: { status: { in: ["PENDENTE", "RECUSADO"] } } }
      },
      select: {
        id: true,
        number: true,
        analyst: { select: { id: true } },
        entrepreneur: { select: { user: { select: { id: true } } } },
        documents: {
          where: { status: { in: ["PENDENTE", "RECUSADO"] } },
          select: { id: true, name: true, status: true }
        }
      }
    })
  ]);

  const payload: Prisma.NotificationCreateManyInput[] = [];

  for (const process of processes) {
    const expired = process.dueDate < now;
    payload.push(...noticesFor({
      users: recipients([process.analyst, process.entrepreneur.user], admins),
      processId: process.id,
      type: NotificationType.PRAZO_PROCESSO,
      title: expired ? "Prazo de processo vencido" : "Prazo de processo próximo",
      message: `O processo ${process.number} ${expired ? "ultrapassou" : "está próximo de"} seu prazo de análise.`,
      dueAt: process.dueDate,
      key: `process:${process.id}:${expired ? "expired" : "due"}`
    }));
  }

  for (const condition of conditions) {
    const expired = condition.dueDate < now;
    payload.push(...noticesFor({
      users: recipients([condition.process.analyst, condition.process.entrepreneur.user], admins),
      processId: condition.process.id,
      conditionId: condition.id,
      type: NotificationType.CONDICIONANTE,
      title: expired ? "Condicionante vencida" : "Condicionante próxima do prazo",
      message: `${condition.process.number}: ${condition.description}`,
      dueAt: condition.dueDate,
      key: `condition:${condition.id}:${expired ? "expired" : "due"}`
    }));
  }

  for (const license of licenses) {
    const validUntil = license.validUntil as Date;
    const expired = validUntil < now;
    payload.push(...noticesFor({
      users: recipients([license.process.analyst, license.process.entrepreneur.user], admins),
      processId: license.process.id,
      type: NotificationType.LICENCA,
      title: expired ? "Licença vencida" : "Licença próxima do vencimento",
      message: `O documento ${license.number}, do processo ${license.process.number}, ${expired ? "está vencido" : "deve ser renovado dentro do prazo"}.`,
      dueAt: validUntil,
      key: `license:${license.id}:${expired ? "expired" : "due"}`
    }));
  }

  for (const process of documentPendencies) {
    for (const document of process.documents) {
      payload.push(...noticesFor({
        users: recipients([process.analyst, process.entrepreneur.user]),
        processId: process.id,
        type: NotificationType.DOCUMENTO,
        title: document.status === "RECUSADO" ? "Documento precisa ser corrigido" : "Documento pendente",
        message: `${process.number}: ${document.name}.`,
        key: `document:${document.id}:${document.status.toLowerCase()}`
      }));
    }
  }

  const result = payload.length
    ? await prisma.notification.createMany({ data: payload, skipDuplicates: true })
    : { count: 0 };

  logger.info({
    action: "NOTIFICATION_SWEEP",
    created: result.count,
    conditionsMarkedExpired: expiredConditions.count,
    evaluated: payload.length
  }, "notification_sweep_completed");

  return {
    created: result.count,
    conditionsMarkedExpired: expiredConditions.count,
    evaluated: payload.length
  };
}
