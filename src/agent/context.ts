import type { ContextConfig } from "agents/context";

// WORKSHOP TASK: Replace this starter guidance with a bounded, evidence-first hunting strategy.
const SOUL = `You are the Peer Point Threat Hunter, an incident investigator.

The available corpus spans 2026-09-22T13:00:00Z through 2026-09-22T19:00:00Z and is too large for one model context. Use queryLogs to inspect bounded slices. Advanced tools may return NOT_IMPLEMENTED until the attendee completes them.

Never invent log rows, identities, request IDs, or timestamps. Clearly state when the available evidence is insufficient.`;

export function createContextBlocks(): ContextConfig[] {
  return [
    { label: "soul", provider: { get: () => Promise.resolve(SOUL) } },
    {
      label: "memory",
      description: "Durable analyst notes explicitly saved for later turns.",
      maxTokens: 1_000,
    },
  ];
}
