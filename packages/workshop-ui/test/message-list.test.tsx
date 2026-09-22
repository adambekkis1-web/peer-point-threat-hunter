import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MessageList, ToolCallCard } from "../src/index.js";
import { MessageMarkdown } from "../src/markdown.js";

describe("MessageList", () => {
  it("renders safe Markdown formatting", () => {
    const html = renderToStaticMarkup(
      <MessageMarkdown>Prefer **concise briefs** with `evidence`.</MessageMarkdown>,
    );

    expect(html).toContain("<strong>concise briefs</strong>");
    expect(html).toContain("<code>evidence</code>");
  });

  it("shows a thinking indicator before text streams", () => {
    const html = renderToStaticMarkup(<MessageList messages={[]} thinking />);
    expect(html).toContain("Think is preparing a response");
    expect(html).toContain("pp-thinking");
  });

  it("renders tool details collapsed with input and result", () => {
    const html = renderToStaticMarkup(
      <ToolCallCard
        part={{
          type: "tool",
          toolName: "recordFinding",
          state: "output",
          summary: "Tool completed",
          input: { title: "Email readiness" },
          output: { ok: true },
        }}
      />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Input");
    expect(html).toContain("Result");
    expect(html).toContain("Email readiness");
  });
});
