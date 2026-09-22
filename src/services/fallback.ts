import type { LogEntry, QueryLogsInput, QueryLogsResult } from "./log-api.js";

export const FALLBACK_LOG_ROWS = [
  {
    timestamp: "2026-09-22T13:10:00.000Z",
    requestId: "starter-sample-0001",
    clientIp: "192.0.2.10",
    asn: 64_500,
    method: "GET",
    path: "/health",
    status: 200,
    userAgent: "PeerPoint-Monitor/1.0",
    accountId: "acct-0001",
    sessionId: null,
    event: "request",
  },
] as const satisfies readonly LogEntry[];

function inRange(timestamp: string, from: string, to: string): boolean {
  const value = Date.parse(timestamp);
  return value >= Date.parse(from) && value <= Date.parse(to);
}

export function queryFallbackLogs(input: QueryLogsInput): QueryLogsResult {
  const matching = FALLBACK_LOG_ROWS.filter(
    (row) =>
      inRange(row.timestamp, input.from, input.to) &&
      (!input.ip || row.clientIp === input.ip) &&
      (!input.path || row.path.includes(input.path)) &&
      (!input.status || row.status === input.status) &&
      (!input.userAgent || row.userAgent.toLowerCase().includes(input.userAgent.toLowerCase())),
  );
  const evidence = matching.slice(0, input.limit);

  return {
    evidence,
    partitionsScanned: 0,
    truncated: matching.length > evidence.length,
    source: "fallback",
  };
}
