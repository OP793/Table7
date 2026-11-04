import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Account, ApplicantProfile } from "../../api/types";
import { connectLinkedIn, getMyProfile, updateMyProfile, uploadCv } from "../../api";

interface Props {
  account: Account;
}

export function ProfileStep({ account }: Props) {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [linking, setLinking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMyProfile().then(setProfile);
  }, [account.id]);

  if (!profile) return <div className="card"><p className="muted">Loading your profile…</p></div>;

  const set = <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) =>
    setProfile({ ...profile, [key]: value });

  function addSkill() {
    const s = skillDraft.trim();
    if (s && !profile!.skills.includes(s)) set("skills", [...profile!.skills, s]);
    setSkillDraft("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfile(await updateMyProfile(profile!));
    setSaving(false);
    setSavedAt(new Date());
  }

  async function linkLinkedIn() {
    setLinking(true);
    setProfile(await connectLinkedIn());
    setLinking(false);
  }

  async function onCvChosen(file: File | undefined) {
    if (file) setProfile(await uploadCv(file));
  }

  const completeness = [
    profile.headline,
    profile.location,
    profile.about,
    profile.skills.length > 0,
    profile.linkedinConnected,
    profile.cvFileName,
  ].filter(Boolean).length;
  const pct = Math.round((completeness / 6) * 100);

  return (
    <form className="profile" onSubmit={save}>
      <aside className="card profile-side">
        <div className="avatar">{initials(profile.fullName || account.name)}</div>
        <h2>{profile.fullName || account.name}</h2>
        <p className="muted">{profile.headline || "Add a headline"}</p>
        <span className="badge badge-member">Member</span>

        <div className="completeness">
          <div className="completeness-row">
            <span>Profile strength</span>
            <strong>{pct}%</strong>
          </div>
          <div className="bar"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="connect">
          <div className="connect-row">
            <div>
              <strong>LinkedIn</strong>
              <p className="muted small">{profile.linkedinConnected ? "Connected" : "Not connected"}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={linkLinkedIn} disabled={linking}>
              {linking ? "Connecting…" : profile.linkedinConnected ? "Re-sync" : "Connect"}
            </button>
          </div>
          <div className="connect-row">
            <div>
              <strong>CV</strong>
              <p className="muted small">{profile.cvFileName ?? "No file uploaded"}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>
              {profile.cvFileName ? "Replace" : "Upload"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.doc,.docx"
              hidden
              onChange={(e) => onCvChosen(e.target.files?.[0])}
            />
          </div>
        </div>

        <label className="switch">
          <input type="checkbox" checked={profile.visible} onChange={(e) => set("visible", e.target.checked)} />
          <span>Visible to employers</span>
        </label>
      </aside>

      <section className="card profile-main">
        <h2>Edit profile</h2>
        <div className="grid-2">
          <label>
            Full name
            <input value={profile.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </label>
          <label>
            Location
            <input value={profile.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. London / Remote" />
          </label>
        </div>
        <label>
          Headline
          <input value={profile.headline} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Frontend Engineer" />
        </label>
        <label>
          About
          <textarea rows={4} value={profile.about} onChange={(e) => set("about", e.target.value)} placeholder="What you do and what you're looking for." />
        </label>

        <label htmlFor="skill-input">Skills</label>
        <div className="chips">
          {profile.skills.map((s) => (
            <span key={s} className="chip">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => set("skills", profile.skills.filter((x) => x !== s))}>
                ×
              </button>
            </span>
          ))}
          <input
            id="skill-input"
            className="chip-input"
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            onBlur={addSkill}
            placeholder="Type a skill, press Enter"
          />
        </div>

        <div className="actions">
          <span className="muted small">{savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ""}</span>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </section>
    </form>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
