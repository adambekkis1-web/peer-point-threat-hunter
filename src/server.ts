import { getAgentByName, routeAgentRequest } from "agents";

import { ThreatHunterAgent } from "./agent/agent.js";
import { isLocalRequest, json } from "./shared/http.js";
import { parseSmokeRequest } from "./shared/smoke.js";

export { ThreatHunterAgent };

export default {
  async fetch(request, env): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, service: "threat-hunter", environment: env.ENVIRONMENT });
    }

    if (request.method === "GET" && url.pathname === "/api/dependencies") {
      try {
        const response = await fetch(new URL("/health", env.LOG_API_URL), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(5_000),
        });
        return json({ ok: response.ok, logApi: response.status }, response.ok ? 200 : 503);
      } catch {
        return json({ ok: false, logApi: 0 }, 503);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/smoke" && isLocalRequest(request)) {
      try {
        const { input } = await parseSmokeRequest(request);
        const agent = await getAgentByName(
          env.THREAT_HUNTER_AGENT,
          `acceptance-${crypto.randomUUID()}`,
        );
        const result = await Promise.resolve(agent.runSmokeTurn(input));
        const state = await Promise.resolve(agent.getDashboardState());
        return json({ result, state });
      } catch {
        return json(
          { ok: false, error: { code: "SMOKE_REJECTED", message: "Smoke request rejected" } },
          400,
        );
      }
    }

    return json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
  },
} satisfies ExportedHandler<Env>;
