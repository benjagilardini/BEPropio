import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (config.smtpHost) {
      transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPass },
      });
    } else {
      transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }
  return transporter;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  const info = await t.sendMail({
    from: `"Propio" <${config.emailFrom}>`,
    to,
    subject,
    html,
  });

  if (!config.smtpHost) {
    console.log('[EMAIL]', to, subject);
    console.log('[EMAIL BODY]', JSON.parse(info.message).html?.substring(0, 200));
  }
}

// --- Layout ---

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Inter','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Logo -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <span style="font-size:28px;font-weight:700;color:#0d47a1;letter-spacing:-0.5px;">Propio</span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);padding:40px 36px;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9e9e9e;line-height:1.6;">
            Este correo fue enviado por Propio.<br>
            Administración de alquileres simplificada.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto;">
  <tr><td style="border-radius:8px;background-color:#1565c0;">
    <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
      ${label}
    </a>
  </td></tr>
</table>`;
}

function divider(): string {
  return '<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">';
}

function footnote(text: string): string {
  return `<p style="margin:0;font-size:13px;color:#9e9e9e;line-height:1.5;text-align:center;">${text}</p>`;
}

// --- Templates ---

async function sendInvitation(
  to: string,
  tenantName: string,
  landlordName: string,
  unitAddress: string,
  token: string,
): Promise<void> {
  const link = `${config.frontendUrl}/invitation?token=${token}`;

  const html = layout(`
    <p style="margin:0 0 4px;font-size:14px;color:#9e9e9e;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Invitación</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#212121;">Hola ${tenantName}</h1>

    <p style="margin:0 0 16px;font-size:15px;color:#424242;line-height:1.6;">
      <strong>${landlordName}</strong> te invitó a acceder a la información de tu alquiler en <strong>${unitAddress}</strong>.
    </p>

    <p style="margin:0 0 8px;font-size:15px;color:#424242;line-height:1.6;">Desde Propio vas a poder:</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
      <tr><td style="padding:6px 0;font-size:15px;color:#424242;line-height:1.5;">
        <span style="color:#1565c0;margin-right:8px;">✓</span> Ver datos de la unidad y suministros
      </td></tr>
      <tr><td style="padding:6px 0;font-size:15px;color:#424242;line-height:1.5;">
        <span style="color:#1565c0;margin-right:8px;">✓</span> Consultar tu contrato y documento original
      </td></tr>
      <tr><td style="padding:6px 0;font-size:15px;color:#424242;line-height:1.5;">
        <span style="color:#1565c0;margin-right:8px;">✓</span> Conocer la estimación del próximo ajuste
      </td></tr>
      <tr><td style="padding:6px 0;font-size:15px;color:#424242;line-height:1.5;">
        <span style="color:#1565c0;margin-right:8px;">✓</span> Cargar comprobantes de pago
      </td></tr>
      <tr><td style="padding:6px 0;font-size:15px;color:#424242;line-height:1.5;">
        <span style="color:#1565c0;margin-right:8px;">✓</span> Crear reclamos de mantenimiento
      </td></tr>
    </table>

    ${button(link, 'Activar mi cuenta')}
    ${divider()}
    ${footnote('Este enlace expira en 7 días. Si no esperabas este correo, podés ignorarlo.')}
  `);

  await sendMail(to, `${landlordName} te invitó a Propio`, html);
}

async function sendPasswordReset(to: string, token: string): Promise<void> {
  const link = `${config.frontendUrl}/reset-password?token=${token}`;

  const html = layout(`
    <p style="margin:0 0 4px;font-size:14px;color:#9e9e9e;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Seguridad</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#212121;">Restablecer contraseña</h1>

    <p style="margin:0 0 8px;font-size:15px;color:#424242;line-height:1.6;">
      Recibimos un pedido para restablecer la contraseña de tu cuenta. Hacé click en el botón para crear una nueva.
    </p>

    ${button(link, 'Restablecer contraseña')}
    ${divider()}
    ${footnote('Este enlace expira en 1 hora.<br>Si no solicitaste esto, podés ignorar este correo. Tu contraseña no cambiará.')}
  `);

  await sendMail(to, 'Restablecer contraseña — Propio', html);
}

export const emailService = { sendMail, sendInvitation, sendPasswordReset };
