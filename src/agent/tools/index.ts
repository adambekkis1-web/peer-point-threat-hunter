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
  type LogApiError,
  type LogApiOptions,
  type LogApiResult,
  type ProfileIpResult,
  type QueryLogsResult,
} from "../../services/log-api.js";
import {
  assessmentInputSchema,
  findingInputSchema,
  type AssessmentInput,
  type FindingInput,
  type QueryRecordInput,
  type TimelineEvent,
} from "../state.js";

type MaybePromise<T> = T | Promise<T>;

type RecordFindingResult =
  | { ok: true; finding: FindingInput }
  | { ok: false; error: LogApiError };

type RecordAssessmentResult =
  | { ok: true; assessment: AssessmentInput }
  | { ok: false; error: LogApiError };

interface ThreatHunterServices {
  queryLogs: typeof queryLogs;
  aggregateLogs: typeof aggregateLogs;
  profileIp: typeof profileIp;
  buildTimeline: typeof buildTimeline;
}

export interface ThreatHunterToolDependencies {
  recordQuery: (query: QueryRecordInput) => MaybePromise<void>;
  recordFinding: (finding: FindingInput) => MaybePromise<void>;
  recordAssessment: (assessment: AssessmentInput) => MaybePromise<void>;
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
      execute: async (input): Promise<RecordFindingResult> => {
        const finding = findingInputSchema.safeParse(input);
        if (!finding.success) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: "Finding input is invalid: grounded evidence fields failed validation",
            },
          };
        }
        try {
          await dependencies.recordFinding(finding.data);
        } catch (error) {
          if (error instanceof Error && error.message === "FINDING_EVIDENCE_NOT_OBSERVED") {
            return {
              ok: false,
              error: {
                code: "INVALID_INPUT",
                message: "Finding rejected: every evidence row must come from an observed query",
              },
            };
          }
          throw error;
        }
        return { ok: true, finding: finding.data };
      },
    }),
    recordAssessment: tool({
      description:
        "Persist the analyst assessment: MITRE ATT&CK techniques with grounded evidence, plausible actor profiles, and a bounded prediction of the actor's next intentions.",
      inputSchema: assessmentInputSchema,
      execute: async (input): Promise<RecordAssessmentResult> => {
        const assessment = assessmentInputSchema.safeParse(input);
        if (!assessment.success) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: "Assessment input is invalid: grounded evidence fields failed validation",
            },
          };
        }
        try {
          await dependencies.recordAssessment(assessment.data);
        } catch (error) {
          if (error instanceof Error && error.message === "ASSESSMENT_EVIDENCE_NOT_OBSERVED") {
            return {
              ok: false,
              error: {
                code: "INVALID_INPUT",
                message: "Assessment rejected: every evidence row must come from an observed query",
              },
            };
          }
          throw error;
        }
        return { ok: true, assessment: assessment.data };
      },
    }),
  };
}

export type ThreatHunterTools = ReturnType<typeof createThreatHunterTools>;
