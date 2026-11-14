import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (req) => {
    let db = false;
    try {
      db = await (app as any).db
        .selectNoFrom((eb: any) => eb.lit(1).as("one"))
        .execute()
        .then(() => true)
        .catch(() => false);
    } catch {
      db = false;
    }
    return { ok: true, db, student: (req as any).studentId ?? null };
  });
};
