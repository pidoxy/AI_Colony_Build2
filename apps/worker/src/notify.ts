import type { Db } from "@crs/db";
import type { Config } from "@crs/config";

/**
 * R18: Downtime announcement and banner.
 */
export const announcementRoutes: any = async (app: any) => {
  app.get("/", async () => {
    const now = new Date();
    return await app.db
      .selectFrom("announcements")
      .selectAll()
      .where("starts_at", "<=", now)
      .where("ends_at", ">=", now)
      .execute();
  });
};

/**
 * Worker-side notification dispatcher implementation.
 */
export async function runDispatcher(db: Db, config: Config): Promise<number> {
  const now = new Date();
  const due = await db
    .selectFrom("notifications")
    .select(["notification_id", "student_id", "booking_id", "type", "attempts"])
    .where("sent_at", "is", null)
    .where("send_at", "<=", now)
    .orderBy("send_at")
    .limit(100)
    .forUpdate()
    .skipLocked()
    .execute();

  let sent = 0;
  for (const n of due) {
    try {
      // In production: switch on `config.NOTIFICATION_ADAPTER`
      // For this skeleton: console log (adapter interface)
      console.log(`[notify:${config.NOTIFICATION_ADAPTER}] ${n.type} → student ${n.student_id}`);
      
      await db
        .updateTable("notifications")
        .set({ sent_at: now })
        .where("notification_id", "=", n.notification_id)
        .execute();
      sent++;
    } catch {
      await db
        .updateTable("notifications")
        .set({ attempts: n.attempts + 1 })
        .where("notification_id", "=", n.notification_id)
        .execute();
    }
  }
  return sent;
}
