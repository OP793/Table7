// Claude integration: parseRole, parseCv, rankCandidates.
// Structured output comes from a single strict tool per call. The model named in
// CLAUDE_MODEL (default claude-sonnet-5-5) rejects forced tool_choice, so we use
// tool_choice "auto" plus an explicit instruction, and retry once if no tool call
// comes back. Every result is validated and defaulted so missing fields never crash.
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { env, claudeEnabled } from "./env.js";

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const str = (v, d = "") => (typeof v === "string" ? v.trim() : d);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
const int = (v, d, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

// Calls Claude with one strict tool and returns the tool_use input (or throws).
async function callTool({ system, content, tool, effort = "low", maxTokens = 8000 }) {
  if (!claudeEnabled()) throw new Error("ANTHROPIC_API_KEY is not set");
  const c = getClient();
  const instruction = `You must respond by calling the ${tool.name} tool exactly once. Do not reply with plain text.`;
  const request = (extra) => c.messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: `${system}\n\n${instruction}${extra || ""}`,
    output_config: { effort },
    tools: [{ ...tool, strict: true }],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content }],
  });

  let response = await request();
  let block = response.content.find((b) => b.type === "tool_use");
  if (!block) {
    response = await request(" Your previous reply did not call the tool. Call it now.");
    block = response.content.find((b) => b.type === "tool_use");
  }
  if (!block) throw new Error(`Claude did not call ${tool.name} (stop_reason: ${response.stop_reason})`);
  // Inputs are already parsed JSON on the tool_use block.
  return block.input || {};
}

/* ------------------------------------------------------------------ */
/* parseRole                                                           */
/* ------------------------------------------------------------------ */

const ROLE_TOOL = {
  name: "set_role_spec",
  description: "Record the structured hiring requirement extracted from the employer's description.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Job title, e.g. Graduate Mechanical Engineer" },
      discipline: { type: "string", description: "One word: mechanical, electrical, software, civil, chemical, aerospace, data or general" },
      seniority: { type: "string", enum: ["graduate", "junior", "mid", "senior", "any"] },
      must_have_skills: { type: "array", items: { type: "string" } },
      nice_to_have_skills: { type: "array", items: { type: "string" } },
      location: { type: "string", description: "Town or city named by the employer, else 'North East England'" },
      summary: { type: "string", description: "One sentence restating the need" },
      search_titles: {
        type: "array",
        items: { type: "string" },
        description: "3 to 6 lowercase job titles these people would have on their profile",
      },
    },
    required: ["title", "discipline", "seniority", "must_have_skills", "nice_to_have_skills", "location", "summary", "search_titles"],
    additionalProperties: false,
  },
};

export function normaliseSpec(raw = {}) {
  const seniority = ["graduate", "junior", "mid", "senior", "any"].includes(raw.seniority) ? raw.seniority : "any";
  const titles = arr(raw.search_titles).map((t) => t.toLowerCase()).slice(0, 6);
  const title = str(raw.title, "Engineer");
  return {
    title,
    discipline: str(raw.discipline, "general").toLowerCase(),
    seniority,
    must_have_skills: arr(raw.must_have_skills).slice(0, 10),
    nice_to_have_skills: arr(raw.nice_to_have_skills).slice(0, 10),
    location: str(raw.location, "North East England"),
    summary: str(raw.summary, title),
    search_titles: titles.length ? titles : [title.toLowerCase()],
  };
}

export async function parseRole(transcript) {
  const input = await callTool({
    system: [
      "You turn a North East England employer's spoken description of who they need into a structured role spec.",
      "Extract only what the employer said or clearly implied. Do not invent requirements, skills or seniority they did not mention.",
      "search_titles must be 3 to 6 lowercase job titles that matching people would realistically have on their professional profile, e.g. \"mechanical engineer\", \"design engineer\", \"graduate mechanical engineer\".",
      "If no location is given, use \"North East England\".",
    ].join(" "),
    content: `Employer said:\n\n${transcript}`,
    tool: ROLE_TOOL,
    effort: "low",
  });
  return normaliseSpec(input);
}

/* ------------------------------------------------------------------ */
/* parseCv                                                             */
/* ------------------------------------------------------------------ */

const CV_TOOL = {
  name: "set_candidate_profile",
  description: "Record the structured professional profile extracted from a CV.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      headline: { type: "string", description: "One line, e.g. 'MEng Mechanical Engineering graduate, Newcastle University'" },
      location: { type: "string", description: "Town or city only" },
      university: { type: "string" },
      degree: { type: "string", description: "e.g. 'MEng Mechanical Engineering'" },
      grad_year: { type: "string", description: "Four-digit year or empty string" },
      skills: { type: "array", items: { type: "string" } },
      experience: { type: "array", items: { type: "string" }, description: "Each entry 'Title at Company'" },
      linkedin_url: { type: "string", description: "Full URL if present, else empty string" },
      summary: { type: "string", description: "Two sentences, professional only" },
    },
    required: ["name", "headline", "location", "university", "degree", "grad_year", "skills", "experience", "linkedin_url", "summary"],
    additionalProperties: false,
  },
};

export function normaliseCandidate(raw = {}) {
  return {
    name: str(raw.name, "Unknown"),
    headline: str(raw.headline),
    location: str(raw.location),
    university: str(raw.university),
    degree: str(raw.degree),
    grad_year: str(String(raw.grad_year ?? "")),
    skills: arr(raw.skills).slice(0, 30),
    experience: arr(raw.experience).slice(0, 15),
    linkedin_url: str(raw.linkedin_url),
    email: str(raw.email),
    summary: str(raw.summary),
  };
}

const CV_SYSTEM = [
  "You extract a professional profile from a graduate's CV or LinkedIn PDF export.",
  "Extract only what is in the document. Leave fields empty rather than guessing.",
  "Never output age, date of birth, gender, ethnicity, nationality, photos, marital status or any other protected characteristic.",
  "Skills should be short lowercase-friendly terms (tools, languages, methods). Experience entries are 'Title at Company'.",
].join(" ");

// Turns an uploaded file into Claude user content blocks. Returns { blocks } or
// { text } (for DOCX/TXT, so the keyword fallback can also use it).
export async function fileToContent(file) {
  const type = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  const isDocx = type.includes("wordprocessingml") || name.endsWith(".docx");
  const isTxt = type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");

  if (isPdf) {
    return {
      kind: "pdf",
      blocks: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") },
        },
        { type: "text", text: "Extract this candidate's professional profile using the tool." },
      ],
    };
  }
  if (isDocx) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return { kind: "docx", text: value || "" };
  }
  if (isTxt) {
    return { kind: "txt", text: file.buffer.toString("utf8") };
  }
  throw new Error("Unsupported file type. Please upload a PDF, DOCX or TXT.");
}

export async function parseCv(file) {
  const content = await fileToContent(file);
  const blocks = content.blocks || [
    { type: "text", text: `CV text:\n\n${content.text.slice(0, 60000)}\n\nExtract the professional profile using the tool.` },
  ];
  const input = await callTool({ system: CV_SYSTEM, content: blocks, tool: CV_TOOL, effort: "low" });
  return normaliseCandidate(input);
}

/* ------------------------------------------------------------------ */
/* rankCandidates                                                      */
/* ------------------------------------------------------------------ */

const RANK_TOOL = {
  name: "set_shortlist",
  description: "Record the ranked shortlist for this role.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Candidate id exactly as given" },
            score: { type: "integer", description: "0 to 100 fit score" },
            reason: { type: "string", description: "One specific sentence on why they fit" },
            gaps: { type: "string", description: "Short note on what is missing or unknown" },
            outreach: {
              type: "string",
              description: "Friendly UK English message, max 90 words, signed '[Your name], [Company]'",
            },
          },
          required: ["id", "score", "reason", "gaps", "outreach"],
          additionalProperties: false,
        },
      },
    },
    required: ["matches"],
    additionalProperties: false,
  },
};

function candidateForPrompt(c) {
  return {
    id: c.id,
    headline: c.headline,
    location: c.location,
    university: c.university,
    degree: c.degree,
    grad_year: c.grad_year,
    skills: c.skills,
    experience: c.experience,
    education: c.education,
    summary: c.summary,
    source: c.source,
  };
}

export async function rankCandidates(spec, candidates) {
  if (!candidates.length) return { matches: [] };
  const ids = new Set(candidates.map((c) => c.id));
  const input = await callTool({
    system: [
      "You are shortlisting candidates for a North East England employer.",
      "Judge only on skills, experience, education and location relative to the role spec.",
      "Ignore names and any protected characteristics. Candidates are given without names on purpose; address outreach to 'Hi there' or use the role, not a name.",
      "Return the top 8 by fit (fewer if fewer candidates). Scores 0 to 100. Each reason must be one specific sentence citing evidence from the profile.",
      "Outreach: friendly UK English, max 90 words, mention the role and one concrete reason, end with the exact signature '[Your name], [Company]'.",
    ].join(" "),
    content: `Role spec:\n${JSON.stringify(spec, null, 2)}\n\nCandidates:\n${JSON.stringify(candidates.map(candidateForPrompt), null, 2)}`,
    tool: RANK_TOOL,
    effort: "medium",
    maxTokens: 12000,
  });

  const matches = (Array.isArray(input.matches) ? input.matches : [])
    .filter((m) => m && ids.has(m.id))
    .map((m) => ({
      id: m.id,
      score: int(m.score, 50, 0, 100),
      reason: str(m.reason, "Relevant background for this role."),
      gaps: str(m.gaps, "Not assessed."),
      outreach: str(m.outreach, ""),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return { matches };
}
