// Sends transactional email (password-reset codes) through Resend's HTTP API.
// Set RESEND_API_KEY and EMAIL_FROM. Without them, emails are printed to the
// server log instead, which is fine for local testing only.

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not set; not sending. To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider returned HTTP ${res.status}. ${detail.slice(0, 300)}`);
  }
}
