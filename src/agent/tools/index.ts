import { tool } from "ai";

import {
  aggregateLogs,
  aggregateLogsInputSchema,
  buildTimeline,
  buildTimelineInputSchema,
  profileIp,
  profileIpInputSchema,
  queryLogs,
  queryLogsInputSchema,
  type AggregateLogsResult,
  type BuildTimelineResult,
  type LogApiOptions,
  type LogApiResult,
  type ProfileIpResult,
  type QueryLogsResult,
} from "../../services/log-api.js";
import {
  findingInputSchema,
  type FindingInput,
  type QueryRecordInput,
  type TimelineEvent,
} from "../state.js";

type MaybePromise<T> = T | Promise<T>;

type RecordFindingResult =
  | { ok: true; finding: FindingInput }
  | { ok: false; error: { code: "NOT_IMPLEMENTED"; message: string } };

interface ThreatHunterServices {
  queryLogs: typeof queryLogs;
  aggregateLogs: typeof aggregateLogs;
  profileIp: typeof profileIp;
  buildTimeline: typeof buildTimeline;
}

export interface ThreatHunterToolDependencies {
  recordQuery: (query: QueryRecordInput) => MaybePromise<void>;
  recordFinding: (finding: FindingInput) => MaybePromise<void>;
  setTimeline: (events: readonly TimelineEvent[]) => MaybePromise<void>;
  logApiOptions?: LogApiOptions;
  services?: Partial<ThreatHunterServices>;
}

function recordQueryResult(
  toolName: QueryRecordInput["toolName"],
  input: QueryRecordInput["input"],
  result: QueryLogsResult | ProfileIpResult | BuildTimelineResult,
): QueryRecordInput {
  const evidence = "evidence" in result ? result.evidence : result.events;
  return {
    toolName,
    input,
    resultCount: evidence.length,
    truncated: result.truncated,
    source: result.source,
    evidence,
  };
}

function recordAggregateResult(
  input: QueryRecordInput["input"],
  result: AggregateLogsResult,
): QueryRecordInput {
  return {
    toolName: "aggregateLogs",
    input,
    resultCount: result.buckets.length,
    truncated: result.truncated,
    source: result.source,
    evidence: [],
  };
}

export function createThreatHunterTools(dependencies: ThreatHunterToolDependencies) {
  const services: ThreatHunterServices = {
    queryLogs: dependencies.services?.queryLogs ?? queryLogs,
    aggregateLogs: dependencies.services?.aggregateLogs ?? aggregateLogs,
    profileIp: dependencies.services?.profileIp ?? profileIp,
    buildTimeline: dependencies.services?.buildTimeline ?? buildTimeline,
  };

  return {
    queryLogs: tool({
      description:
        "Query at most 25 exact log rows in a three-hour window. Use truncation to decide whether to narrow the next query.",
      inputSchema: queryLogsInputSchema,
      execute: async (input): Promise<LogApiResult<QueryLogsResult>> => {
        const result = await services.queryLogs(input, dependencies.logApiOptions);
        if (result.ok) {
          await dependencies.recordQuery(recordQueryResult("queryLogs", input, result.data));
        }
        return result;
      },
    }),
    aggregateLogs: tool({
      description:
        "Count bounded log values for one field in a three-hour window before selecting a focused evidence query.",
      inputSchema: aggregateLogsInputSchema,
      execute: async (input): Promise<LogApiResult<AggregateLogsResult>> => {
        const result = await services.aggregateLogs(input, dependencies.logApiOptions);
        if (result.ok) await dependencies.recordQuery(recordAggregateResult(input, result.data));
        return result;
      },
    }),
    profileIp: tool({
      description:
        "Profile one IPv4 address with bounded exact rows, observed ASNs, user agents, and event counts.",
      inputSchema: profileIpInputSchema,
      execute: async (input): Promise<LogApiResult<ProfileIpResult>> => {
        const result = await services.profileIp(input, dependencies.logApiOptions);
        if (result.ok)
          await dependencies.recordQuery(recordQueryResult("profileIp", input, result.data));
        return result;
      },
    }),
    buildTimeline: tool({
      description:
        "Build and persist a chronological attack timeline from at most 25 exact returned log rows.",
      inputSchema: buildTimelineInputSchema,
      execute: async (input): Promise<LogApiResult<BuildTimelineResult>> => {
        const result = await services.buildTimeline(input, dependencies.logApiOptions);
        if (result.ok) {
          await dependencies.recordQuery(recordQueryResult("buildTimeline", input, result.data));
          await dependencies.setTimeline(result.data.events);
        }
        return result;
      },
    }),
    recordFinding: tool({
      description:
        "Persist an evidence-grounded finding. Every evidence item must be an exact row returned by a prior log tool.",
      inputSchema: findingInputSchema,
      // WORKSHOP TASK: Verify that every row was observed, persist the finding, and return success.
      execute: (input): Promise<RecordFindingResult> => {
        void input;
        return Promise.resolve({
          ok: false,
          error: {
            code: "NOT_IMPLEMENTED",
            message: "Complete the grounded finding task in src/agent/tools/index.ts",
          },
        });
      },
    }),
  };
}

export type ThreatHunterTools = ReturnType<typeof createThreatHunterTools>;
