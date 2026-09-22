import type { ThreatAssessment } from "../../agent/state.js";

interface AssessmentPanelProps {
  assessment: ThreatAssessment | null;
}

function mitreReference(techniqueId: string): string {
  return `attack.mitre.org/techniques/${techniqueId.replace(".", "/")}/`;
}

export function MitreTacticsPanel({ assessment }: AssessmentPanelProps) {
  const techniques = assessment?.tactics ?? [];

  return (
    <section className="threat-panel" aria-labelledby="threat-mitre-title">
      <header className="threat-panel__header">
        <div>
          <p>MITRE ATT&CK mapping</p>
          <h2 id="threat-mitre-title">Attack types</h2>
        </div>
        <span aria-label={`${techniques.length} techniques`}>{techniques.length}</span>
      </header>
      {techniques.length === 0 ? (
        <p className="threat-empty">
          No techniques mapped yet. The mapping appears once the investigation is complete.
        </p>
      ) : (
        <ol className="threat-mitre-list">
          {techniques.map((technique) => {
            const rowLabel = technique.evidence.length === 1 ? "evidence row" : "evidence rows";
            return (
              <li key={technique.techniqueId}>
                <div className="threat-mitre__heading">
                  <span className="threat-mitre__id">{technique.techniqueId}</span>
                  <span className="threat-mitre__tactic">{technique.tactic}</span>
                </div>
                <h3>{technique.name}</h3>
                <span className="threat-mitre__evidence">
                  {technique.evidence.length} {rowLabel}
                </span>
                <code className="threat-mitre__reference">
                  {mitreReference(technique.techniqueId)}
                </code>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function ActorGroupsPanel({ assessment }: AssessmentPanelProps) {
  const groups = assessment?.actorGroups ?? [];

  return (
    <section className="threat-panel" aria-labelledby="threat-actors-title">
      <header className="threat-panel__header">
        <div>
          <p>Analyst hypothesis</p>
          <h2 id="threat-actors-title">Actor profiles</h2>
        </div>
        <span aria-label={`${groups.length} profiles`}>{groups.length}</span>
      </header>
      {groups.length === 0 ? (
        <p className="threat-empty">
          No actor profiles yet. Profiles link mapped techniques to plausible actor groups.
        </p>
      ) : (
        <ol className="threat-actor-list">
          {groups.map((group, index) => (
            <li key={`${group.label}-${String(index)}`}>
              <div className="threat-actor__heading">
                <strong>{group.label}</strong>
                <span>{Math.round(group.confidence * 100)}% confidence</span>
              </div>
              <p>{group.summary}</p>
              <div className="threat-actor__techniques">
                {group.techniques.map((technique, techniqueIndex) => (
                  <code key={`${technique}-${String(techniqueIndex)}`}>{technique}</code>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function PredictionPanel({ assessment }: AssessmentPanelProps) {
  const prediction = assessment?.prediction;

  return (
    <section className="threat-panel" aria-labelledby="threat-prediction-title">
      <header className="threat-panel__header">
        <div>
          <p>Forward-looking</p>
          <h2 id="threat-prediction-title">Predicted intent</h2>
        </div>
        {prediction ? <span>{prediction.horizon}</span> : null}
      </header>
      {prediction === undefined ? (
        <p className="threat-empty">
          No prediction yet. The projected next moves appear once the investigation is complete.
        </p>
      ) : (
        <div className="threat-prediction">
          <p className="threat-prediction__summary">{prediction.summary}</p>
          <ol className="threat-prediction-steps">
            {prediction.steps.map((item, index) => (
              <li key={`${item.step}-${String(index)}`}>
                <div className="threat-prediction__heading">
                  <strong>{item.step}</strong>
                  <span className={`threat-likelihood threat-likelihood--${item.likelihood}`}>
                    {item.likelihood}
                  </span>
                </div>
                <p>{item.rationale}</p>
                {item.indicators.length > 0 ? (
                  <ul className="threat-indicators">
                    {item.indicators.map((indicator, indicatorIndex) => (
                      <li key={`${item.step}-indicator-${String(indicatorIndex)}`}>{indicator}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="threat-prediction__caveats">{prediction.caveats}</p>
        </div>
      )}
    </section>
  );
}
