import type { CandidateMatch } from "../../api/types";

interface Props {
  candidate: CandidateMatch;
  locked: boolean;
}

export function CandidateCard({ candidate: c, locked }: Props) {
  return (
    <article className="candidate">
      <header>
        <div className="avatar avatar-sm">{locked ? "?" : c.name.split(" ").map((p) => p[0]).join("")}</div>
        <div className="candidate-id">
          <h3>{locked ? "Hidden candidate" : c.name}</h3>
          <p className="muted small">
            {c.headline} · {c.location}
          </p>
        </div>
        <div className="score" title="AI match score">
          {c.matchScore}
          <small>%</small>
        </div>
      </header>

      <p className="reason">{c.reason}</p>

      <div className="chips chips-static">
        {c.skills.map((s) => (
          <span key={s} className="chip">{s}</span>
        ))}
      </div>

      <footer>
        <span className={`badge ${c.source === "member" ? "badge-member" : "badge-linkedin"}`}>
          {c.source === "member" ? "Table7 member" : "Found on LinkedIn"}
        </span>
        {!locked && (
          <a className="btn btn-secondary btn-sm" href={c.profileUrl} target="_blank" rel="noreferrer">
            View profile
          </a>
        )}
      </footer>
    </article>
  );
}
