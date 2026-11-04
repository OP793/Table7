import express from "express";
import multer from "multer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, claudeEnabled, pdlEnabled } from "./lib/env.js";
import { getPool, addCandidate } from "./lib/store.js";
import { parseRoleKeyword, prefilterPool, rankKeyword, parseCvKeyword } from "./lib/match.js";
import { parseRole, parseCv, rankCandidates, normaliseSpec, normaliseCandidate, fileToContent } from "./lib/llm.js";
import { searchPdl } from "./lib/pdl.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const TRANSPARENCY = {
  pool: "You're receiving this because you opted in to Stay North.",
  pdl: "We found your public professional profile via People Data Labs. If you'd rather not hear from us, just say so and we won't contact you again.",
};

app.get("/api/status", (_req, res) => {
  res.json({ claude: claudeEnabled(), pdl: pdlEnabled(), poolSize: getPool().length, model: env.CLAUDE_MODEL });
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

  const pool = prefilterPool(spec, getPool(), 40);
  const { records: pdlRecords, note: pdlNote } = await searchPdl(spec, env.PDL_SIZE);
  const candidates = [...pool, ...pdlRecords];
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

  res.json({ matches, counts: { pool: pool.length, pdl: pdlRecords.length }, pdlNote, mode });
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

  const candidate = addCandidate(profile, { linkedin_url });
  res.json({ candidate, mode });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(env.PORT, () => {
  console.log(`Stay North Talent on http://localhost:${env.PORT}`);
  console.log(`Claude: ${claudeEnabled() ? `on (${env.CLAUDE_MODEL})` : "off (keyword fallback)"} · PDL: ${pdlEnabled() ? `on (size ${env.PDL_SIZE})` : "off"} · pool: ${getPool().length}`);
});
