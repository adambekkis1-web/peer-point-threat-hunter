interface LogFields {
  event: string;
  operation?: string;
  outcome?: "success" | "failure";
  modelId?: string;
  toolName?: string;
  durationMs?: number;
  tokenCount?: number;
  errorCode?: string;
}

function base(fields: LogFields): Record<string, unknown> {
  return { city: "montreal", card: "threat-hunter", environment: "solution", ...fields };
}

export function logInfo(fields: LogFields): void {
  console.log(base(fields));
}

export function logError(fields: LogFields): void {
  console.error(base(fields));
}
