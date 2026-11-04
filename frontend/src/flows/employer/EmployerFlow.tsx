import { useState, type FormEvent } from "react";
import type { Account, CandidateSearchResult } from "../../api/types";
import { searchCandidates } from "../../api";
import { AuthForm } from "../../components/AuthForm";
import { CandidateCard } from "./CandidateCard";

interface Props {
  account: Account | null;
  onAccountChange: (a: Account | null) => void;
}

const EXAMPLES = [
  "Senior React developer in London, 5+ years, design systems experience",
  "Machine learning engineer comfortable with LLMs and AWS",
  "Product designer who does their own user research",
];

/**
 * Employer journey: write a prompt → see matches.
 * Signed-out employers see the results blurred, with a sign-in panel on top.
 */
export function EmployerFlow({ account, onAccountChange }: Props) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<CandidateSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const unlocked = account?.role === "employer";

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;
    setSearching(true);
    setResult(await searchCandidates(prompt.trim()));
    setSearching(false);
  }

  return (
    <div className="flow">
      <form className="card prompt-card" onSubmit={search}>
        <label htmlFor="role-prompt" className="prompt-label">
          Who are you looking for?
        </label>
        <textarea
          id="role-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search();
          }}
          placeholder="Describe the role, the skills that matter, location, seniority…"
        />
        <div className="prompt-footer">
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="example" onClick={() => setPrompt(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={searching || !prompt.trim()}>
            {searching ? "Scanning…" : "Find candidates"}
          </button>
        </div>
      </form>

      {searching && (
        <div className="scanning">
          <span className="pulse" />
          Scanning LinkedIn and the Table7 applicant pool…
        </div>
      )}

      {result && !searching && (
        <section className="results">
          <div className="results-head">
            <h2>{result.candidates.length} matches</h2>
            <p className="muted small">for "{result.prompt}"</p>
          </div>

          <div className={`results-wrap ${unlocked ? "" : "locked"}`}>
            <div className="results-grid" aria-hidden={!unlocked}>
              {result.candidates.map((c) => (
                <CandidateCard key={c.id} candidate={c} locked={!unlocked} />
              ))}
            </div>

            {!unlocked && (
              <div className="unlock">
                <div className="card card-narrow">
                  <AuthForm
                    role="employer"
                    title="See who matched"
                    subtitle={
                      account?.role === "applicant"
                        ? "You're signed in as an applicant. Use an employer account to view candidates."
                        : "Create a free employer account or sign in to view these candidates."
                    }
                    onDone={onAccountChange}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
