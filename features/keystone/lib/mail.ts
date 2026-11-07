import { createTransport } from "nodemailer";
import { emailButton, emailLayout, emailMuted, emailPanel, emailParagraph } from "./email-layout";

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
  return emailLayout({
    preheader: "Use this link to choose a new password.",
    title: "Reset your password",
    body: `${emailParagraph("We received a request to reset the password for your account. Use the button below to choose a new one.")}
${emailButton("Reset password", url)}
${emailMuted("If you did not request this, you can safely ignore this email. Your password will not change.")}`,
  });
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
      html: emailLayout({
        storeName: details.facilityName,
        preheader: 'We received your appointment request.',
        title: 'We received your appointment request',
        body: `${emailParagraph(`Hi ${escape(details.firstName)}, ${escape(details.facilityName)} received your appointment request. We will contact you to confirm it.`)}
${emailPanel(`Requested time: ${escape(details.whenLabel)}<br>Request number: ${escape(details.appointmentNumber)}`)}
${details.intakeUrl ? emailButton('Complete your intake form', details.intakeUrl) : ''}
${details.manageUrl ? emailMuted(`<a class="em-link" href="${escape(details.manageUrl)}" style="color:#52525b;text-decoration:underline;">View or cancel this visit</a>`) : ''}`,
      }),
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
      html: emailLayout({
        storeName: details.facilityName,
        preheader: details.heading,
        title: details.heading,
        body: `${details.lines.map(line => emailParagraph(escape(line))).join('')}
${manageUrl ? emailButton('View your visit', manageUrl) : ''}`,
      }),
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' }
  }
}

/** Confirms a patient account's email address; visits requested with that email then appear in the account. */
export async function sendAccountConfirmEmail(to: string, details: { name: string; facilityName: string; token: string }): Promise<{ sent: boolean; error?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { sent: false, error: 'not_configured' }
  const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
  let base = ''
  try { base = getBaseUrlForEmails() } catch { return { sent: false, error: 'not_configured' } }
  const url = `${base}/account/confirm#token=${encodeURIComponent(details.token)}`
  try {
    await transport.sendMail({
      to,
      from: process.env.SMTP_FROM,
      subject: `${details.facilityName}: confirm your email`,
      html: emailLayout({
        storeName: details.facilityName,
        preheader: 'Confirm your email address.',
        title: 'Confirm your email',
        body: `${emailParagraph(`Hi ${escape(details.name)}, confirm this address to see your visits in your ${escape(details.facilityName)} account.`)}
${emailButton('Confirm my email', url)}
${emailMuted("This link works for 2 days. If you didn't create an account, ignore this email.")}`,
      }),
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' }
  }
}
