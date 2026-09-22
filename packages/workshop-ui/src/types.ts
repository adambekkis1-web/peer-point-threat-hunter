import type { ModelDefinition, ModelId } from "@peer-point/workshop-config";
import type { ReactNode } from "react";

export type ConnectionStatus = "connecting" | "ready" | "thinking" | "streaming" | "error";

export type DisplayMessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolName: string;
      state: "input" | "approval" | "output" | "error";
      summary?: string;
      input?: unknown;
      output?: unknown;
    };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: readonly DisplayMessagePart[];
}

export interface WorkshopShellProps {
  title: string;
  description: string;
  messages: readonly DisplayMessage[];
  models: readonly ModelDefinition[];
  selectedModel: ModelId;
  status: ConnectionStatus;
  input: string;
  error?: string;
  aside?: ReactNode;
  headerVisual?: ReactNode;
  inputPlaceholder?: string;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: ModelId) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onReset?: () => void;
  resetLabel?: string;
}
