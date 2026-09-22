import { z } from "zod";

export const MODEL_IDS = [
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/zai-org/glm-5.2",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
] as const;

// A schema validates runtime data; the inferred type describes the validated value to TypeScript.
export const modelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof modelIdSchema>;

export const modelDefinitionSchema = z.object({
  id: modelIdSchema,
  label: z.string().min(1),
  provider: z.enum(["Z.ai", "Moonshot AI", "DeepSeek"]),
  speed: z.enum(["fast", "balanced", "deliberate"]),
});
export type ModelDefinition = z.infer<typeof modelDefinitionSchema>;

export const MODEL_DEFINITIONS = [
  { id: MODEL_IDS[0], label: "GLM 5.3", provider: "Z.ai", speed: "deliberate" },
  { id: MODEL_IDS[1], label: "GLM 5.3 Flash", provider: "Z.ai", speed: "fast" },
  { id: MODEL_IDS[2], label: "GLM 5.2", provider: "Z.ai", speed: "deliberate" },
  { id: MODEL_IDS[3], label: "Kimi K2.6", provider: "Moonshot AI", speed: "balanced" },
  { id: MODEL_IDS[4], label: "Kimi K2.7 Code", provider: "Moonshot AI", speed: "deliberate" },
  {
    id: MODEL_IDS[5],
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    speed: "fast",
  },
  {
    id: MODEL_IDS[6],
    label: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    speed: "deliberate",
  },
] as const satisfies readonly ModelDefinition[];

export const modelSelectionSchema = z.object({
  modelId: modelIdSchema,
});
export type ModelSelection = z.infer<typeof modelSelectionSchema>;

export function parseModelId(value: unknown): ModelId {
  return modelIdSchema.parse(value);
}

export function selectDefaultModel(handle: string, card: string): ModelId {
  const key = `${handle.trim().toLowerCase()}:${card.trim().toLowerCase()}`;
  let hash = 2_166_136_261;

  for (const character of key) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return MODEL_IDS[Math.abs(hash) % MODEL_IDS.length] ?? MODEL_IDS[0];
}
