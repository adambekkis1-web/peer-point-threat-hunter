import { MODEL_DEFINITIONS, MODEL_IDS, type ModelId } from "@peer-point/workshop-config";
import { WorkshopShell, type ConnectionStatus } from "@peer-point/workshop-ui";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useEffect, useMemo, useState } from "react";

import type { ThreatHunterAgent } from "../agent/agent.js";
import { createInitialState, type ThreatHunterState } from "../agent/state.js";
import { ThreatDashboard } from "./components/threat-dashboard.js";
import { toDisplayMessages } from "./lib/messages.js";

function connectionStatus(
  readyState: number,
  chatStatus: string,
  hasError: boolean,
): ConnectionStatus {
  if (hasError || chatStatus === "error") return "error";
  if (chatStatus === "submitted") return "thinking";
  if (chatStatus === "streaming") return "streaming";
  if (readyState !== WebSocket.OPEN) return "connecting";
  return "ready";
}

export function App() {
  const [dashboard, setDashboard] = useState<ThreatHunterState>(createInitialState());
  const [selectedModel, setSelectedModel] = useState<ModelId>(MODEL_IDS[5]);
  const [input, setInput] = useState("");
  const [actionError, setActionError] = useState<string>();

  const agent = useAgent<ThreatHunterAgent, ThreatHunterState>({
    agent: "ThreatHunterAgent",
    name: "investigation",
    onStateUpdate: setDashboard,
    onStateUpdateError: () => setActionError("The Agent rejected a state update."),
  });
  const chat = useAgentChat({
    agent,
    body: () => ({ modelId: selectedModel }),
    syncMessagesToServer: false,
  });

  useEffect(() => setSelectedModel(dashboard.selectedModel), [dashboard.selectedModel]);

  const messages = useMemo(() => toDisplayMessages(chat.messages), [chat.messages]);
  const status = connectionStatus(
    agent.readyState,
    chat.status,
    Boolean(agent.connectionError ?? chat.error ?? actionError),
  );
  const error = actionError ?? chat.error?.message ?? agent.connectionError?.message;

  function handleSubmit(): void {
    const text = input.trim();
    if (!text) return;
    setActionError(undefined);
    void chat.sendMessage({ text }).catch(() => setActionError("The message could not be sent."));
    setInput("");
  }

  function handleModelChange(modelId: ModelId): void {
    setSelectedModel(modelId);
    setActionError(undefined);
    void agent.stub
      .selectModel(modelId)
      .catch(() => setActionError("The model selection was rejected."));
  }

  function handleReset(): void {
    chat.clearHistory();
    setActionError(undefined);
    void agent.stub
      .resetInvestigation()
      .catch(() => setActionError("The investigation could not be reset."));
  }

  return (
    <WorkshopShell
      aside={<ThreatDashboard state={dashboard} />}
      description="Investigate a large synthetic HTTP corpus through bounded queries, evidence-backed pivots, persistent findings, and a chronological attack timeline."
      {...(error === undefined ? {} : { error })}
      input={input}
      inputPlaceholder="Investigate unusual authentication activity between 14:00 and 14:30 UTC…"
      messages={messages}
      models={MODEL_DEFINITIONS}
      onInputChange={setInput}
      onModelChange={handleModelChange}
      onReset={handleReset}
      onStop={() => {
        void chat
          .stop()
          .catch(() => setActionError("The active investigation could not be stopped."));
      }}
      onSubmit={handleSubmit}
      resetLabel="Clear investigation"
      selectedModel={selectedModel}
      status={status}
      title="Threat Hunter"
    />
  );
}
