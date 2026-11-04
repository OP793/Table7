import { useEffect, useState } from "react";
import type { Account, MembershipPlan } from "../../api/types";
import { getMembershipPlans, purchaseMembership } from "../../api";

interface Props {
  onPaid: (account: Account) => void;
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

export function MembershipStep({ onPaid }: Props) {
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [selected, setSelected] = useState<string>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMembershipPlans().then(setPlans);
  }, []);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      onPaid(await purchaseMembership(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Choose your membership</h2>
      <p className="muted">
        Members are put in front of employers automatically whenever an AI search matches their skills.
      </p>

      {!plans ? (
        <p className="muted">Loading plans…</p>
      ) : (
        <div className="plans">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`plan ${selected === p.id ? "selected" : ""}`}
              onClick={() => setSelected(p.id)}
              aria-pressed={selected === p.id}
            >
              <span className="plan-name">{p.name}</span>
              <span className="plan-price">
                {formatPrice(p.priceMonthly, p.currency)}
                <small>/month</small>
              </span>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <span className="muted small">Payment is mocked — no card needed yet.</span>
        <button className="btn btn-primary" onClick={pay} disabled={busy || !plans}>
          {busy ? "Processing…" : "Pay & continue"}
        </button>
      </div>
    </div>
  );
}
