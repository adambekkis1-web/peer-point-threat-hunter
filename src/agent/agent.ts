import { modelIdSchema, type ModelId } from "@peer-point/workshop-config";
import {
  Think,
  type ChatResponseResult,
  type StepContext,
  type ToolCallContext,
  type ToolCallResultContext,
  type TurnConfig,
  type TurnContext,
  type TurnResult,
} from "@cloudflare/think";
import { callable } from "agents";
import type { ContextConfig } from "agents/context";
import type { LanguageModel } from "ai";

import { createContextBlocks } from "./context.js";
import { createThreatHunterModel } from "./model.js";
import {
  appendFinding,
  appendQuery,
  assertFindingEvidenceObserved,
  createInitialState,
  setInvestigationStatus,
  setTimeline,
  threatHunterStateSchema,
  type FindingInput,
  type QueryRecordInput,
  type ThreatHunterState,
  type TimelineEvent,
} from "./state.js";
import { createThreatHunterTools, type ThreatHunterTools } from "./tools/index.js";
import { logError, logInfo } from "../shared/logger.js";

const ACTIVE_TOOLS = [
  "queryLogs",
  "aggregateLogs",
  "profileIp",
  "buildTimeline",
  "recordFinding",
  "set_context",
];

export class ThreatHunterAgent extends Think<Env, ThreatHunterState> {
  override initialState = createInitialState();
  override maxSteps = 9;
  override includeMcpTools = false;
  override workspaceBash = false;
  override sendReasoning = false;
  override storeMessages = false;
  override storeTools = false;

  override getModel(): LanguageModel {
    return createThreatHunterModel(this.env, this.state.selectedModel);
  }

  override configureContext(): ContextConfig[] {
    return createContextBlocks();
  }

  override getTools(): ThreatHunterTools {
    return createThreatHunterTools({
      logApiOptions: { baseUrl: this.env.LOG_API_URL },
      recordQuery: (query) => this.recordQuery(query),
      recordFinding: (finding) => this.recordGroundedFinding(finding),
      setTimeline: (events) => this.persistTimeline(events),
    });
  }

  override validateStateChange(nextState: ThreatHunterState): void {
    threatHunterStateSchema.parse(nextState);
  }

  @callable()
  selectModel(modelId: ModelId): ModelId {
    const selectedModel = modelIdSchema.parse(modelId);
    this.setState(
      threatHunterStateSchema.parse({
        ...this.state,
        selectedModel,
        lastUpdatedAt: new Date().toISOString(),
      }),
    );
    logInfo({ event: "model_selected", outcome: "success", modelId: selectedModel });
    return selectedModel;
  }

  @callable()
  resetInvestigation(): ThreatHunterState {
    const nextState = createInitialState(this.state.selectedModel);
    this.setState(nextState);
    logInfo({ event: "investigation_reset", outcome: "success", modelId: nextState.selectedModel });
    return nextState;
  }

  getDashboardState(): ThreatHunterState {
    return threatHunterStateSchema.parse(this.state);
  }

  async runSmokeTurn(input: string): Promise<TurnResult> {
    return this.runTurn({ mode: "wait", input });
  }

  override beforeTurn(ctx: TurnContext): TurnConfig {
    const selectedModel =
      ctx.body?.modelId === undefined
        ? this.state.selectedModel
        : modelIdSchema.parse(ctx.body.modelId);
    this.setState(
      threatHunterStateSchema.parse({
        ...setInvestigationStatus(this.state, "running"),
        selectedModel,
      }),
    );
    logInfo({
      event: "agent_turn",
      operation: "before-turn",
      outcome: "success",
      modelId: selectedModel,
    });
    return {
      model: createThreatHunterModel(this.env, selectedModel),
      activeTools: ACTIVE_TOOLS,
      maxOutputTokens: 700,
      maxSteps: this.maxSteps,
      sendReasoning: false,
    };
  }

  override beforeToolCall(ctx: ToolCallContext<ThreatHunterTools>): void {
    logInfo({ event: "agent_tool", operation: "before-tool", toolName: ctx.toolName });
  }

  override afterToolCall(ctx: ToolCallResultContext<ThreatHunterTools>): void {
    const outcome = ctx.toolOutput.type === "tool-result" ? "success" : "failure";
    logInfo({
      event: "agent_tool",
      operation: "after-tool",
      outcome,
      toolName: ctx.toolName,
      durationMs: Math.round(ctx.toolExecutionMs),
    });
  }

  override onStepFinish(ctx: StepContext<ThreatHunterTools>): void {
    logInfo({
      event: "agent_step",
      operation: ctx.finishReason,
      outcome: "success",
      tokenCount: ctx.usage.totalTokens ?? 0,
    });
  }

  override onChatResponse(result: ChatResponseResult): void {
    const status = result.status === "completed" ? "complete" : "idle";
    this.setState(
      threatHunterStateSchema.parse({
        ...setInvestigationStatus(this.state, status),
        turnCount: this.state.turnCount + 1,
      }),
    );
    logInfo({
      event: "agent_turn",
      operation: "chat-response",
      outcome: result.status === "completed" ? "success" : "failure",
      modelId: this.state.selectedModel,
    });
  }

  override onChatError(error: unknown): unknown {
    this.setState(setInvestigationStatus(this.state, "error"));
    logError({
      event: "agent_turn",
      operation: "chat-error",
      outcome: "failure",
      errorCode: "CHAT_FAILED",
    });
    return error;
  }

  private recordQuery(query: QueryRecordInput): void {
    this.setState(appendQuery(this.state, query));
  }

  private recordGroundedFinding(finding: FindingInput): void {
    this.setState(appendFinding(this.state, assertFindingEvidenceObserved(this.state, finding)));
  }

  private persistTimeline(events: readonly TimelineEvent[]): void {
    this.setState(setTimeline(this.state, events));
  }
}
