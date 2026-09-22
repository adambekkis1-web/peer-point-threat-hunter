import type { KeyboardEvent } from "react";

import { ResetIcon, SendIcon, StopIcon } from "./icons.js";
import { MessageList } from "./message-list.js";
import { ModelSelector } from "./model-selector.js";
import { StatusBanner } from "./status-banner.js";
import type { WorkshopShellProps } from "./types.js";

export function WorkshopShell({
  title,
  description,
  messages,
  models,
  selectedModel,
  status,
  input,
  error,
  aside,
  headerVisual,
  inputPlaceholder = "Ask Think to investigate, plan, or act…",
  onInputChange,
  onModelChange,
  onSubmit,
  onStop,
  onReset,
  resetLabel = "Reset",
}: WorkshopShellProps) {
  const isBusy = status === "thinking" || status === "streaming";
  const canSubmit = status === "ready" && input.trim().length > 0;

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <main className="pp-layout">
      <section className="pp-chat" aria-labelledby="workshop-title">
        <header className="pp-header">
          <div className="pp-header__copy">
            <p className="pp-eyebrow">Peer Point User Group</p>
            <h1 id="workshop-title">{title}</h1>
            <p>{description}</p>
            {headerVisual ? <div className="pp-header__visual">{headerVisual}</div> : null}
          </div>
          <StatusBanner {...(error === undefined ? {} : { error })} status={status} />
        </header>

        <MessageList messages={messages} thinking={status === "thinking"} />

        <form
          className="pp-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <div className="pp-composer__surface">
            <label className="pp-sr-only" htmlFor="pp-message-input">
              Message
            </label>
            <textarea
              id="pp-message-input"
              name="message"
              placeholder={inputPlaceholder}
              rows={2}
              value={input}
              onChange={(event) => onInputChange(event.currentTarget.value)}
              onKeyDown={handleInputKeyDown}
            />
            <div className="pp-composer__toolbar">
              <div className="pp-composer__meta">
                <ModelSelector
                  disabled={status !== "ready"}
                  models={models}
                  value={selectedModel}
                  onChange={onModelChange}
                />
                <span className="pp-keyboard-hint">
                  Enter to send · Shift + Enter for a new line
                </span>
              </div>
              <div className="pp-composer__actions">
                {onReset ? (
                  <button
                    type="button"
                    className="pp-button pp-button--secondary"
                    onClick={onReset}
                  >
                    <ResetIcon />
                    <span>{resetLabel}</span>
                  </button>
                ) : null}
                {isBusy && onStop ? (
                  <button type="button" className="pp-button pp-button--secondary" onClick={onStop}>
                    <StopIcon />
                    <span>Stop</span>
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="pp-button pp-button--primary"
                  disabled={!canSubmit}
                >
                  <span>Send</span>
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>
      {aside ? <aside className="pp-aside">{aside}</aside> : null}
    </main>
  );
}
