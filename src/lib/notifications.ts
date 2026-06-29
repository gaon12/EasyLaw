import { Resend } from "resend";
import { auditLog } from "./audit";
import type { SqliteDatabase } from "./db";
import { nowIso } from "./time";

export type NotificationSender = {
  send(input: { to: string; subject: string; text: string }): Promise<void>;
};

export function createResendSender(): NotificationSender {
  return {
    async send(input) {
      if (!process.env.RESEND_API_KEY) {
        return;
      }

      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "EasyLaw <notify@easylaw.local>",
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
    },
  };
}

export async function sendReadyNotifications(
  db: SqliteDatabase,
  jobId: string,
  sender: NotificationSender = createResendSender(),
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
    await sender.send({
      to: row.email,
      subject: `[EasyLaw] ${row.title} Easy-Read 판결문 생성 완료`,
      text: `${row.case_number} ${row.title}의 Easy-Read 판결문이 준비되었습니다.`,
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
