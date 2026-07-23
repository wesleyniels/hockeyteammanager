// Talks to Resend's plain HTTP API directly instead of pulling in their SDK
// — this project's deploy pipeline can't run `pnpm install` unattended, so
// avoiding new dependencies avoids a lockfile-mismatch build failure.
export async function sendVerificationEmail(to: string, name: string | null, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error('Resend is not configured (RESEND_API_KEY / EMAIL_FROM)')

  const greeting = name ? `Hoi ${name},` : 'Hoi,'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1A2F6B;">
      <h1 style="color: #0D2B7A; font-size: 20px; margin: 0 0 16px;">Hockey One</h1>
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Bevestig je e-mailadres — Hockey One', html }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend request failed (${res.status}): ${body}`)
  }
}
