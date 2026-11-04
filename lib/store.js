import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const POOL_FILE = join(DATA_DIR, "candidates.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function getPool() {
  const pool = readJson(POOL_FILE, []);
  return Array.isArray(pool) ? pool : [];
}

// Stores only the extracted profile plus consent timestamp. Never the raw file.
export function addCandidate(profile, { linkedin_url = "" } = {}) {
  const pool = getPool();
  const candidate = {
    id: `pool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...profile,
    linkedin_url: linkedin_url || profile.linkedin_url || "",
    source: "pool",
    consent_at: new Date().toISOString(),
  };
  pool.push(candidate);
  writeJson(POOL_FILE, pool);
  return candidate;
}

// Generic JSON cache helpers (used for PDL responses).
export function readCache(name) {
  return readJson(join(DATA_DIR, name), {});
}

export function writeCache(name, value) {
  writeJson(join(DATA_DIR, name), value);
}

export const dataDirExists = () => existsSync(DATA_DIR);
