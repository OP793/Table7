import express from "express";
import multer from "multer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, claudeEnabled, pdlEnabled, pdlDemo, exaEnabled } from "./lib/env.js";
import { getPool, getApplicantByAccount, saveApplicant, deleteApplicantByAccount } from "./lib/store.js";
import {
  AccountError, SESSION_DAYS, createAccount, verifyLogin, createSession, getSessionAccount,
  deleteSession, deleteAccount, updateAccountName, publicAccount,
} from "./lib/accounts.js";
import { parseRoleKeyword, prefilterPool, rankKeyword, parseCvKeyword, hasContact } from "./lib/match.js";
import { parseRole, parseCv, rankCandidates, normaliseSpec, normaliseCandidate, fileToContent } from "./lib/llm.js";
import { searchPdl } from "./lib/pdl.js";
import { searchExa } from "./lib/exa.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const TRANSPARENCY = {
  pool: "You're receiving this because you opted in to Stay North.",
  pdl: "We found your public professional profile via People Data Labs. If you'd rather not hear from us, just say so and we won't contact you again.",
  exa: "We found your public professional profile through an Exa web search. If you'd rather not hear from us, just say so and we won't contact you again.",
};

app.get("/api/status", (_req, res) => {
  res.json({ claude: claudeEnabled(), pdl: pdlEnabled(), pdlDemo: pdlDemo(), exa: exaEnabled(), poolSize: getPool().length, model: env.CLAUDE_MODEL });
});

app.post("/api/role", async (req, res) => {
  const transcript = String(req.body?.transcript || "").trim();
  if (!transcript) return res.status(400).json({ error: "transcript is required" });
  let spec;
  let mode = "keyword";
  if (claudeEnabled()) {
    try {
      spec = await parseRole(transcript);
      mode = "claude";
    } catch (err) {
      console.error("parseRole failed, using keyword fallback:", err.message);
    }
  }
  if (!spec) spec = parseRoleKeyword(transcript);
  res.json({ spec, mode });
});

app.post("/api/search", async (req, res) => {
  if (!req.body?.spec || typeof req.body.spec !== "object") {
    return res.status(400).json({ error: "spec is required" });
  }
  const spec = normaliseSpec(req.body.spec);

  // Only people an employer can actually reach make the shortlist.
  const fullPool = getPool();
  const pool = prefilterPool(spec, fullPool.filter(hasContact), 40);
  let hidden = fullPool.length - fullPool.filter(hasContact).length;
  const [{ records: pdlRecords, note: pdlNote }, { records: exaRecords, note: exaNote }] = await Promise.all([
    searchPdl(spec, env.PDL_SIZE),
    searchExa(spec, env.EXA_SIZE),
  ]);
  const external = [...pdlRecords, ...exaRecords];
  const reachable = external.filter(hasContact);
  hidden += external.length - reachable.length;
  const candidates = [...pool, ...reachable];
  const byId = new Map(candidates.map((c) => [c.id, c]));

  let ranked;
  let mode = "keyword";
  if (claudeEnabled()) {
    try {
      ranked = await rankCandidates(spec, candidates);
      mode = "claude";
    } catch (err) {
      console.error("rankCandidates failed, using keyword fallback:", err.message);
    }
  }
  if (!ranked) ranked = rankKeyword(spec, candidates);

  const matches = ranked.matches
    .map((m) => {
      const c = byId.get(m.id);
      if (!c) return null;
      const line = TRANSPARENCY[c.source] || TRANSPARENCY.pool;
      const outreach = m.outreach ? `${m.outreach.trim()}\n\n${line}` : line;
      const { consent_at, account_id, ...publicFields } = c;
      return { ...publicFields, score: m.score, reason: m.reason, gaps: m.gaps, outreach };
    })
    .filter(Boolean);

  res.json({
    matches,
    counts: {
      pool: pool.length,
      pdl: reachable.filter((c) => c.source === "pdl").length,
      exa: reachable.filter((c) => c.source === "exa").length,
      hidden,
    },
    pdlNote,
    exaNote,
    mode,
  });
});

/* ------------------------------------------------------------------ */
/* Applicant accounts                                                  */
/* ------------------------------------------------------------------ */

const COOKIE = "sn_session";

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function requireAccount(req, res, next) {
  const account = getSessionAccount(readCookie(req, COOKIE));
  if (!account) return res.status(401).json({ error: "Please log in again." });
  req.account = account;
  next();
}

const httpUrl = (v) => {
  const s = String(v || "").trim();
  return /^https?:\/\/\S+$/i.test(s) ? s.slice(0, 300) : "";
};

// What the applicant sees about their own profile (no internal ids).
function ownProfile(p) {
  if (!p) return null;
  const { account_id, ...rest } = p;
  return rest;
}

function sendAccountError(res, err) {
  if (err instanceof AccountError) return res.status(err.status).json({ error: err.message });
  throw err;
}

app.post("/api/auth/signup", (req, res) => {
  try {
    const account = createAccount(req.body || {});
    setSessionCookie(req, res, createSession(account.id));
    res.status(201).json({ account: publicAccount(account), profile: null });
  } catch (err) {
    sendAccountError(res, err);
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const account = verifyLogin(req.body?.email, req.body?.password);
    setSessionCookie(req, res, createSession(account.id));
    res.json({ account: publicAccount(account), profile: ownProfile(getApplicantByAccount(account.id)) });
  } catch (err) {
    sendAccountError(res, err);
  }
});

app.post("/api/auth/logout", (req, res) => {
  deleteSession(readCookie(req, COOKIE));
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const account = getSessionAccount(readCookie(req, COOKIE));
  if (!account) return res.json({ account: null, profile: null });
  res.json({ account: publicAccount(account), profile: ownProfile(getApplicantByAccount(account.id)) });
});

// Upload or replace a CV. The fields read from it fill in (or refresh) the profile.
app.post("/api/me/cv", requireAccount, (req, res, next) => {
  upload.single("cv")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is larger than 5 MB" : err.message });
    next();
  });
}, async (req, res) => {
  const existing = getApplicantByAccount(req.account.id);
  if (!req.file) return res.status(400).json({ error: "Choose a CV file (PDF, Word or TXT)." });
  if (!existing && String(req.body?.consent) !== "true") {
    return res.status(400).json({ error: "Tick the consent box so we can keep your profile." });
  }

  let content;
  try {
    content = await fileToContent(req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let extracted;
  let mode = "keyword";
  if (claudeEnabled()) {
    try {
      extracted = await parseCv(req.file);
      mode = "claude";
    } catch (err) {
      console.error("parseCv failed:", err.message);
      if (content.kind === "pdf") {
        return res.status(502).json({ error: `We couldn't read this PDF: ${err.message}` });
      }
    }
  } else if (content.kind === "pdf") {
    return res.status(503).json({
      error: "Reading PDFs needs ANTHROPIC_API_KEY on the server. Upload a Word or TXT version, or fill in your details by hand.",
    });
  }
  if (!extracted) {
    extracted = normaliseCandidate(parseCvKeyword(content.text));
    // The keyword reader's summary is a note for developers, not something to show employers.
    extracted.summary = "";
  }

  // Keep what the CV doesn't say; the account's email is always the contact email.
  const merged = { ...(existing || {}) };
  for (const [k, v] of Object.entries(extracted)) {
    if (Array.isArray(v) ? v.length : v) merged[k] = v;
  }
  const linkedin = httpUrl(req.body?.linkedin_url);
  const profile = saveApplicant(req.account.id, {
    ...normaliseCandidate({ ...merged, name: merged.name && merged.name !== "Unknown" ? merged.name : req.account.name }),
    linkedin_url: linkedin || httpUrl(merged.linkedin_url),
    email: req.account.email,
    discipline: merged.discipline,
    cv_file_name: String(req.file.originalname || "").slice(0, 120),
    cv_read_by: mode,
  });
  res.json({ profile: ownProfile(profile), mode });
});

// Save edits made by hand. Creates the profile if there isn't one yet.
app.put("/api/me/profile", requireAccount, (req, res) => {
  const body = req.body || {};
  const existing = getApplicantByAccount(req.account.id);
  if (!existing && String(body.consent) !== "true") {
    return res.status(400).json({ error: "Tick the consent box so we can keep your profile." });
  }
  const list = (v, max) => (Array.isArray(v) ? v : String(v || "").split(/\n|,/))
    .map((s) => String(s).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max);
  const clean = normaliseCandidate({
    name: String(body.name || "").slice(0, 80) || req.account.name,
    headline: String(body.headline || "").slice(0, 160),
    location: String(body.location || "").slice(0, 80),
    university: String(body.university || "").slice(0, 120),
    degree: String(body.degree || "").slice(0, 120),
    grad_year: String(body.grad_year || "").replace(/[^0-9]/g, "").slice(0, 4),
    skills: list(body.skills, 30),
    experience: list(body.experience, 15),
    summary: String(body.summary || "").slice(0, 1200),
  });
  const profile = saveApplicant(req.account.id, {
    ...(existing || {}),
    ...clean,
    linkedin_url: httpUrl(body.linkedin_url),
    email: req.account.email,
    visible: body.visible === undefined ? existing?.visible ?? true : body.visible === true || body.visible === "true",
  });
  updateAccountName(req.account.id, clean.name);
  res.json({ profile: ownProfile(profile) });
});

// Delete the account, its profile and every login session.
app.delete("/api/me", requireAccount, (req, res) => {
  deleteApplicantByAccount(req.account.id);
  deleteAccount(req.account.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(env.PORT, () => {
  console.log(`Stay North Talent on http://localhost:${env.PORT}`);
  console.log(`Claude: ${claudeEnabled() ? `on (${env.CLAUDE_MODEL})` : "off (keyword fallback)"} · PDL: ${pdlEnabled() ? `on (size ${env.PDL_SIZE})` : pdlDemo() ? "demo (fictional records)" : "off"} · Exa: ${exaEnabled() ? `on (size ${env.EXA_SIZE})` : "off"} · pool: ${getPool().length}`);
});
