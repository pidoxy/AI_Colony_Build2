import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createDb } from "@crs/db";
import { PolicyLoader } from "@crs/policy";
import type { Config } from "@crs/config";
import { registerAuth } from "./auth.js";
import { roomRoutes } from "./routes/rooms.js";
import { bookingRoutes } from "./routes/bookings.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setErrorHandler((err: unknown, _req, reply) => {
    app.log.error(err);
    const message = err instanceof Error ? err.message : String(err);
    if (reply.statusCode && reply.statusCode < 500) {
      return reply.send({ error: { code: "BAD_REQUEST", message } });
    }
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "internal server error" } });
  });

  app.register(cors, { origin: config.CORS_ORIGINS });

  const db = createDb(config.DATABASE_URL);
  const policyLoader = new PolicyLoader(db);
  app.decorate("db", db);
  app.decorate("policy", policyLoader);

  app.register(registerAuth(config));
  app.register(healthRoutes);
  app.register(roomRoutes, { prefix: "/rooms" });
  app.register(bookingRoutes);

  return app;
}
