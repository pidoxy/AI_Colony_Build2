import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Config } from "@crs/config";
import type { Db } from "@crs/db";
import type { PolicyLoader } from "@crs/policy";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    policy: PolicyLoader;
  }
  interface FastifyRequest {
    studentId: string;
  }
}

/**
 * Authentication (A1). The SSO token carries the student id; the service
 * trusts it and never accepts one from the request body.
 *
 * dev  — token is an unsigned JSON: {"student":{"sub":"s123", ...}}
 * sso  — token verified against the IdP's JWKS (config-dependent).
 */
export function registerAuth(config: Config): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.decorateRequest("studentId", "");
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/health")) return;

      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return reply
          .status(401)
          .send({ error: { code: "UNAUTHENTICATED", message: "missing bearer token" } });
      }
      try {
        const id = config.AUTH_MODE === "dev"
          ? parseDevToken(header.slice(7))
          : await verifySsoToken(header.slice(7), config);
        req.studentId = id;
      } catch {
        return reply
          .status(401)
          .send({ error: { code: "UNAUTHENTICATED", message: "invalid token" } });
      }
    });
  };
}

function parseDevToken(raw: string): string {
  const parsed = JSON.parse(raw) as { student?: { sub?: string } };
  const sub = parsed.student?.sub;
  if (!sub) throw new Error("dev token must contain student.sub");
  return sub;
}

async function verifySsoToken(_raw: string, _config: Config): Promise<string> {
  // TODO: verify the OIDC id_token against SSO_JWKS_URI and return its `sub`.
  throw new Error("sso auth not yet implemented");
}

// keep FastifyRequest import used
export type _Req = FastifyRequest;
