import { lazy, Suspense, useEffect, useRef } from "react";

import { ToolCallCard } from "./tool-call-card.js";
import type { DisplayMessage } from "./types.js";

interface MessageListProps {
  messages: readonly DisplayMessage[];
  thinking?: boolean;
}

const MessageMarkdown = lazy(() =>
  import("./markdown.js").then((module) => ({ default: module.MessageMarkdown })),
);

const ROLE_LABELS: Record<DisplayMessage["role"], string> = {
  user: "You",
  assistant: "Think",
  system: "System",
};

export function MessageList({ messages, thinking = false }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  if (messages.length === 0 && !thinking) {
    return <p className="pp-empty">Ask Think to investigate workshop readiness.</p>;
  }

  return (
    <div className="pp-messages" aria-live="polite">
      <ol>
        {messages.map((message) => (
          <li className={`pp-message pp-message--${message.role}`} key={message.id}>
            <span className="pp-message__role">{ROLE_LABELS[message.role]}</span>
            <div className="pp-message__content">
              {message.parts.map((part, index) =>
                part.type === "text" ? (
                  <div className="pp-markdown" key={`${message.id}-text-${index}`}>
                    <Suspense fallback={<p>{part.text}</p>}>
                      <MessageMarkdown>{part.text}</MessageMarkdown>
                    </Suspense>
                  </div>
                ) : (
                  <ToolCallCard key={`${message.id}-tool-${index}`} part={part} />
                ),
              )}
            </div>
          </li>
        ))}
        {thinking ? (
          <li className="pp-message pp-message--assistant pp-message--thinking">
            <span className="pp-message__role">Think</span>
            <div className="pp-message__content">
              <div className="pp-thinking" aria-label="Think is preparing a response">
                <span />
                <span />
                <span />
              </div>
            </div>
          </li>
        ) : null}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
