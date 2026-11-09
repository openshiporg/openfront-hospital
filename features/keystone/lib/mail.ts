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
