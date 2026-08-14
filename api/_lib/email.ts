import nodemailer from 'nodemailer'

// Switched from Resend's HTTP API to TransIP's own mailbox over SMTP —
// Resend (via Amazon SES) couldn't reliably reach TransIP-hosted addresses,
// most likely because TransIP blocks/rate-limits connections from SES's
// shared IP range. Sending through the mailbox itself sidesteps that
// entirely. Port 465 is implicit TLS (`secure: true`), not STARTTLS.
const SMTP_HOST = 'smtp.transip.email'
const SMTP_PORT = 465

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

// Memoized per warm serverless instance, same reasoning as ensureSchema() in
// db.ts — env vars don't change during a running instance's lifetime, so
// there's no reason to rebuild the transport (and reconnect) on every send.
function getTransporter() {
  if (transporter) return transporter
  const user = process.env.SMTP_USER || process.env.EMAIL_FROM
  const pass = process.env.SMTP_PASSWORD
  if (!user || !pass) throw new Error('SMTP is not configured (SMTP_USER / SMTP_PASSWORD)')
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user, pass },
  })
  return transporter
}

async function sendMail(to: string | string[], subject: string, html: string) {
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM is not configured')
  await getTransporter().sendMail({ from, to, subject, html })
}

export async function sendVerificationEmail(to: string, name: string | null, verifyUrl: string, origin: string) {
  const greeting = name ? `Hoi ${name},` : 'Hoi,'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1A2F6B;">
      <img src="${origin}/hockey-one-splash.png" alt="Hockey One" width="120" style="display: block; width: 120px; margin: 0 0 20px; border-radius: 12px;" />
      <p style="font-size: 14px; line-height: 1.6;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.6;">Bevestig je e-mailadres om je account te activeren.</p>
      <p style="margin: 28px 0;">
        <a href="${verifyUrl}" style="background: #1A3FAB; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
          E-mailadres bevestigen
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #7B90C8;">
        Werkt de knop niet? Kopieer deze link: <br />
        <a href="${verifyUrl}" style="color: #1A3FAB;">${verifyUrl}</a>
      </p>
      <p style="font-size: 12px; color: #A8BEF0; margin-top: 24px;">Deze link verloopt over 24 uur.</p>
    </div>
  `
  await sendMail(to, 'Bevestig je e-mailadres — Hockey One', html)
}

export async function sendPasswordResetEmail(to: string, name: string | null, resetUrl: string, origin: string) {
  const greeting = name ? `Hoi ${name},` : 'Hoi,'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1A2F6B;">
      <img src="${origin}/hockey-one-splash.png" alt="Hockey One" width="120" style="display: block; width: 120px; margin: 0 0 20px; border-radius: 12px;" />
      <p style="font-size: 14px; line-height: 1.6;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.6;">Klik op de knop hieronder om een nieuw wachtwoord in te stellen.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="background: #1A3FAB; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
          Nieuw wachtwoord instellen
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #7B90C8;">
        Werkt de knop niet? Kopieer deze link: <br />
        <a href="${resetUrl}" style="color: #1A3FAB;">${resetUrl}</a>
      </p>
      <p style="font-size: 12px; color: #A8BEF0; margin-top: 24px;">Deze link verloopt over 1 uur. Niets aangevraagd? Dan kun je deze e-mail negeren.</p>
    </div>
  `
  await sendMail(to, 'Wachtwoord opnieuw instellen — Hockey One', html)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Fired off best-effort whenever a new account is created (password
// registration or first-time Google sign-in) — name/email come from the new
// user, hence the escaping, since they end up straight in the admins' inbox.
export async function sendNewRegistrationEmail(adminEmails: string[], newUserEmail: string, newUserName: string | null) {
  if (adminEmails.length === 0) return

  const who = newUserName ? `${escapeHtml(newUserName)} (${escapeHtml(newUserEmail)})` : escapeHtml(newUserEmail)
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1A2F6B;">
      <h1 style="color: #0D2B7A; font-size: 20px; margin: 0 0 16px;">Hockey One</h1>
      <p style="font-size: 14px; line-height: 1.6;">Er heeft zich een nieuw account geregistreerd:</p>
      <p style="font-size: 14px; line-height: 1.6; font-weight: bold;">${who}</p>
    </div>
  `
  await sendMail(adminEmails, 'Nieuwe registratie — Hockey One', html)
}
