import { z } from "zod";

import { FALLBACK_LOG_ROWS, queryFallbackLogs } from "./fallback.js";

export const CENTRAL_LOG_API_URL = "https://peer-point-log-api.peer-point-user-group.workers.dev";
export const LOG_API_TIMEOUT_MS = 8_000;
export const MAX_LOG_ROWS = 25;

const isoDateSchema = z.string().datetime({ offset: true });
const timeRangeSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .superRefine(({ from, to }, context) => {
    const duration = Date.parse(to) - Date.parse(from);
    if (duration <= 0) context.addIssue({ code: "custom", message: "to must follow from" });
    if (duration > 3 * 60 * 60 * 1_000) {
      context.addIssue({ code: "custom", message: "time range exceeds three hours" });
    }
  });

export const logEntrySchema = z
  .object({
    timestamp: isoDateSchema,
    requestId: z.string().min(8).max(80),
    clientIp: z.ipv4(),
    asn: z.number().int().positive(),
    method: z.enum(["GET", "POST"]),
    path: z.string().startsWith("/").max(200),
    status: z.number().int().min(100).max(599),
    userAgent: z.string().max(200),
    accountId: z.string().regex(/^acct-[0-9]{4}$/),
    sessionId: z.string().max(100).nullable(),
    event: z.enum(["request", "login-failed", "login-success", "session-reuse", "data-access"]),
  })
  .strict();
export type LogEntry = z.infer<typeof logEntrySchema>;

export const queryLogsInputSchema = timeRangeSchema.safeExtend({
  ip: z.ipv4().optional(),
  path: z.string().trim().min(1).max(200).optional(),
  status: z.number().int().min(100).max(599).optional(),
  userAgent: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(MAX_LOG_ROWS).default(MAX_LOG_ROWS),
});
export type QueryLogsInput = z.infer<typeof queryLogsInputSchema>;

export const aggregateFieldSchema = z.enum([
  "clientIp",
  "asn",
  "method",
  "path",
  "status",
  "event",
]);
export const aggregateLogsInputSchema = timeRangeSchema.safeExtend({
  field: aggregateFieldSchema,
  limit: z.number().int().min(1).max(MAX_LOG_ROWS).default(10),
});
export type AggregateLogsInput = z.infer<typeof aggregateLogsInputSchema>;

const resultMetadataSchema = z.object({
  partitionsScanned: z.number().int().nonnegative(),
  truncated: z.boolean(),
  source: z.enum(["remote", "fallback"]),
});

export const queryLogsResultSchema = resultMetadataSchema.extend({
  evidence: z.array(logEntrySchema).max(MAX_LOG_ROWS),
});
export type QueryLogsResult = z.infer<typeof queryLogsResultSchema>;

export const aggregateBucketSchema = z.object({
  value: z.string().max(200),
  count: z.number().int().positive(),
});
export const aggregateLogsResultSchema = resultMetadataSchema.extend({
  field: aggregateFieldSchema,
  buckets: z.array(aggregateBucketSchema).max(MAX_LOG_ROWS),
});
export type AggregateLogsResult = z.infer<typeof aggregateLogsResultSchema>;

export const profileIpInputSchema = timeRangeSchema.safeExtend({
  ip: z.ipv4(),
  limit: z.number().int().min(1).max(MAX_LOG_ROWS).default(MAX_LOG_ROWS),
});
export type ProfileIpInput = z.infer<typeof profileIpInputSchema>;

export const profileIpResultSchema = resultMetadataSchema.extend({
  ip: z.ipv4(),
  rowCount: z.number().int().nonnegative().max(MAX_LOG_ROWS),
  firstSeen: isoDateSchema.nullable(),
  lastSeen: isoDateSchema.nullable(),
  asns: z.array(z.number().int().positive()).max(MAX_LOG_ROWS),
  userAgents: z.array(z.string().max(200)).max(MAX_LOG_ROWS),
  events: z.array(aggregateBucketSchema).max(MAX_LOG_ROWS),
  evidence: z.array(logEntrySchema).max(MAX_LOG_ROWS),
});
export type ProfileIpResult = z.infer<typeof profileIpResultSchema>;

export const buildTimelineInputSchema = queryLogsInputSchema;
export type BuildTimelineInput = z.infer<typeof buildTimelineInputSchema>;
export const buildTimelineResultSchema = resultMetadataSchema.extend({
  events: z.array(logEntrySchema).max(MAX_LOG_ROWS),
});
export type BuildTimelineResult = z.infer<typeof buildTimelineResultSchema>;

export const logApiErrorSchema = z.object({
  code: z.enum(["INVALID_INPUT", "REMOTE_REJECTED", "MALFORMED_RESPONSE", "NOT_IMPLEMENTED"]),
  message: z.string().min(1).max(160),
  status: z.number().int().min(400).max(599).optional(),
});
export type LogApiError = z.infer<typeof logApiErrorSchema>;
export type LogApiResult<T> = { ok: true; data: T } | { ok: false; error: LogApiError };

export interface LogApiOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const remoteQueryResponseSchema = z.object({
  ok: z.literal(true),
  evidence: z.array(logEntrySchema).max(200),
  partitionsScanned: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
const remoteErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(160).optional(),
  }),
});

const remoteAggregateResponseSchema = z.object({
  ok: z.literal(true),
  field: aggregateFieldSchema,
  buckets: z.array(aggregateBucketSchema).max(200),
  partitionsScanned: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

function invalidInput<T>(): LogApiResult<T> {
  return { ok: false, error: { code: "INVALID_INPUT", message: "Log query input is invalid" } };
}

function malformedResponse<T>(): LogApiResult<T> {
  return {
    ok: false,
    error: { code: "MALFORMED_RESPONSE", message: "Log service returned an invalid response" },
  };
}

function compareLogEntries(left: LogEntry, right: LogEntry): number {
  return (
    Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
    left.requestId.localeCompare(right.requestId)
  );
}

function aggregateFallbackLogs(input: AggregateLogsInput): AggregateLogsResult {
  const counts = new Map<string, number>();
  for (const row of FALLBACK_LOG_ROWS) {
    const timestamp = Date.parse(row.timestamp);
    if (timestamp < Date.parse(input.from) || timestamp > Date.parse(input.to)) continue;
    const value = String(row[input.field]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const all = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  const buckets = all.slice(0, input.limit);
  return aggregateLogsResultSchema.parse({
    field: input.field,
    buckets,
    partitionsScanned: 0,
    truncated: all.length > buckets.length,
    source: "fallback",
  });
}

function rejectedResponse<T>(status: number, body: unknown): LogApiResult<T> {
  const parsed = remoteErrorResponseSchema.safeParse(body);
  return {
    ok: false,
    error: {
      code: "REMOTE_REJECTED",
      message: parsed.success
        ? (parsed.data.error.message ?? parsed.data.error.code)
        : "Log service rejected the query",
      status,
    },
  };
}

function createUrl(
  path: string,
  values: Record<string, string | number | undefined>,
  baseUrl: string,
): URL {
  const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
}

async function fetchJson(
  url: URL,
  options: LogApiOptions,
): Promise<{ available: false } | { available: true; response: Response; body: unknown }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const unavailableAfterTimeout = new Promise<{ available: false }>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({ available: false });
    }, options.timeoutMs ?? LOG_API_TIMEOUT_MS);
  });
  const remoteRequest = (async () => {
    try {
      const response = await (options.fetch ?? globalThis.fetch)(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status >= 500 || response.status === 408) return { available: false } as const;
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (error instanceof SyntaxError) {
          return { available: true, response, body: undefined } as const;
        }
        throw error;
      }
      return { available: true, response, body } as const;
    } catch (error) {
      if (
        controller.signal.aborted ||
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return { available: false } as const;
      }
      throw error;
    }
  })();

  try {
    return await Promise.race([remoteRequest, unavailableAfterTimeout]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function queryLogs(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<QueryLogsResult>> {
  const parsedInput = queryLogsInputSchema.safeParse(untrustedInput);
  if (!parsedInput.success) return invalidInput();
  const input = parsedInput.data;
  const url = createUrl(
    "query",
    {
      from: input.from,
      to: input.to,
      ip: input.ip,
      path: input.path,
      status: input.status,
      ua: input.userAgent,
      limit: input.limit,
    },
    options.baseUrl ?? CENTRAL_LOG_API_URL,
  );
  const remote = await fetchJson(url, options);
  if (!remote.available) return { ok: true, data: queryFallbackLogs(input) };
  if (!remote.response.ok) return rejectedResponse(remote.response.status, remote.body);

  const parsedResponse = remoteQueryResponseSchema.safeParse(remote.body);
  if (!parsedResponse.success) return malformedResponse();
  const evidence = parsedResponse.data.evidence.slice(0, input.limit);
  return {
    ok: true,
    data: queryLogsResultSchema.parse({
      evidence,
      partitionsScanned: parsedResponse.data.partitionsScanned,
      truncated:
        parsedResponse.data.truncated || parsedResponse.data.evidence.length > evidence.length,
      source: "remote",
    }),
  };
}

export async function aggregateLogs(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<AggregateLogsResult>> {
  const parsedInput = aggregateLogsInputSchema.safeParse(untrustedInput);
  if (!parsedInput.success) return invalidInput();
  const input = parsedInput.data;
  const url = createUrl(
    "aggregate",
    { from: input.from, to: input.to, field: input.field, limit: input.limit },
    options.baseUrl ?? CENTRAL_LOG_API_URL,
  );
  const remote = await fetchJson(url, options);
  if (!remote.available) return { ok: true, data: aggregateFallbackLogs(input) };
  if (!remote.response.ok) return rejectedResponse(remote.response.status, remote.body);

  const parsedResponse = remoteAggregateResponseSchema.safeParse(remote.body);
  if (!parsedResponse.success || parsedResponse.data.field !== input.field) {
    return malformedResponse();
  }
  const buckets = parsedResponse.data.buckets.slice(0, input.limit);
  return {
    ok: true,
    data: aggregateLogsResultSchema.parse({
      field: input.field,
      buckets,
      partitionsScanned: parsedResponse.data.partitionsScanned,
      truncated:
        parsedResponse.data.truncated || parsedResponse.data.buckets.length > buckets.length,
      source: "remote",
    }),
  };
}

export async function profileIp(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<ProfileIpResult>> {
  const parsedInput = profileIpInputSchema.safeParse(untrustedInput);
  if (!parsedInput.success) return invalidInput();
  const input = parsedInput.data;
  const query = await queryLogs(input, options);
  if (!query.ok) return query;
  const evidence = query.data.evidence;
  const timestamps = evidence.map((row) => row.timestamp).sort();
  const eventCounts = new Map<string, number>();
  for (const row of evidence) {
    eventCounts.set(row.event, (eventCounts.get(row.event) ?? 0) + 1);
  }
  const events = [...eventCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  const asns = [...new Set(evidence.map((row) => row.asn))].sort((left, right) => left - right);
  const userAgents = [...new Set(evidence.map((row) => row.userAgent))].sort(
    (left, right) => left.localeCompare(right),
  );
  return {
    ok: true,
    data: profileIpResultSchema.parse({
      ip: input.ip,
      rowCount: evidence.length,
      firstSeen: timestamps.at(0) ?? null,
      lastSeen: timestamps.at(-1) ?? null,
      asns,
      userAgents,
      events,
      evidence,
      partitionsScanned: query.data.partitionsScanned,
      truncated: query.data.truncated,
      source: query.data.source,
    }),
  };
}

export async function buildTimeline(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<BuildTimelineResult>> {
  const parsedInput = buildTimelineInputSchema.safeParse(untrustedInput);
  if (!parsedInput.success) return invalidInput();
  const query = await queryLogs(parsedInput.data, options);
  if (!query.ok) return query;
  const events = [...query.data.evidence].sort(compareLogEntries);
  return {
    ok: true,
    data: buildTimelineResultSchema.parse({
      events,
      partitionsScanned: query.data.partitionsScanned,
      truncated: query.data.truncated,
      source: query.data.source,
    }),
  };
}
