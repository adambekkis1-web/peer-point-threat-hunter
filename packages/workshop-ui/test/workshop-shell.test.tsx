import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MODEL_DEFINITIONS, MODEL_IDS } from "@peer-point/workshop-config";

import { WorkshopShell } from "../src/index.js";

const handlers = {
  onInputChange: vi.fn(),
  onModelChange: vi.fn(),
  onSubmit: vi.fn(),
};

describe("WorkshopShell", () => {
  it("renders the approved model choices and ready state", () => {
    const html = renderToStaticMarkup(
      <WorkshopShell
        description="Test the shared shell"
        input="Investigate"
        messages={[]}
        models={MODEL_DEFINITIONS}
        selectedModel={MODEL_IDS[0]}
        status="ready"
        title="Threat Hunter"
        {...handlers}
      />,
    );

    expect(html).toContain("Threat Hunter");
    expect(html).toContain("GLM 5.3 Flash");
    expect(html).toContain("Ready");
    expect(html).not.toContain('disabled=""');
  });

  it("renders safe errors and disables submission", () => {
    const html = renderToStaticMarkup(
      <WorkshopShell
        description="Test the shared shell"
        error="The model is rate limited. Retry shortly."
        input="Investigate"
        messages={[]}
        models={MODEL_DEFINITIONS}
        selectedModel={MODEL_IDS[1]}
        status="error"
        title="Threat Hunter"
        {...handlers}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("rate limited");
    expect(html).toContain('disabled=""');
  });
});
