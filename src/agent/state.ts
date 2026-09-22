import { MODEL_IDS, modelIdSchema, type ModelId } from "@peer-point/workshop-config";
import { z } from "zod";

import { aggregateFieldSchema, logEntrySchema, type LogEntry } from "../services/log-api.js";

export const QUERY_LEDGER_LIMIT = 12;
export const FINDINGS_LIMIT = 12;
export const TIMELINE_LIMIT = 25;

export const queryToolNameSchema = z.enum([
  "queryLogs",
  "aggregateLogs",
  "profileIp",
  "buildTimeline",
]);
export type QueryToolName = z.infer<typeof queryToolNameSchema>;

export const recordedQueryInputSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    ip: z.ipv4().optional(),
    path: z.string().min(1).max(200).optional(),
    status: z.number().int().min(100).max(599).optional(),
    userAgent: z.string().min(1).max(200).optional(),
    field: aggregateFieldSchema.optional(),
    limit: z.number().int().min(1).max(25).optional(),
  })
  .strict();
export type RecordedQueryInput = z.infer<typeof recordedQueryInputSchema>;

export const queryRecordInputSchema = z.object({
  toolName: queryToolNameSchema,
  input: recordedQueryInputSchema,
  resultCount: z.number().int().nonnegative().max(25),
  truncated: z.boolean(),
  source: z.enum(["remote", "fallback"]),
  evidence: z.array(logEntrySchema).max(25).default([]),
});
export type QueryRecordInput = z.infer<typeof queryRecordInputSchema>;

export const queryRecordSchema = queryRecordInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type QueryRecord = z.infer<typeof queryRecordSchema>;

export const findingSeveritySchema = z.enum(["info", "warning", "critical"]);
export const findingInputSchema = z.object({
  title: z.string().trim().min(3).max(80),
  severity: findingSeveritySchema,
  summary: z.string().trim().min(3).max(800),
  confidence: z.number().min(0).max(1),
  evidence: z.array(logEntrySchema).min(1).max(25),
});
export type FindingInput = z.infer<typeof findingInputSchema>;

export const findingSchema = findingInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type Finding = z.infer<typeof findingSchema>;

export const timelineEventSchema = logEntrySchema;
export type TimelineEvent = LogEntry;

export const threatHunterStateSchema = z.object({
  selectedModel: modelIdSchema,
  status: z.enum(["idle", "running", "complete", "error"]),
  queries: z.array(queryRecordSchema).max(QUERY_LEDGER_LIMIT),
  findings: z.array(findingSchema).max(FINDINGS_LIMIT),
  timeline: z.array(timelineEventSchema).max(TIMELINE_LIMIT),
  turnCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().datetime(),
});
export type ThreatHunterState = z.infer<typeof threatHunterStateSchema>;

export function createInitialState(selectedModel: ModelId = MODEL_IDS[5]): ThreatHunterState {
  return threatHunterStateSchema.parse({
    selectedModel,
    status: "idle",
    queries: [],
    findings: [],
    timeline: [],
    turnCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  });
}

export function appendQuery(state: ThreatHunterState, input: QueryRecordInput): ThreatHunterState {
  const createdAt = new Date().toISOString();
  const query = queryRecordSchema.parse({
    ...queryRecordInputSchema.parse(input),
    id: crypto.randomUUID(),
    createdAt,
  });
  return threatHunterStateSchema.parse({
    ...state,
    queries: [...state.queries, query].slice(-QUERY_LEDGER_LIMIT),
    lastUpdatedAt: createdAt,
  });
}

export const appendQueryRecord = appendQuery;

export function assertFindingEvidenceObserved(
  state: ThreatHunterState,
  input: FindingInput,
): FindingInput {
  const finding = findingInputSchema.parse(input);
  const observed = new Set(
    state.queries.flatMap((query) => query.evidence.map((entry) => entry.requestId)),
  );
  if (finding.evidence.some((entry) => !observed.has(entry.requestId))) {
    throw new Error("FINDING_EVIDENCE_NOT_OBSERVED");
  }
  return finding;
}

export function appendFinding(state: ThreatHunterState, input: FindingInput): ThreatHunterState {
  const createdAt = new Date().toISOString();
  const finding = findingSchema.parse({
    ...findingInputSchema.parse(input),
    id: crypto.randomUUID(),
    createdAt,
  });
  return threatHunterStateSchema.parse({
    ...state,
    findings: [...state.findings, finding].slice(-FINDINGS_LIMIT),
    lastUpdatedAt: createdAt,
  });
}

export function setTimeline(
  state: ThreatHunterState,
  untrustedEvents: readonly unknown[],
): ThreatHunterState {
  const byRequestId = new Map<string, TimelineEvent>();
  for (const event of untrustedEvents) {
    const parsed = timelineEventSchema.parse(event);
    byRequestId.set(parsed.requestId, parsed);
  }
  const timeline = [...byRequestId.values()]
    .sort(
      (left, right) =>
        Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
        left.requestId.localeCompare(right.requestId),
    )
    .slice(-TIMELINE_LIMIT);
  const lastUpdatedAt = new Date().toISOString();
  return threatHunterStateSchema.parse({ ...state, timeline, lastUpdatedAt });
}

export const replaceTimeline = setTimeline;

export function setInvestigationStatus(
  state: ThreatHunterState,
  status: ThreatHunterState["status"],
): ThreatHunterState {
  return threatHunterStateSchema.parse({
    ...state,
    status,
    lastUpdatedAt: new Date().toISOString(),
  });
}
