import { Resend } from "resend";
import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import { renderJudgmentReadyEmail } from "./email";
import { getSetting } from "./settings";
import { nowIso } from "./time";

export type NotificationSender = {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
};

export function createResendSender(db: SqliteDatabase): NotificationSender {
  return {
    async send(input) {
      const apiKey = getSetting(db, "resend_api_key");
      const fromName = getSetting(db, "email_from_name");
      const fromAddress = getSetting(db, "email_from_address");
      const legacyFrom = getSetting(db, "email_from");
      const from =
        fromName && fromAddress ? `${fromName} <${fromAddress}>` : legacyFrom;
      if (!apiKey || !from) {
        return;
      }

      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
    },
  };
}

export async function sendReadyNotifications(
  db: SqliteDatabase,
  jobId: string,
  sender: NotificationSender = createResendSender(db),
) {
  const rows = db
    .prepare<
      [string],
      {
        id: string;
        judgment_id: string;
        email: string;
        title: string;
        case_number: string;
      }
    >(
      `SELECT notifications.id,
        notifications.judgment_id,
        notifications.email,
        judgments.title,
        judgments.case_number
      FROM notifications
      JOIN judgments ON judgments.id = notifications.judgment_id
      WHERE notifications.job_id = ?
        AND notifications.status = 'pending'
        AND notifications.type = 'generation_ready'`,
    )
    .all(jobId);

  for (const row of rows) {
    const email = renderJudgmentReadyEmail({
      serviceName: getSetting(db, "service_name") ?? "EasyLaw",
      caseNumber: row.case_number,
      title: row.title,
    });
    await sender.send({
      to: row.email,
      subject: `[EasyLaw] ${row.title} Easy-Read 판결문 생성 완료`,
      html: email.html,
      text: email.text,
    });
    db.prepare(
      "UPDATE notifications SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'",
    ).run(nowIso(), row.id);
    auditLog(db, {
      action: "notification.sent",
      targetType: "notification",
      targetId: row.id,
      metadata: { jobId, email: row.email },
    });
  }

  return rows.length;
}
