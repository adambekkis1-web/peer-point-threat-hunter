import type { DisplayMessagePart } from "./types.js";
import { ToolIcon } from "./icons.js";

type ToolPart = Extract<DisplayMessagePart, { type: "tool" }>;

function formatPreview(value: unknown): string {
  if (value === undefined) return "Not available";

  let formatted: string;
  try {
    formatted = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    formatted = "Value could not be serialized";
  }

  const limit = 4_000;
  return formatted.length > limit ? `${formatted.slice(0, limit)}\n… preview truncated` : formatted;
}

export function ToolCallCard({ part }: { part: ToolPart }) {
  const hasDetails = part.input !== undefined || part.output !== undefined;

  return (
    <details className={`pp-tool pp-tool--${part.state}`}>
      <summary>
        <ToolIcon />
        <div className="pp-tool__heading">
          <strong>{part.toolName}</strong>
          <span>{part.summary ?? part.state}</span>
        </div>
        {hasDetails ? <span className="pp-tool__chevron" aria-hidden="true" /> : null}
      </summary>
      {hasDetails ? (
        <div className="pp-tool__details">
          {part.input !== undefined ? (
            <section>
              <h4>Input</h4>
              <pre>{formatPreview(part.input)}</pre>
            </section>
          ) : null}
          {part.output !== undefined ? (
            <section>
              <h4>Result</h4>
              <pre>{formatPreview(part.output)}</pre>
            </section>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
