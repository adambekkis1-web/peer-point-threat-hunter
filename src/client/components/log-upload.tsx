import { useRef, useState } from "react";

import { logEntrySchema, type LogEntry } from "../../services/log-api.js";

const MAX_UPLOAD_BYTES = 1_024 * 1_024;
const MAX_UPLOAD_ROWS = 1_000;
const PREVIEW_ROWS = 5;

interface LogUploadPanelProps {
  onSendPrompt: (prompt: string) => void;
}

interface ImportSummary {
  fileName: string;
  rows: readonly LogEntry[];
  rejectedCount: number;
  from: string | undefined;
  to: string | undefined;
  ips: readonly string[];
  events: readonly string[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  second: "2-digit",
  timeZone: "UTC",
});

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : `${DATE_FORMATTER.format(timestamp)} UTC`;
}

function summarize(
  fileName: string,
  rows: readonly LogEntry[],
  rejectedCount: number,
): ImportSummary {
  const timestamps = rows.map((row) => row.timestamp).sort();
  const ips = [...new Set(rows.map((row) => row.clientIp))].sort();
  const events = [...new Set(rows.map((row) => row.event))].sort();
  return {
    fileName,
    rows,
    rejectedCount,
    from: timestamps.at(0),
    to: timestamps.at(-1),
    ips,
    events,
  };
}

type ImportFormat = "json" | "ndjson" | "csv";

const CSV_NUMERIC_FIELDS = new Set(["asn", "status"]);
const CSV_NULLABLE_FIELDS = new Set(["sessionId"]);

function detectFormat(fileName: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return "ndjson";
  return "json";
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRows(text: string): unknown[] {
  const lines = splitLines(text);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const raw = (values[index] ?? "").trim();
      if (CSV_NULLABLE_FIELDS.has(header) && (raw === "" || raw.toLowerCase() === "null")) {
        row[header] = null;
      } else if (CSV_NUMERIC_FIELDS.has(header)) {
        row[header] = raw === "" ? undefined : Number(raw);
      } else {
        row[header] = raw;
      }
    });
    return row;
  });
}

function parseNdjsonRows(text: string): { rows: unknown[] } | { error: string } {
  const rows: unknown[] = [];
  for (const line of splitLines(text)) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      return { error: "The file contains a line that is not valid JSON." };
    }
  }
  return { rows };
}

function parseRows(text: string, format: ImportFormat): { rows: unknown[] } | { error: string } {
  if (format === "csv") {
    const rows = parseCsvRows(text);
    return rows.length === 0 ? { error: "No rows found in the CSV file." } : { rows };
  }
  if (format === "ndjson") return parseNdjsonRows(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "The file is not valid JSON." };
  }
  if (!Array.isArray(parsed)) return { error: "Expected a JSON array of log rows." };
  return { rows: parsed };
}

function importRows(
  text: string,
  fileName: string,
): { summary: ImportSummary } | { error: string } {
  const outcome = parseRows(text, detectFormat(fileName));
  if ("error" in outcome) return outcome;
  const rows: LogEntry[] = [];
  let rejectedCount = 0;
  for (const item of outcome.rows) {
    if (rows.length >= MAX_UPLOAD_ROWS) {
      rejectedCount += 1;
      continue;
    }
    const result = logEntrySchema.safeParse(item);
    if (result.success) rows.push(result.data);
    else rejectedCount += 1;
  }
  if (rows.length === 0) return { error: "No valid log rows found in the file." };
  return { summary: summarize(fileName, rows, rejectedCount) };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error("read-failed"));
    };
    reader.readAsText(file);
  });
}

export function LogUploadPanel({ onSendPrompt }: LogUploadPanelProps) {
  const [summary, setSummary] = useState<ImportSummary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File): Promise<void> {
    if (file.size > MAX_UPLOAD_BYTES) {
      setSummary(undefined);
      setError("File exceeds 1 MiB.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const text = await readFile(file);
      const outcome = importRows(text, file.name);
      if ("error" in outcome) {
        setSummary(undefined);
        setError(outcome.error);
        return;
      }
      setSummary(outcome.summary);
    } catch {
      setSummary(undefined);
      setError("The file could not be read.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function sendRangePrompt(): void {
    if (summary?.from === undefined || summary.to === undefined) return;
    onSendPrompt(
      `Investigate authentication activity between ${summary.from} and ${summary.to} UTC with the central log API, using bounded three-hour queries.`,
    );
  }

  function sendIpPrompt(ip: string): void {
    const range =
      summary?.from !== undefined && summary.to !== undefined
        ? ` between ${summary.from} and ${summary.to} UTC`
        : "";
    onSendPrompt(`Profile ${ip}${range} and investigate its activity with the central log API.`);
  }

  function sendEventPrompt(event: string): void {
    const range =
      summary?.from !== undefined && summary.to !== undefined
        ? ` between ${summary.from} and ${summary.to} UTC`
        : "";
    onSendPrompt(`Investigate ${event} events${range} with the central log API.`);
  }

  const previewRows = summary?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const extraRows = (summary?.rows.length ?? 0) - previewRows.length;

  return (
    <section className="threat-panel" aria-labelledby="threat-upload-title">
      <header className="threat-panel__header">
        <div>
          <p>Bring your own evidence</p>
          <h2 id="threat-upload-title">Import logs</h2>
        </div>
        {summary ? <span>{summary.rows.length} rows</span> : null}
      </header>
      <div className="threat-upload">
        <label
          className="threat-upload__label threat-upload__label--primary"
          htmlFor="threat-upload-input"
        >
          {busy ? "Reading file…" : summary ? "Import another file" : "Import logs"}
        </label>
        <input
          ref={inputRef}
          id="threat-upload-input"
          className="threat-upload__input"
          type="file"
          accept=".json,.ndjson,.jsonl,.csv,application/json,text/csv"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) void handleFile(file);
          }}
        />
        <p className="threat-upload__note">
          Accepts JSON, NDJSON/JSONL, or CSV. Local only: rows are validated in your browser and
          never sent to the server or used as evidence.
        </p>
        {error ? <p className="threat-upload__error">{error}</p> : null}
        {summary ? (
          <>
            <dl className="threat-upload__meta">
              <div>
                <dt>Range</dt>
                <dd>
                  {summary.from && summary.to
                    ? `${formatTimestamp(summary.from)} → ${formatTimestamp(summary.to)}`
                    : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Rejected</dt>
                <dd>{summary.rejectedCount}</dd>
              </div>
            </dl>
            <div className="threat-upload__leads">
              <button
                type="button"
                className="threat-lead"
                onClick={sendRangePrompt}
                disabled={!summary.from || !summary.to}
              >
                Investigate range
              </button>
              {summary.ips.map((ip) => (
                <button
                  type="button"
                  className="threat-lead"
                  key={ip}
                  onClick={() => sendIpPrompt(ip)}
                >
                  Profile {ip}
                </button>
              ))}
              {summary.events.map((event) => (
                <button
                  type="button"
                  className="threat-lead"
                  key={event}
                  onClick={() => sendEventPrompt(event)}
                >
                  Investigate {event.replaceAll("-", " ")}
                </button>
              ))}
            </div>
            <div className="threat-upload__preview">
              <h3>Preview (not evidence)</h3>
              <ol>
                {previewRows.map((row, index) => (
                  <li key={`${row.requestId}-${String(index)}`}>
                    <time dateTime={row.timestamp}>{formatTimestamp(row.timestamp)}</time>
                    <code>
                      {row.event} {row.clientIp} {row.path}
                    </code>
                  </li>
                ))}
              </ol>
              {extraRows > 0 ? (
                <p className="threat-upload__more">+{extraRows} more rows in this file</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
