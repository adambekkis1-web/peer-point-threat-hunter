import { z } from "zod";

import { queryFallbackLogs } from "./fallback.js";

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

function invalidInput<T>(): LogApiResult<T> {
  return { ok: false, error: { code: "INVALID_INPUT", message: "Log query input is invalid" } };
}

function malformedResponse<T>(): LogApiResult<T> {
  return {
    ok: false,
    error: { code: "MALFORMED_RESPONSE", message: "Log service returned an invalid response" },
  };
}

function notImplemented<T>(task: string): LogApiResult<T> {
  return {
    ok: false,
    error: { code: "NOT_IMPLEMENTED", message: `Complete the ${task} workshop task` },
  };
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

// WORKSHOP TASK: Validate the input, call the bounded aggregate endpoint, and parse its response.
export function aggregateLogs(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<AggregateLogsResult>> {
  void options;
  const result = aggregateLogsInputSchema.safeParse(untrustedInput).success
    ? notImplemented<AggregateLogsResult>("aggregateLogs")
    : invalidInput<AggregateLogsResult>();
  return Promise.resolve(result);
}

// WORKSHOP TASK: Reuse queryLogs to build a bounded profile from exact rows.
export function profileIp(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<ProfileIpResult>> {
  void options;
  const result = profileIpInputSchema.safeParse(untrustedInput).success
    ? notImplemented<ProfileIpResult>("profileIp")
    : invalidInput<ProfileIpResult>();
  return Promise.resolve(result);
}

// WORKSHOP TASK: Reuse queryLogs and order exact rows deterministically without dropping truncation.
export function buildTimeline(
  untrustedInput: unknown,
  options: LogApiOptions = {},
): Promise<LogApiResult<BuildTimelineResult>> {
  void options;
  const result = buildTimelineInputSchema.safeParse(untrustedInput).success
    ? notImplemented<BuildTimelineResult>("buildTimeline")
    : invalidInput<BuildTimelineResult>();
  return Promise.resolve(result);
}
