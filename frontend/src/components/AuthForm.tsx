import { useState, type FormEvent } from "react";
import type { Account, Role } from "../api/types";
import { logIn, signUp } from "../api";

interface Props {
  role: Role;
  onDone: (account: Account) => void;
  initialMode?: "signup" | "login";
  title?: string;
  subtitle?: string;
}

export function AuthForm({ role, onDone, initialMode = "signup", title, subtitle }: Props) {
  const [mode, setMode] = useState<"signup" | "login">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account =
        mode === "signup"
          ? await signUp({ role, name, email, password, company: role === "employer" ? company : undefined })
          : await logIn({ role, email, password });
      onDone(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {title && <h2>{title}</h2>}
      {subtitle && <p className="muted">{subtitle}</p>}

      <div className="segmented">
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
          Create account
        </button>
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
          Sign in
        </button>
      </div>

      {mode === "signup" && (
        <label>
          Full name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
      )}
      {mode === "signup" && role === "employer" && (
        <label>
          Company
          <input required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
        </label>
      )}
      <label>
        Email
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Password
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
