import nodemailer from "nodemailer";
import { config } from "../config.js";

function smtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

export async function sendPasswordResetEmail(recipient: string, recipientName: string, token: string) {
  if (!smtpConfigured()) return false;
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });
  const resetUrl = `${config.appUrl.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    subject: "Redefinicao de senha - Licenca Buriti",
    text: [
      `Ola, ${recipientName}.`,
      "",
      "Foi solicitada a redefinicao da senha da sua conta no Licenca Buriti.",
      `Acesse o endereco abaixo em ate ${config.passwordResetMinutes} minutos:`,
      resetUrl,
      "",
      "Se voce nao fez essa solicitacao, ignore esta mensagem."
    ].join("\n"),
    html: `<p>Olá, ${escapeHtml(recipientName)}.</p><p>Foi solicitada a redefinição da senha da sua conta no Licença Buriti.</p><p><a href="${escapeHtml(resetUrl)}">Redefinir senha</a></p><p>O link expira em ${config.passwordResetMinutes} minutos. Se você não fez essa solicitação, ignore esta mensagem.</p>`
  });
  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
