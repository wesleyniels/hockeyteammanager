import nodemailer from 'nodemailer'

// Switched from Resend's HTTP API to TransIP's own mailbox over SMTP —
// Resend (via Amazon SES) couldn't reliably reach TransIP-hosted addresses,
// most likely because TransIP blocks/rate-limits connections from SES's
// shared IP range. Sending through the mailbox itself sidesteps that
// entirely. Port 465 is implicit TLS (`secure: true`), not STARTTLS.
const SMTP_HOST = 'smtp.transip.email'
const SMTP_PORT = 465

// Fixed rather than derived from a request's Host header — createNotification
// (notifications.ts) and the release-note broadcast (db.ts's
// announceReleaseIfNeeded) fire from many call sites, several with no
// request object at all to read an origin from. Same reasoning as the
// hardcoded admin@hockeyone.nl elsewhere in this codebase.
const APP_URL = 'https://app.hockeyone.nl'

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

// A handful of call sites (release-note broadcasts, admin announcements)
// email every registered user at once — this is a shared personal/business
// mailbox, not a bulk-mail service, so firing dozens of sends at the same
// instant risks the provider rate-limiting or spam-flagging it, which would
// also break delivery of password-reset/verification emails. Every send
// funnels through here and waits for a free slot instead, so no caller
// needs to remember to throttle itself.
const MAX_CONCURRENT_SENDS = 5
let activeSends = 0
async function withSendSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (activeSends >= MAX_CONCURRENT_SENDS) {
    await new Promise(r => setTimeout(r, 50))
  }
  activeSends++
  try {
    return await fn()
  } finally {
    activeSends--
  }
}

async function sendMail(to: string | string[], subject: string, html: string) {
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM is not configured')
  await withSendSlot(() => getTransporter().sendMail({ from, to, subject, html }))
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

export function escapeHtml(s: string): string {
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

// Mirrors renderFormattedText/renderInlineFormatting in src/App.tsx — the
// same **bold**/_italic_/"- " bullet lite-markdown notification bodies and
// release notes are written in — but emits an HTML string for email instead
// of React nodes. Escapes first so a body can't inject raw HTML.
function formatNotificationBodyHtml(body: string): string {
  const inline = (s: string) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
  const blocks: string[] = []
  let listItems: string[] = []
  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push(`<ul style="margin: 0 0 12px; padding-left: 20px;">${listItems.map(i => `<li style="margin-bottom: 4px; font-size: 14px; line-height: 1.6;">${inline(i)}</li>`).join('')}</ul>`)
    listItems = []
  }
  for (const line of body.split('\n')) {
    if (line.startsWith('- ')) { listItems.push(line.slice(2)); continue }
    flushList()
    if (line.trim() === '') continue
    blocks.push(`<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">${inline(line)}</p>`)
  }
  flushList()
  return blocks.join('')
}

// Sent alongside every in-app Meldingen notification (see createNotification
// in notifications.ts and the release-note broadcast in db.ts) — same
// content, plus a link back into the app. There's no dedicated
// notification-detail page (notifications only ever live in the bell
// dropdown), so the link is handled client-side: App.tsx reads
// ?notification=<id> on load, marks it read, and jumps to Wedstrijden if it
// points at a game — the same thing tapping it in the dropdown already does.
export async function sendNotificationEmail(to: string, name: string | null, body: string, notificationId: string) {
  const greeting = name ? `Hoi ${name},` : 'Hoi,'
  const link = `${APP_URL}/?notification=${notificationId}`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1A2F6B;">
      <img src="${APP_URL}/hockey-one-splash.png" alt="Hockey One" width="120" style="display: block; width: 120px; margin: 0 0 20px; border-radius: 12px;" />
      <p style="font-size: 14px; line-height: 1.6;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.6; font-weight: bold;">Nieuwe melding</p>
      ${formatNotificationBodyHtml(body)}
      <p style="margin: 28px 0;">
        <a href="${link}" style="background: #1A3FAB; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
          Bekijk in Hockey One
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #7B90C8;">
        Werkt de knop niet? Kopieer deze link: <br />
        <a href="${link}" style="color: #1A3FAB;">${link}</a>
      </p>
    </div>
  `
  await sendMail(to, 'Nieuwe melding — Hockey One', html)
}
