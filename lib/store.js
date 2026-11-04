import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// STAY_NORTH_DATA_DIR lets tests use a throwaway folder.
export const DATA_DIR = process.env.STAY_NORTH_DATA_DIR || join(__dirname, "..", "data");

// Older shared pool file (kept empty now that only real applicants are shown).
const SAMPLE_FILE = join(DATA_DIR, "candidates.json");
// Real applicants who made an account. Gitignored: it holds personal data.
const APPLICANTS_FILE = join(DATA_DIR, "applicants.json");

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Write to a temp file then rename, so a crash mid-write can't leave half a file.
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}

export const dataFile = (name) => join(DATA_DIR, name);

function readList(file) {
  const v = readJson(file, []);
  return Array.isArray(v) ? v : [];
}

/** Everyone employers can search: sample graduates plus real applicants who haven't hidden their profile. */
export function getPool() {
  const applicants = readList(APPLICANTS_FILE).filter((a) => a.visible !== false);
  return [...readList(SAMPLE_FILE), ...applicants];
}

export function getApplicantByAccount(accountId) {
  return readList(APPLICANTS_FILE).find((a) => a.account_id === accountId) || null;
}

/**
 * Creates or replaces the applicant profile belonging to an account.
 * Only the extracted profile is stored, never the CV file itself.
 */
export function saveApplicant(accountId, profile) {
  const list = readList(APPLICANTS_FILE);
  const i = list.findIndex((a) => a.account_id === accountId);
  const now = new Date().toISOString();
  const existing = i >= 0 ? list[i] : null;
  const applicant = {
    ...profile,
    id: existing?.id || `pool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    account_id: accountId,
    source: "pool",
    visible: profile.visible === undefined ? existing?.visible ?? true : Boolean(profile.visible),
    consent_at: existing?.consent_at || now,
    updated_at: now,
  };
  if (i >= 0) list[i] = applicant;
  else list.push(applicant);
  writeJson(APPLICANTS_FILE, list);
  return applicant;
}

export function deleteApplicantByAccount(accountId) {
  const list = readList(APPLICANTS_FILE);
  const kept = list.filter((a) => a.account_id !== accountId);
  if (kept.length !== list.length) writeJson(APPLICANTS_FILE, kept);
}

// Generic JSON cache helpers (used for PDL and Exa responses).
export function readCache(name) {
  return readJson(join(DATA_DIR, name), {});
}

export function writeCache(name, value) {
  writeJson(join(DATA_DIR, name), value);
}

export const dataDirExists = () => existsSync(DATA_DIR);
