import { describe, expect, it, vi } from "vitest";

import { createThreatHunterTools } from "../src/agent/tools/index.js";
import {
  aggregateLogs,
  aggregateLogsResultSchema,
  buildTimeline,
  buildTimelineResultSchema,
  profileIp,
  profileIpResultSchema,
  queryLogs,
  type LogEntry,
} from "../src/services/log-api.js";

const input = {
  from: "2026-09-22T14:00:00.000Z",
  to: "2026-09-22T14:30:00.000Z",
  limit: 25,
};

const sampleRow: LogEntry = {
  timestamp: "2026-09-22T14:10:00.000Z",
  requestId: "starter-test-row-0001",
  clientIp: "192.0.2.25",
  asn: 64_501,
  method: "GET",
  path: "/account",
  status: 200,
  userAgent: "Starter-Test/1.0",
  accountId: "acct-0002",
  sessionId: null,
  event: "request",
};

const executionOptions = { toolCallId: "starter-test", messages: [], context: {} };

describe("threat hunter starter", () => {
  it("keeps queryLogs as a complete bounded example", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        evidence: [sampleRow],
        partitionsScanned: 1,
        truncated: false,
      }),
    );

    await expect(queryLogs(input, { fetch: fetchMock })).resolves.toEqual({
      ok: true,
      data: {
        evidence: [sampleRow],
        partitionsScanned: 1,
        truncated: false,
        source: "remote",
      },
    });
  });

  it("keeps analysis task results typed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((request) => {
      const url =
        request instanceof Request
          ? new URL(request.url)
          : request instanceof URL
            ? request
            : new URL(request);
      if (url.pathname === "/aggregate") {
        return Promise.resolve(
          Response.json({
            ok: true,
            field: "event",
            buckets: [{ value: "request", count: 1 }],
            partitionsScanned: 1,
            truncated: false,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          ok: true,
          evidence: [sampleRow],
          partitionsScanned: 1,
          truncated: false,
        }),
      );
    });

    const aggregate = await aggregateLogs({ ...input, field: "event" }, { fetch: fetchMock });
    if (aggregate.ok) {
      const parsed = aggregateLogsResultSchema.safeParse(aggregate.data);
      expect(parsed.success).toBe(true);
    } else {
      expect(aggregate.error.code).toBe("NOT_IMPLEMENTED");
    }

    const profile = await profileIp({ ...input, ip: "192.0.2.25" }, { fetch: fetchMock });
    if (profile.ok) {
      const parsed = profileIpResultSchema.safeParse(profile.data);
      expect(parsed.success).toBe(true);
    } else {
      expect(profile.error.code).toBe("NOT_IMPLEMENTED");
    }

    const timeline = await buildTimeline(input, { fetch: fetchMock });
    if (timeline.ok) {
      const parsed = buildTimelineResultSchema.safeParse(timeline.data);
      expect(parsed.success).toBe(true);
    } else {
      expect(timeline.error.code).toBe("NOT_IMPLEMENTED");
    }
  });

  it("records queryLogs evidence and keeps finding results typed", async () => {
    const recordedQueries: unknown[] = [];
    const recordFinding = vi.fn();
    const tools = createThreatHunterTools({
      recordQuery: (query) => {
        recordedQueries.push(query);
      },
      recordFinding,
      setTimeline: vi.fn(),
      services: {
        queryLogs: vi.fn<typeof queryLogs>().mockResolvedValue({
          ok: true,
          data: {
            evidence: [sampleRow],
            partitionsScanned: 1,
            truncated: false,
            source: "remote",
          },
        }),
      },
    });

    await expect(tools.queryLogs.execute?.(input, executionOptions)).resolves.toMatchObject({
      ok: true,
    });
    expect(recordedQueries).toEqual([
      expect.objectContaining({ toolName: "queryLogs", evidence: [sampleRow] }),
    ]);

    const finding = {
      title: "Starter example",
      severity: "info" as const,
      summary: "An exact test row was observed.",
      confidence: 0.5,
      evidence: [sampleRow],
    };
    const findingResult = await tools.recordFinding.execute?.(finding, executionOptions);
    expect(findingResult).toMatchObject({ error: { code: "NOT_IMPLEMENTED" } });
    expect(recordFinding).not.toHaveBeenCalled();
  });
});
