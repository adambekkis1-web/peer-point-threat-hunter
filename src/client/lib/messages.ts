import type { DisplayMessage, DisplayMessagePart } from "@peer-point/workshop-ui";
import { getToolInput, getToolOutput, getToolPartState } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

type DisplayToolState = Extract<DisplayMessagePart, { type: "tool" }>["state"];

function mapToolState(part: UIMessage["parts"][number]): DisplayToolState {
  const state = getToolPartState(part);
  if (state === "error" || state === "denied") return "error";
  if (state === "waiting-approval" || state === "approved") return "approval";
  if (state === "complete") return "output";
  return "input";
}

function sanitizeTextPart(text: string, startsInsideThink: boolean) {
  const tagPattern = /<\/?think>/gi;
  let insideThink = startsInsideThink;
  let cursor = 0;
  let visible = "";

  for (const match of text.matchAll(tagPattern)) {
    const index = match.index;
    if (index === undefined) continue;
    if (!insideThink) visible += text.slice(cursor, index);
    insideThink = match[0].toLowerCase() === "<think>";
    cursor = index + match[0].length;
  }

  if (!insideThink) visible += text.slice(cursor);
  return { text: visible.trim(), insideThink };
}

export function toDisplayMessages(messages: readonly UIMessage[]): DisplayMessage[] {
  return messages.flatMap<DisplayMessage>((message) => {
    let insideThink = false;
    const parts = message.parts.flatMap<DisplayMessagePart>((part) => {
      if (part.type === "text") {
        const sanitized = sanitizeTextPart(part.text, insideThink);
        insideThink = sanitized.insideThink;
        return sanitized.text ? [{ type: "text", text: sanitized.text }] : [];
      }
      if (!isToolUIPart(part)) return [];

      const state = mapToolState(part);
      const input = getToolInput(part);
      const output = getToolOutput(part);
      return [
        {
          type: "tool",
          toolName: getToolName(part),
          state,
          summary: state === "output" ? "Tool completed" : getToolPartState(part),
          ...(input === undefined ? {} : { input }),
          ...(output === undefined ? {} : { output }),
        },
      ];
    });

    return parts.length > 0 ? [{ id: message.id, role: message.role, parts }] : [];
  });
}
