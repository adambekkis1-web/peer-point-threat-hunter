import { describe, expect, it } from "vitest";

import {
  MODEL_DEFINITIONS,
  MODEL_IDS,
  modelIdSchema,
  parseModelId,
  selectDefaultModel,
} from "../src/index.js";

describe("model configuration", () => {
  it("keeps definitions aligned with the allowlist", () => {
    expect(MODEL_DEFINITIONS.map(({ id }) => id)).toEqual(MODEL_IDS);
  });

  it("rejects arbitrary client model ids", () => {
    expect(modelIdSchema.safeParse("openai/gpt-5").success).toBe(false);
    expect(() => parseModelId("@cf/not-approved")).toThrow();
  });

  it("assigns stable defaults across the allowlist", () => {
    const first = selectDefaultModel("alice", "threat-hunter");
    expect(selectDefaultModel(" ALICE ", "THREAT-HUNTER")).toBe(first);
    expect(MODEL_IDS).toContain(first);
  });

  it("distributes representative handles across multiple models", () => {
    const selected = new Set(
      Array.from({ length: 40 }, (_, index) =>
        selectDefaultModel(`attendee-${index}`, "threat-hunter"),
      ),
    );
    expect(selected.size).toBeGreaterThanOrEqual(5);
  });
});
