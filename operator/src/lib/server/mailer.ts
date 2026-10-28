import nodemailer from "nodemailer";

export async function sendViaGmail(opts: {
  user: string;
  pass: string;
  to: string;
  subject: string;
  body: string;
}) {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: opts.user, pass: opts.pass },
  });
  const info = await transport.sendMail({
    from: opts.user,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });
  return { messageId: info.messageId || "", accepted: info.accepted.map(String) };
}
