/**
 * Email transport. One entry point: sendEmail().
 *
 * - With RESEND_API_KEY set, delivers through Resend's REST API (free tier —
 *   no SDK dependency needed).
 * - Without it, the full email is logged to the server console instead, and
 *   nothing fails. Same on any API/network error: log, don't throw. Email is
 *   a nice-to-have; it must never break the request that triggered it.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  /** "resend" when actually delivered; "console" when logged locally. */
  delivered: "resend" | "console";
  id?: string;
  error?: string;
}

/** Resend's shared testing sender — works before any domain is verified. */
const DEFAULT_FROM = "Till Payday <onboarding@resend.dev>";

function logToConsole(msg: EmailMessage, reason: string): void {
  console.log(
    [
      `📧 [email → console] ${reason}`,
      `From: ${process.env.RESEND_FROM ?? DEFAULT_FROM}`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      "── text body ──",
      msg.text,
      "───────────────",
    ].join("\n"),
  );
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logToConsole(msg, "RESEND_API_KEY not set — logging instead of sending");
    return { delivered: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      logToConsole(msg, `Resend rejected the send (${res.status}: ${error})`);
      return { delivered: "console", error };
    }

    const data = (await res.json()) as { id?: string };
    return { delivered: "resend", id: data.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logToConsole(msg, `network error talking to Resend (${error})`);
    return { delivered: "console", error };
  }
}
