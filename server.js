import express from "express";
import multer from "multer";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, claudeEnabled, pdlEnabled, pdlDemo, exaEnabled } from "./lib/env.js";
import { getPool, addCandidate } from "./lib/store.js";
import { parseRoleKeyword, prefilterPool, rankKeyword, parseCvKeyword, hasContact, isEmail } from "./lib/match.js";
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
      const { consent_at, ...publicFields } = c;
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

app.post("/api/cv", (req, res, next) => {
  upload.single("cv")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is larger than 5 MB" : err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A CV file is required (PDF, DOCX or TXT)" });
  if (String(req.body?.consent) !== "true") return res.status(400).json({ error: "Consent is required" });
  const linkedin_url = String(req.body?.linkedin_url || "").trim();
  const email = String(req.body?.email || "").trim();
  if (!isEmail(email)) return res.status(400).json({ error: "A valid email address is required so employers can contact you" });

  let content;
  try {
    content = await fileToContent(req.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let profile;
  let mode = "keyword";
  if (claudeEnabled()) {
    try {
      profile = await parseCv(req.file);
      mode = "claude";
    } catch (err) {
      console.error("parseCv failed:", err.message);
      if (content.kind === "pdf") {
        return res.status(502).json({ error: `Claude could not read this PDF: ${err.message}` });
      }
    }
  } else if (content.kind === "pdf") {
    return res.status(503).json({
      error: "PDF parsing needs ANTHROPIC_API_KEY. Add it to .env, or upload a DOCX or TXT version for keyword mode.",
    });
  }
  if (!profile) profile = normaliseCandidate(parseCvKeyword(content.text));

  const candidate = addCandidate({ ...profile, email }, { linkedin_url });
  res.json({ candidate, mode });
});

// Demo-only "Import from LinkedIn". Never contacts LinkedIn and never reads the
// URL: it returns one of a few fictional profiles from data/linkedin-demo.json,
// stored with demo: true so it shows a "Demo import" badge everywhere.
const LINKEDIN_DEMO = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, "data", "linkedin-demo.json"), "utf8"));
  } catch {
    return [];
  }
})();
let demoCursor = 0;

app.post("/api/linkedin-import-demo", (req, res) => {
  if (String(req.body?.consent) !== "true") return res.status(400).json({ error: "Consent is required" });
  if (!LINKEDIN_DEMO.length) return res.status(500).json({ error: "Demo profiles are missing" });
  const profile = LINKEDIN_DEMO[demoCursor % LINKEDIN_DEMO.length];
  demoCursor += 1;
  const candidate = addCandidate(
    { ...normaliseCandidate(profile), discipline: profile.discipline, demo: true },
    { linkedin_url: "" },
  );
  res.json({ candidate, mode: "demo" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(env.PORT, () => {
  console.log(`Stay North Talent on http://localhost:${env.PORT}`);
  console.log(`Claude: ${claudeEnabled() ? `on (${env.CLAUDE_MODEL})` : "off (keyword fallback)"} · PDL: ${pdlEnabled() ? `on (size ${env.PDL_SIZE})` : pdlDemo() ? "demo (fictional records)" : "off"} · Exa: ${exaEnabled() ? `on (size ${env.EXA_SIZE})` : "off"} · pool: ${getPool().length}`);
});
