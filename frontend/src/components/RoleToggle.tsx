import type { Role } from "../api/types";

interface Props {
  value: Role;
  onChange: (role: Role) => void;
}

export function RoleToggle({ value, onChange }: Props) {
  return (
    <div className="role-toggle" role="tablist" aria-label="Who are you?">
      <span className={`role-toggle-thumb ${value}`} aria-hidden />
      <button
        role="tab"
        aria-selected={value === "employer"}
        className={value === "employer" ? "active" : ""}
        onClick={() => onChange("employer")}
      >
        I'm hiring
      </button>
      <button
        role="tab"
        aria-selected={value === "applicant"}
        className={value === "applicant" ? "active" : ""}
        onClick={() => onChange("applicant")}
      >
        I'm looking for work
      </button>
    </div>
  );
}
