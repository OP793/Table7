import { useEffect, useState } from "react";
import type { Account, Role } from "./api/types";
import { getCurrentAccount, logOut } from "./api";
import { RoleToggle } from "./components/RoleToggle";
import { ApplicantFlow } from "./flows/applicant/ApplicantFlow";
import { EmployerFlow } from "./flows/employer/EmployerFlow";

const ROLE_KEY = "table7.role";

function initialRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    if (r === "applicant" || r === "employer") return r;
  } catch {
    /* ignore */
  }
  return "employer";
}

export default function App() {
  const [role, setRole] = useState<Role>(initialRole);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentAccount()
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore */
    }
  }, [role]);

  async function handleLogOut() {
    await logOut();
    setAccount(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T7</span>
          <span className="brand-name">Table7</span>
        </div>
        <RoleToggle value={role} onChange={setRole} />
        <div className="topbar-account">
          {account ? (
            <>
              <span className="account-chip" title={account.email}>
                {account.name}
                <small>{account.role === "employer" ? "Employer" : "Applicant"}</small>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={handleLogOut}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="hero" key={role}>
        {role === "employer" ? (
          <>
            <h1>Describe the role. We'll find the people.</h1>
            <p>
              Skip the job board. Tell our AI who you need and it scans LinkedIn and our applicant
              pool for the best fits.
            </p>
          </>
        ) : (
          <>
            <h1>Let the right employers find you.</h1>
            <p>
              Connect your LinkedIn and CV once. Every time an employer searches, our AI checks
              whether you're the fit.
            </p>
          </>
        )}
      </section>

      {/* Both flows live side by side on one track; the toggle slides between them. */}
      <main className="track-viewport">
        <div className={`track ${role === "applicant" ? "show-applicant" : "show-employer"}`}>
          <div className="panel panel-employer" aria-hidden={role !== "employer"}>
            {!loading && <EmployerFlow account={account} onAccountChange={setAccount} />}
          </div>
          <div className="panel panel-applicant" aria-hidden={role !== "applicant"}>
            {!loading && <ApplicantFlow account={account} onAccountChange={setAccount} />}
          </div>
        </div>
      </main>

      <footer className="footer">Table7 · frontend preview with mock data</footer>
    </div>
  );
}
