# Threat Hunter

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnikhilbuddhavarapu/peer-point-card-1-threat-hunter)

Build an evidence-first Agent that investigates a large synthetic HTTP log corpus without placing the corpus in model context. The lesson is to turn a broad incident question into bounded queries, pivot on returned evidence, and persist only grounded conclusions.

## What already works

- Vite, React, the Worker entry point, and the Think Agent chat flow
- Workers AI model selection through the account-local `default` AI Gateway
- Durable Object state, WebSockets, memory, tracing, structured logs, and the investigation dashboard
- `queryLogs`, a complete example tool that validates a three-hour time range, returns at most 25 exact rows, reports truncation, and records successful queries
- the central read-only Log API, with a small non-answer fallback when that service is unavailable
- typed schemas for aggregation, IP profiles, timelines, findings, and expected tool failures

The starter runs before you implement the workshop tasks. Unfinished capabilities return an `ok: false` result with error code `NOT_IMPLEMENTED`; they should not crash the Agent.

## What you build

Edit only these three files for the base exercise:

1. `src/agent/context.ts` — write a bounded hunting strategy that requires evidence-backed pivots.
2. `src/services/log-api.ts` — implement at least one advanced analysis capability: `aggregateLogs`, `profileIp`, or `buildTimeline`.
3. `src/agent/tools/index.ts` — complete grounded finding persistence after reviewing the `queryLogs` example.

Every intentional gap is labeled `WORKSHOP TASK`.

## First run

Requirements: Node.js 24 or newer, npm 11, and Wrangler authenticated to your temporary lab account.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A useful first prompt is:

> Investigate unusual authentication activity between 14:00 and 14:30 UTC. Make at least two differently filtered log queries, distinguish observations from inferences, and cite request IDs and timestamps from returned evidence.

Before your edits, the Agent can use `queryLogs`; advanced tools and finding persistence report `NOT_IMPLEMENTED`. This is the expected starting state.

## Tool contracts

The corpus covers `2026-09-22T13:00:00Z` through `2026-09-22T19:00:00Z`.

### Complete example

```ts
queryLogs({
  from: string, // ISO 8601 with an offset
  to: string, // after from, no more than three hours later
  ip?: string, // IPv4
  path?: string,
  status?: number, // 100-599
  userAgent?: string,
  limit?: number, // 1-25
})
```

A successful result contains exact `evidence`, `partitionsScanned`, `truncated`, and `source`. Expected failures use the shared discriminated union:

```ts
type LogApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "INVALID_INPUT" | "REMOTE_REJECTED" | "MALFORMED_RESPONSE" | "NOT_IMPLEMENTED";
        message: string;
        status?: number;
      };
    };
```

### Workshop capabilities

- `aggregateLogs` accepts a bounded time range, a field, and a limit, then returns counted buckets.
- `profileIp` accepts a bounded time range, one IPv4 address, and a limit, then returns exact rows plus a bounded profile.
- `buildTimeline` accepts the `queryLogs` filters and returns exact rows in deterministic chronological order.
- `recordFinding` accepts a title, severity, summary, confidence, and one or more exact evidence rows. It must not persist evidence the Agent has not observed.

Validate untrusted input with the existing Zod schemas. Preserve the 25-row result bound and the `truncated` signal.

## Base checklist

- [ ] The soul block tells the Agent to form a hypothesis, query, pivot, and cite evidence.
- [ ] At least one advanced capability no longer returns `NOT_IMPLEMENTED`.
- [ ] The investigation performs at least two differently filtered bounded queries.
- [ ] A finding is persisted only from rows returned by earlier tools.
- [ ] The final response includes timestamps and request IDs and separates observation from inference.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.

## Stretch goals

- Implement all three advanced analysis capabilities.
- Use aggregation to choose a focused follow-up query rather than guessing a filter.
- Add an IP profile or chronological timeline to the dashboard.
- Improve confidence and evidence presentation without increasing tool-result bounds.

## Common failures and recovery

- **`NOT_IMPLEMENTED` appears:** expected until the corresponding `WORKSHOP TASK` is complete. Start with one advanced function and preserve its declared return type.
- **`INVALID_INPUT`:** use offset-aware ISO timestamps, keep `to` after `from`, limit the range to three hours, and keep `limit` between 1 and 25.
- **Empty evidence:** broaden one filter or time window, but do not invent rows. Empty results are valid evidence for choosing the next query.
- **`REMOTE_REJECTED`:** wait briefly if rate limited and narrow repeated requests. Do not bypass the central API.
- **Fallback source:** the central service was unavailable. Continue testing tool flow, but reconnect before the final demo because the fallback intentionally contains no attack answer.
- **Finding rejected:** ensure every submitted row came from a successful prior log tool result and is unchanged.
- **Stale Durable Object state:** use the UI reset action and begin a new investigation.

## Deploy and demo

```bash
npm run deploy:dry-run
npm run deploy
```

After deployment, open the Wrangler URL and run the suggested prompt. Show the query ledger, at least one evidence-backed pivot, a grounded finding, and your implemented advanced capability.

## Security constraints

- Keep the Log API read-only and use `LOG_API_URL`; never add or distribute R2 credentials.
- Keep all query windows and tool outputs bounded.
- Validate external input and remote responses with the existing schemas.
- Do not log prompts, tool payloads, evidence rows, credentials, or private endpoints.
- Do not remove the model allowlist, evidence-grounding check, TLS, observability, or Durable Object isolation.

## Start with Peer Point OS

After Deploy to Cloudflare creates your repository and first deployment, copy your generated GitHub repository URL. In a new Peer Point OS chat, run:

```text
/threat-hunter https://github.com/<your-user>/<deploy-created-repository>
```

Replace the example URL with your generated repository. Peer Point OS will read this README and guide the card workflow. If Container MCP becomes unavailable, continue with the skill's GitHub branch/PR and Workers Builds fallback.

## Start with your own IDE

```bash
npm ci
npm run verify
npm run dev
```

Before pushing or deploying:

```bash
npm run verify
```

Deploy only to the temporary lab account assigned for the event.
