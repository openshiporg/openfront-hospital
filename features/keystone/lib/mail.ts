import { createTransport } from "nodemailer";

export function getBaseUrlForEmails(): string {
  const configured = String(process.env.SMTP_STORE_LINK || '').trim()
  let url: URL
  try { url = new URL(configured) } catch { throw new Error('Canonical email link URL is not configured') }
  if ((process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error('Canonical email link URL is invalid')
  }
  return url.toString().replace(/\/$/, '')
}

const transport = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function passwordResetEmail({ url }: { url: string }): string {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";

  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string): Promise<void> {
  // Use provided baseUrl or fall back to utility function
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  
  // email the user a token
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      // URL fragments are not sent in HTTP requests or access logs. The reset
      // form reads and immediately removes this fragment in the browser.
      url: `${frontendUrl}/dashboard/reset#token=${encodeURIComponent(resetToken)}`,
    }),
  });
  // Never log transport preview URLs: password-reset tokens are embedded in
  // those URLs. Delivery observability belongs in the mail provider.
  void info
}

/** Receipt for an appointment request. Minimal by design: no clinical detail, no provider, no reason. */
export async function sendAppointmentRequestEmail(
  to: string,
  details: { facilityName: string; firstName: string; appointmentNumber: string; whenLabel: string; intakeUrl: string; manageUrl?: string },
): Promise<{ sent: boolean; error?: string; messageId?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  try {
    const info = await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject: `${details.facilityName}: we received your appointment request`,
      html: `<body style="font-family: Helvetica, Arial, sans-serif; color: #444;"><p>Hi ${escape(details.firstName)}, ${escape(details.facilityName)} received your appointment request. We will contact you to confirm it.</p><p>Requested time: ${escape(details.whenLabel)}<br>Request number: ${escape(details.appointmentNumber)}</p>${details.intakeUrl ? `<p><a href="${escape(details.intakeUrl)}" style="background:#346df1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Complete your intake form</a></p>` : ''}${details.manageUrl ? `<p><a href="${escape(details.manageUrl)}">View or cancel this visit</a></p>` : ''}</body>`,
    });
    return { sent: true, messageId: [String((info as any)?.messageId || ''), String((info as any)?.response || '').slice(0,120)].filter(Boolean).join(' | ') };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' };
  }
}

/** A short service message about one visit (confirmed, cancelled), with the patient's manage link. No clinical detail. */
export async function sendVisitNoticeEmail(
  to: string,
  details: { facilityName: string; heading: string; lines: string[]; manageToken?: string },
): Promise<{ sent: boolean; error?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  let base = ''
  try { base = getBaseUrlForEmails() } catch { base = '' }
  const manageUrl = base && details.manageToken ? `${base}/visit#access=${encodeURIComponent(details.manageToken)}` : ''
  try {
    await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject: `${details.facilityName}: ${details.heading.toLowerCase()}`,
      html: `<body style="font-family: Helvetica, Arial, sans-serif; color: #444;"><h2 style="color:#1d2b3a;">${escape(details.heading)}</h2>${details.lines.map(line => `<p>${escape(line)}</p>`).join('')}${manageUrl ? `<p><a href="${escape(manageUrl)}" style="background:#346df1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">View your visit</a></p>` : ''}</body>`,
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' }
  }
}
