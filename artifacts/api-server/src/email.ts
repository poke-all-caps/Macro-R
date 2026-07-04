// ── Email notification stubs ──────────────────────────────────────────────
// These functions define the two automated emails in the KYC → License flow:
//   1. "KYC Under Review"      — fired the moment a user submits KYC info
//   2. "Approval + License Key" — fired the moment an admin approves KYC
//
// No SMTP/email provider is wired up yet. Every call is logged to the server
// console in a clearly-labeled block so the full user journey (invite code →
// KYC submit → admin approve → "email" received) can be tested end-to-end
// before a real provider (e.g. Resend, SendGrid, SMTP via nodemailer) is
// connected. To go live, replace the body of `dispatch()` below with a real
// send call — every call site in this file stays the same.

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

async function dispatch(payload: EmailPayload): Promise<void> {
  // TODO: swap this stub for a real provider once one is connected.
  // Example (nodemailer/SMTP):
  //   const transporter = nodemailer.createTransport({ host, port, auth });
  //   await transporter.sendMail({ from: EMAIL_FROM, ...payload });
  console.log(
    `\n[EMAIL STUB] ─────────────────────────────────────────\n` +
      `To:      ${payload.to}\n` +
      `Subject: ${payload.subject}\n` +
      `---\n${payload.body}\n` +
      `───────────────────────────────────────────────────────\n`,
  );
}

export async function sendKycUnderReviewEmail(to: string, fullName: string): Promise<void> {
  if (!to) return;
  await dispatch({
    to,
    subject: "Your KYC submission is under review",
    body:
      `Hi ${fullName},\n\n` +
      `Thanks for submitting your identity verification. Our team is reviewing your ` +
      `information now — this usually takes a short while.\n\n` +
      `You'll receive another email with your license key as soon as you're approved.\n\n` +
      `— Macro Rewards`,
  });
}

export async function sendKycApprovedEmail(params: {
  to: string;
  fullName: string;
  licenseKey: string;
  keyType: string;
  maxAccounts: number;
  expiresAt: Date;
}): Promise<void> {
  const { to, fullName, licenseKey, keyType, maxAccounts, expiresAt } = params;
  if (!to) return;
  await dispatch({
    to,
    subject: "You're approved — here's your license key",
    body:
      `Hi ${fullName},\n\n` +
      `Great news — your identity verification has been approved!\n\n` +
      `Your license key: ${licenseKey}\n` +
      `Plan: ${keyType}\n` +
      `Account slots: ${maxAccounts}\n` +
      `Expires: ${expiresAt.toDateString()}\n\n` +
      `Enter this key in the app to get started.\n\n` +
      `— Macro Rewards`,
  });
}

export async function sendKycRejectedEmail(params: {
  to: string;
  fullName: string;
  adminNote?: string | null;
}): Promise<void> {
  const { to, fullName, adminNote } = params;
  if (!to) return;
  await dispatch({
    to,
    subject: "Update on your KYC submission",
    body:
      `Hi ${fullName},\n\n` +
      `Unfortunately we were unable to verify your submission.\n` +
      (adminNote ? `Reason: ${adminNote}\n\n` : "\n") +
      `Please contact support or submit a new invite code to try again.\n\n` +
      `— Macro Rewards`,
  });
}
