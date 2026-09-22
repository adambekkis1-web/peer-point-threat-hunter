import {
  QUERY_LEDGER_LIMIT,
  type Finding,
  type QueryRecord,
  type ThreatHunterState,
  type TimelineEvent,
} from "../../agent/state.js";

interface ThreatDashboardProps {
  state: ThreatHunterState;
}

type UnknownRecord = Record<string, unknown>;

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  second: "2-digit",
  timeZone: "UTC",
});

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function asItems<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstValue(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function textValue(record: UnknownRecord, keys: readonly string[], fallback: string): string {
  const value = firstValue(record, keys);
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(record: UnknownRecord, keys: readonly string[], fallback = 0): number {
  const value = firstValue(record, keys);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return "Time unavailable";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : `${DATE_FORMATTER.format(timestamp)} UTC`;
}

function timestampValue(record: UnknownRecord): string | undefined {
  const value = firstValue(record, ["timestamp", "createdAt", "startedAt", "occurredAt"]);
  return typeof value === "string" ? value : undefined;
}

function formatCompactValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  try {
    const formatted = JSON.stringify(value);
    if (!formatted) return "Not specified";
    return formatted.length > 120 ? `${formatted.slice(0, 117)}…` : formatted;
  } catch {
    return "Value unavailable";
  }
}

function displayConfidence(record: UnknownRecord): number {
  const value = firstValue(record, ["confidence"]);
  if (typeof value === "string") {
    const confidenceByLabel: Record<string, number> = { high: 90, medium: 65, low: 35 };
    return confidenceByLabel[value.toLowerCase()] ?? 0;
  }
  const raw = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const percentage = raw <= 1 ? raw * 100 : raw;
  return Math.round(Math.min(100, Math.max(0, percentage)));
}

function severityValue(record: UnknownRecord): string {
  return textValue(record, ["severity"], "info").toLowerCase();
}

function evidenceFor(finding: Finding): unknown[] {
  const record = asRecord(finding);
  const rows = firstValue(record, ["evidenceRows", "rows"]);
  if (Array.isArray(rows)) return rows;
  const evidence = record.evidence;
  return Array.isArray(evidence) ? evidence : evidence === undefined ? [] : [evidence];
}

function EvidenceRow({ evidence }: { evidence: unknown }) {
  if (typeof evidence === "string") {
    return <p className="threat-evidence__statement">{evidence}</p>;
  }

  const row = asRecord(evidence);
  const timestamp = timestampValue(row);
  const event = textValue(row, ["event", "type"], "Observed request");
  const method = textValue(row, ["method"], "");
  const path = textValue(row, ["path"], "");
  const ip = textValue(row, ["clientIp", "ip"], "IP unavailable");
  const requestId = textValue(row, ["requestId", "id"], "No request ID");
  const status = firstValue(row, ["status"]);
  const account = firstValue(row, ["accountId"]);

  return (
    <div className="threat-evidence__row">
      <div className="threat-evidence__primary">
        <strong>{event.replaceAll("-", " ")}</strong>
        {timestamp ? <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time> : null}
      </div>
      {method || path ? (
        <code>
          {method} {path}
        </code>
      ) : null}
      <dl>
        <div>
          <dt>Source</dt>
          <dd>{ip}</dd>
        </div>
        {status !== undefined ? (
          <div>
            <dt>Status</dt>
            <dd>{formatCompactValue(status)}</dd>
          </div>
        ) : null}
        {account !== undefined ? (
          <div>
            <dt>Account</dt>
            <dd>{formatCompactValue(account)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Request</dt>
          <dd title={requestId}>{requestId}</dd>
        </div>
      </dl>
    </div>
  );
}

function Overview({
  findings,
  queries,
  status,
}: {
  findings: readonly Finding[];
  queries: readonly QueryRecord[];
  status: string;
}) {
  const criticalCount = findings.filter(
    (finding) => severityValue(asRecord(finding)) === "critical",
  ).length;
  const evidenceCount = findings.reduce((count, finding) => count + evidenceFor(finding).length, 0);

  return (
    <section className="threat-overview" aria-labelledby="threat-overview-title">
      <header>
        <div>
          <p>Investigation</p>
          <h2 id="threat-overview-title">Threat overview</h2>
        </div>
        <span className={`threat-status threat-status--${status.toLowerCase()}`}>{status}</span>
      </header>
      <dl className="threat-metrics">
        <div>
          <dt>Queries</dt>
          <dd>{queries.length}</dd>
        </div>
        <div>
          <dt>Findings</dt>
          <dd>{findings.length}</dd>
        </div>
        <div>
          <dt>Critical</dt>
          <dd>{criticalCount}</dd>
        </div>
        <div>
          <dt>Evidence rows</dt>
          <dd>{evidenceCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function QueryLedger({ queries }: { queries: readonly QueryRecord[] }) {
  const visibleQueries = queries.slice(-QUERY_LEDGER_LIMIT).reverse();

  return (
    <section className="threat-panel" aria-labelledby="threat-query-title">
      <header className="threat-panel__header">
        <div>
          <p>Bounded search</p>
          <h2 id="threat-query-title">Query ledger</h2>
        </div>
        <span aria-label={`${queries.length} total queries`}>{queries.length}</span>
      </header>
      {visibleQueries.length === 0 ? (
        <p className="threat-empty">
          No log queries yet. Ask Think to investigate unusual activity.
        </p>
      ) : (
        <ol className="threat-query-list" aria-label="Most recent log queries">
          {visibleQueries.map((query, index) => {
            const record = asRecord(query);
            const id = textValue(record, ["id"], `query-${String(index)}`);
            const name = textValue(record, ["toolName", "operation", "type"], "queryLogs");
            const timestamp = timestampValue(record);
            const input = asRecord(firstValue(record, ["input", "filters", "query"]));
            const resultCount = numberValue(record, ["resultCount", "rowCount", "count"]);
            const source = textValue(record, ["source"], "");
            const truncated = firstValue(record, ["truncated"]) === true;

            return (
              <li key={id}>
                <div className="threat-query__heading">
                  <strong>{name}</strong>
                  {timestamp ? (
                    <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time>
                  ) : null}
                </div>
                {Object.keys(input).length > 0 ? (
                  <dl className="threat-query__filters">
                    {Object.entries(input).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd title={formatCompactValue(value)}>{formatCompactValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="threat-query__unfiltered">No filters recorded</p>
                )}
                <footer>
                  <span>{resultCount} rows returned</span>
                  <span>
                    {source ? <span className="threat-query__source">{source}</span> : null}
                    {truncated ? (
                      <span className="threat-query__truncated">Result capped</span>
                    ) : null}
                  </span>
                </footer>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Findings({ findings }: { findings: readonly Finding[] }) {
  return (
    <section className="threat-panel" aria-labelledby="threat-findings-title">
      <header className="threat-panel__header">
        <div>
          <p>Grounded assessment</p>
          <h2 id="threat-findings-title">Findings</h2>
        </div>
        <span aria-label={`${findings.length} findings`}>{findings.length}</span>
      </header>
      {findings.length === 0 ? (
        <p className="threat-empty">
          No findings recorded. Evidence-backed conclusions will appear here.
        </p>
      ) : (
        <ol className="threat-findings">
          {findings.map((finding, index) => {
            const record = asRecord(finding);
            const id = textValue(record, ["id"], `finding-${String(index)}`);
            const severity = severityValue(record);
            const confidence = displayConfidence(record);
            const title = textValue(record, ["title"], "Untitled finding");
            const summary = textValue(record, ["summary", "description"], "");
            const evidence = evidenceFor(finding);

            return (
              <li className={`threat-finding threat-finding--${severity}`} key={id}>
                <div className="threat-finding__heading">
                  <div>
                    <span className={`threat-severity threat-severity--${severity}`}>
                      {severity}
                    </span>
                    <h3>{title}</h3>
                  </div>
                  <div className="threat-confidence">
                    <span>{confidence}% confidence</span>
                    <meter
                      aria-label={`${title} confidence`}
                      min={0}
                      max={100}
                      low={50}
                      high={80}
                      optimum={100}
                      value={confidence}
                    />
                  </div>
                </div>
                {summary ? <p className="threat-finding__summary">{summary}</p> : null}
                <div className="threat-evidence">
                  <h4>Grounded evidence</h4>
                  {evidence.length === 0 ? (
                    <p className="threat-evidence__empty">No evidence rows attached.</p>
                  ) : (
                    <ol>
                      {evidence.map((row, evidenceIndex) => (
                        <li key={`${id}-evidence-${String(evidenceIndex)}`}>
                          <EvidenceRow evidence={row} />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AttackTimeline({ events }: { events: readonly TimelineEvent[] }) {
  const chronological = events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(timestampValue(asRecord(left.event)) ?? "");
      const rightTime = Date.parse(timestampValue(asRecord(right.event)) ?? "");
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return left.index - right.index;
      return leftTime - rightTime || left.index - right.index;
    });

  return (
    <section className="threat-panel" aria-labelledby="threat-timeline-title">
      <header className="threat-panel__header">
        <div>
          <p>Attack sequence</p>
          <h2 id="threat-timeline-title">Chronological timeline</h2>
        </div>
        <span aria-label={`${events.length} timeline events`}>{events.length}</span>
      </header>
      {chronological.length === 0 ? (
        <p className="threat-empty">No attack sequence established yet.</p>
      ) : (
        <ol className="threat-timeline">
          {chronological.map(({ event, index }) => {
            const record = asRecord(event);
            const row = asRecord(firstValue(record, ["evidence", "row"]));
            const details = { ...row, ...record };
            const id = textValue(details, ["id", "requestId"], `event-${String(index)}`);
            const timestamp = timestampValue(details);
            const title = textValue(details, ["title", "event", "label", "type"], "Observed event");
            const detail = textValue(details, ["detail", "description", "summary"], "");
            const source = textValue(details, ["clientIp", "ip", "source"], "");
            const method = textValue(details, ["method"], "");
            const path = textValue(details, ["path"], "");
            const requestId = textValue(details, ["requestId"], "");

            return (
              <li key={id}>
                <span className="threat-timeline__marker" aria-hidden="true" />
                <div>
                  {timestamp ? (
                    <time dateTime={timestamp}>{formatTimestamp(timestamp)}</time>
                  ) : null}
                  <h3>{title.replaceAll("-", " ")}</h3>
                  {detail ? <p>{detail}</p> : null}
                  {method || path ? (
                    <code>
                      {method} {path}
                    </code>
                  ) : null}
                  {source || requestId ? (
                    <span className="threat-timeline__source">
                      {[source, requestId].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function ThreatDashboard({ state }: ThreatDashboardProps) {
  const model = asRecord(state);
  const findings = asItems<Finding>(model.findings);
  const queries = asItems<QueryRecord>(
    firstValue(model, ["queries", "queryLedger", "queryHistory"]),
  );
  const timeline = asItems<TimelineEvent>(model.timeline);
  const status = textValue(model, ["status"], "idle");

  return (
    <div className="threat-dashboard">
      <Overview findings={findings} queries={queries} status={status} />
      <QueryLedger queries={queries} />
      <Findings findings={findings} />
      <AttackTimeline events={timeline} />
    </div>
  );
}
