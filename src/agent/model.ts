import type { ModelId } from "@peer-point/workshop-config";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export function createThreatHunterModel(env: Env, modelId: ModelId): LanguageModel {
  const provider = createWorkersAI({ binding: env.AI });
  return provider(modelId, {
    gateway: {
      id: env.AI_GATEWAY_ID,
      metadata: {
        city: env.CITY.toLowerCase(),
        card: env.CARD,
        environment: env.ENVIRONMENT,
        model: modelId,
      },
    },
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
  });
}
