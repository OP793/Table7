import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the store at a throwaway folder before the modules load.
const dir = mkdtempSync(join(tmpdir(), "stay-north-test-"));
process.env.STAY_NORTH_DATA_DIR = dir;
const accounts = await import("../lib/accounts.js");
const store = await import("../lib/store.js");

test.after(() => rmSync(dir, { recursive: true, force: true }));

test("passwords are hashed, not stored as typed", () => {
  const a = accounts.createAccount({ name: "Sam Patel", email: "Sam@Example.com", password: "correct horse" });
  assert.equal(a.email, "sam@example.com");
  const raw = readFileSync(join(dir, "accounts.json"), "utf8");
  assert.ok(!raw.includes("correct horse"));
  assert.match(a.password, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
});

test("signup rejects bad input and duplicate emails", () => {
  assert.throws(() => accounts.createAccount({ name: "", email: "a@b.co", password: "12345678" }), /name/);
  assert.throws(() => accounts.createAccount({ name: "A", email: "not-an-email", password: "12345678" }), /email/);
  assert.throws(() => accounts.createAccount({ name: "A", email: "a@b.co", password: "short" }), /8 characters/);
  assert.throws(() => accounts.createAccount({ name: "Sam", email: "sam@example.com", password: "12345678" }), /already an account/);
});

test("login works with the right password only", () => {
  assert.equal(accounts.verifyLogin("SAM@example.com", "correct horse").name, "Sam Patel");
  assert.throws(() => accounts.verifyLogin("sam@example.com", "wrong password"), /don't match/);
  assert.throws(() => accounts.verifyLogin("nobody@example.com", "whatever1"), /don't match/);
});

test("sessions log in, survive lookups, and log out", () => {
  const a = accounts.verifyLogin("sam@example.com", "correct horse");
  const token = accounts.createSession(a.id);
  assert.equal(accounts.getSessionAccount(token).id, a.id);
  assert.ok(!readFileSync(join(dir, "sessions.json"), "utf8").includes(token), "raw token must not be stored");
  accounts.deleteSession(token);
  assert.equal(accounts.getSessionAccount(token), null);
  assert.equal(accounts.getSessionAccount("made-up-token"), null);
});

test("an applicant can create, update, hide and delete their profile", () => {
  const a = accounts.createAccount({ name: "Jo Bell", email: "jo@example.com", password: "password123" });
  const before = store.getPool().length;

  const p1 = store.saveApplicant(a.id, { name: "Jo Bell", skills: ["python"], email: a.email });
  assert.equal(p1.visible, true);
  assert.equal(store.getPool().length, before + 1);

  const p2 = store.saveApplicant(a.id, { name: "Jo Bell", skills: ["python", "sql"], email: a.email });
  assert.equal(p2.id, p1.id, "updating keeps the same profile");
  assert.equal(p2.consent_at, p1.consent_at, "consent time is kept");
  assert.deepEqual(store.getApplicantByAccount(a.id).skills, ["python", "sql"]);
  assert.equal(store.getPool().length, before + 1, "no duplicate after update");

  store.saveApplicant(a.id, { ...p2, visible: false });
  assert.equal(store.getPool().length, before, "hidden profiles are not searchable");
  const { visible: _ignored, ...withoutVisible } = p2;
  store.saveApplicant(a.id, withoutVisible);
  assert.equal(store.getApplicantByAccount(a.id).visible, false, "visibility is kept when not sent");

  store.deleteApplicantByAccount(a.id);
  accounts.deleteAccount(a.id);
  assert.equal(store.getApplicantByAccount(a.id), null);
  assert.throws(() => accounts.verifyLogin("jo@example.com", "password123"), /don't match/);
});
