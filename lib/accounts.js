// Applicant accounts and login sessions. Uses only Node's built-in crypto.
// Passwords are stored as salted scrypt hashes, never as plain text.
// Session tokens live in an HttpOnly cookie; only a SHA-256 of each token is stored.
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { readJson, writeJson, dataFile } from "./store.js";
import { isEmail } from "./match.js";

const ACCOUNTS_FILE = () => dataFile("accounts.json");
const SESSIONS_FILE = () => dataFile("sessions.json");
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;

export class AccountError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const readAccounts = () => {
  const v = readJson(ACCOUNTS_FILE(), []);
  return Array.isArray(v) ? v : [];
};
const readSessions = () => {
  const v = readJson(SESSIONS_FILE(), {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
};

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return timingSafeEqual(expected, actual);
}

/** What the browser is allowed to see about an account. */
export const publicAccount = (a) => (a ? { id: a.id, name: a.name, email: a.email, created_at: a.created_at } : null);

export function createAccount({ name, email, password }) {
  const cleanName = String(name || "").trim().slice(0, 80);
  const cleanEmail = normEmail(email);
  if (!cleanName) throw new AccountError("Enter your name.");
  if (!isEmail(cleanEmail)) throw new AccountError("Enter a valid email address.");
  if (String(password || "").length < MIN_PASSWORD) {
    throw new AccountError(`Use a password with at least ${MIN_PASSWORD} characters.`);
  }
  const accounts = readAccounts();
  if (accounts.some((a) => a.email === cleanEmail)) {
    throw new AccountError("There's already an account with that email. Log in instead.", 409);
  }
  const account = {
    id: randomUUID(),
    name: cleanName,
    email: cleanEmail,
    password: hashPassword(password),
    created_at: new Date().toISOString(),
  };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE(), accounts);
  return account;
}

// Simple brute-force guard: 10 failed logins per email per 15 minutes.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

export function verifyLogin(email, password) {
  const key = normEmail(email);
  const now = Date.now();
  const f = failures.get(key);
  if (f && now - f.first < WINDOW_MS && f.count >= MAX_FAILS) {
    throw new AccountError("Too many tries. Wait 15 minutes and try again.", 429);
  }
  const account = readAccounts().find((a) => a.email === key);
  // Hash anyway when the account doesn't exist so timing doesn't reveal which emails are registered.
  const ok = account ? verifyPassword(password, account.password) : (verifyPassword(password, hashPassword("x")), false);
  if (!ok) {
    const entry = f && now - f.first < WINDOW_MS ? f : { first: now, count: 0 };
    entry.count += 1;
    failures.set(key, entry);
    throw new AccountError("That email and password don't match.", 401);
  }
  failures.delete(key);
  return account;
}

export function getAccount(id) {
  return readAccounts().find((a) => a.id === id) || null;
}

export function updateAccountName(id, name) {
  const clean = String(name || "").trim().slice(0, 80);
  if (!clean) return getAccount(id);
  const accounts = readAccounts();
  const a = accounts.find((x) => x.id === id);
  if (!a || a.name === clean) return a || null;
  a.name = clean;
  writeJson(ACCOUNTS_FILE(), accounts);
  return a;
}

export function deleteAccount(id) {
  writeJson(ACCOUNTS_FILE(), readAccounts().filter((a) => a.id !== id));
  const sessions = readSessions();
  for (const [k, s] of Object.entries(sessions)) if (s.account_id === id) delete sessions[k];
  writeJson(SESSIONS_FILE(), sessions);
}

/** Returns the raw token for the cookie. Only its hash is saved. */
export function createSession(accountId) {
  const token = randomBytes(32).toString("base64url");
  const sessions = readSessions();
  const now = Date.now();
  // Drop expired sessions while we're here.
  for (const [k, s] of Object.entries(sessions)) if (s.expires < now) delete sessions[k];
  sessions[sha256(token)] = { account_id: accountId, expires: now + SESSION_DAYS * 86400000 };
  writeJson(SESSIONS_FILE(), sessions);
  return token;
}

export function getSessionAccount(token) {
  if (!token) return null;
  const s = readSessions()[sha256(token)];
  if (!s || s.expires < Date.now()) return null;
  return getAccount(s.account_id);
}

export function deleteSession(token) {
  if (!token) return;
  const sessions = readSessions();
  const key = sha256(token);
  if (sessions[key]) {
    delete sessions[key];
    writeJson(SESSIONS_FILE(), sessions);
  }
}
