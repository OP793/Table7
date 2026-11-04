// Keyword-based fallback used when ANTHROPIC_API_KEY is missing, plus the
// pre-filter that always runs before ranking. No external calls.

export const NE_LOCALITIES = [
  "newcastle upon tyne", "newcastle", "gateshead", "sunderland", "durham",
  "middlesbrough", "stockton-on-tees", "darlington", "hartlepool", "north shields",
  "south shields", "tynemouth", "whitley bay", "wallsend", "washington", "cramlington",
  "blyth", "morpeth", "hexham", "ashington", "consett", "chester-le-street", "peterlee",
  "newton aycliffe", "bishop auckland", "redcar", "billingham", "jarrow", "seaham",
];

const DISCIPLINES = {
  mechanical: ["mechanical", "solidworks", "cad", "fea", "thermodynamics", "manufacturing"],
  electrical: ["electrical", "electronic", "electronics", "pcb", "power systems", "embedded", "plc"],
  software: ["software", "developer", "programmer", "web", "backend", "frontend", "full stack", "javascript", "python", "java", "typescript", "react", "node"],
  civil: ["civil", "structural", "geotechnical", "highways", "construction", "civil 3d"],
  chemical: ["chemical", "process engineer", "process engineering", "aspen", "hysys"],
  aerospace: ["aerospace", "aeronautical", "aircraft", "propulsion", "avionics"],
  data: ["data", "analyst", "analytics", "machine learning", "ml", "sql", "power bi", "statistics", "ai"],
};

export const SKILL_LEXICON = [
  "solidworks", "autocad", "ansys", "fea", "cfd", "matlab", "simulink", "creo", "inventor", "catia", "gd&t",
  "python", "javascript", "typescript", "java", "c#", "c++", "sql", "react", "node", "node.js", "html", "css",
  "git", "docker", "aws", "azure", "linux", "rest apis", "django", "flask", "express",
  "pcb design", "altium", "kicad", "embedded c", "arduino", "raspberry pi", "plc", "ladder logic", "power systems", "ltspice", "vhdl", "fpga",
  "revit", "civil 3d", "etabs", "tekla", "staad pro", "eurocodes", "structural analysis", "geotechnics", "surveying",
  "aspen plus", "hysys", "process safety", "hazop", "p&id", "chemical process design", "mass transfer",
  "aerodynamics", "propulsion", "flight dynamics", "composites", "xflr5", "openvsp",
  "power bi", "tableau", "excel", "pandas", "numpy", "scikit-learn", "pytorch", "tensorflow", "machine learning", "statistics", "spark",
  "lean manufacturing", "six sigma", "project management", "agile", "scrum",
];

const SENIORITY_WORDS = [
  ["graduate", ["graduate", "grad", "entry level", "entry-level", "recent graduate", "new grad", "placement"]],
  ["junior", ["junior", "1-2 years", "one or two years", "early career"]],
  ["senior", ["senior", "lead", "principal", "experienced", "5+ years", "five years"]],
  ["mid", ["mid-level", "mid level", "3 years", "three years", "intermediate"]],
];

export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#.&-]+/)
    .filter((t) => t.length > 1);
}

function titleCase(s) {
  return String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function detectDiscipline(text) {
  const t = String(text || "").toLowerCase();
  let best = "general";
  let bestHits = 0;
  for (const [name, words] of Object.entries(DISCIPLINES)) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > bestHits) {
      best = name;
      bestHits = hits;
    }
  }
  return best;
}

export function detectSkills(text) {
  const t = ` ${String(text || "").toLowerCase().replace(/\s+/g, " ")} `;
  return SKILL_LEXICON.filter((s) =>
    t.includes(` ${s} `) || t.includes(` ${s},`) || t.includes(` ${s}.`) || t.includes(`(${s})`) || t.includes(` ${s};`)
  );
}

export function detectLocation(text) {
  const t = String(text || "").toLowerCase();
  // Longer names first so "newcastle upon tyne" wins over "newcastle".
  const sorted = [...NE_LOCALITIES].sort((a, b) => b.length - a.length);
  const hit = sorted.find((l) => t.includes(l));
  return hit ? titleCase(hit) : "";
}

export function parseRoleKeyword(transcript) {
  const text = String(transcript || "");
  const lower = text.toLowerCase();
  const discipline = detectDiscipline(lower);
  let seniority = "any";
  for (const [level, words] of SENIORITY_WORDS) {
    if (words.some((w) => lower.includes(w))) {
      seniority = level;
      break;
    }
  }
  const skills = detectSkills(lower);
  const must = skills.slice(0, 4);
  const nice = skills.slice(4, 8);
  const location = detectLocation(lower) || "North East England";

  const roleNoun = discipline === "software" ? "software engineer"
    : discipline === "data" ? "data analyst"
    : discipline === "general" ? "engineer"
    : `${discipline} engineer`;
  const prefix = seniority === "any" ? "" : `${seniority} `;
  const title = titleCase(`${prefix}${roleNoun}`);

  const search_titles = [...new Set([
    roleNoun,
    `graduate ${roleNoun}`,
    `junior ${roleNoun}`,
    discipline === "mechanical" ? "design engineer" : "",
    discipline === "software" ? "software developer" : "",
    discipline === "data" ? "data scientist" : "",
    discipline === "electrical" ? "electronics engineer" : "",
    discipline === "civil" ? "structural engineer" : "",
    discipline === "chemical" ? "process engineer" : "",
  ].filter(Boolean))].slice(0, 6);

  return {
    title,
    discipline,
    seniority,
    must_have_skills: must,
    nice_to_have_skills: nice,
    location,
    summary: text.trim().slice(0, 240) || "Role parsed from transcript (keyword mode).",
    search_titles,
  };
}

/* ---------- career stage: student / graduate ---------- */

export const STAGES = ["any", "graduate", "student"];
// "Recent graduate" means finished within this many years.
const GRADUATE_WINDOW_YEARS = 3;

const yearOf = (v) => {
  const m = String(v ?? "").match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
};

// entries: [{ from, to }] (strings, numbers or null). `to: null` with a recent
// `from` means still studying. Returns { studying, latestYear }.
export function educationTimeline(entries = [], nowYear = new Date().getFullYear()) {
  let studying = false;
  let latestYear = null;
  for (const e of entries) {
    const from = yearOf(e?.from);
    const to = yearOf(e?.to);
    if (to === null && from !== null && nowYear - from <= 6) studying = true;
    if (to !== null && to > nowYear) studying = true;
    if (to !== null && (latestYear === null || to > latestYear)) latestYear = to;
  }
  return { studying, latestYear };
}

const STUDENT_TEXT = /\b(student|undergraduate|undergrad|seeking (an? )?(internship|placement)|looking for (an? )?(internship|placement)|placement year|year in industry)\b/i;

// Returns "student", "graduate", "experienced" or "unknown". A stage the person
// chose themselves (pool sign-ups) always wins over anything inferred.
export function classifyStage(c = {}, nowYear = new Date().getFullYear()) {
  if (c.stage === "student" || c.stage === "graduate") return c.stage;
  const text = [c.headline, c.summary].filter(Boolean).join(" ");
  const year = yearOf(c.grad_year);
  if (c.studying || STUDENT_TEXT.test(text) || (year !== null && year > nowYear)) return "student";
  if (year !== null) return nowYear - year <= GRADUATE_WINDOW_YEARS ? "graduate" : "experienced";
  if (/\bgraduate\b/i.test(text)) return "graduate";
  return "unknown";
}

const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => typeof v === "string" && EMAIL_RE.test(v.trim());
const isUrl = (v) => typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

// A candidate is only shown if an employer can actually reach them.
export function hasContact(c = {}) {
  return isEmail(c.email) || isUrl(c.linkedin_url) || isUrl(c.profile_url);
}

export function candidateText(c) {
  return [
    c.name, c.headline, c.location, c.university, c.degree, c.summary, c.discipline,
    ...(c.skills || []), ...(c.experience || []), ...(c.education || []),
  ].join(" ").toLowerCase();
}

// Keeps the Claude prompt small: at most `limit` pool candidates by overlap.
export function prefilterPool(spec, pool, limit = 40) {
  const wanted = new Set([
    ...tokens(spec.title), ...tokens(spec.discipline),
    ...spec.must_have_skills.flatMap(tokens), ...spec.nice_to_have_skills.flatMap(tokens),
    ...spec.search_titles.flatMap(tokens),
  ]);
  const scored = pool.map((c) => {
    const t = new Set(tokens(candidateText(c)));
    let hits = 0;
    for (const w of wanted) if (t.has(w)) hits++;
    return { c, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, limit).map((s) => s.c);
}

function hasSkill(c, skill) {
  return candidateText(c).includes(skill.toLowerCase());
}

// Keyword scoring used when Claude is off or too slow. Several graded signals so
// candidates get genuinely different scores instead of all landing on one number.
const STOP = new Set(["and", "the", "for", "with", "at", "of", "in", "a", "an", "to"]);
const titleTokens = (s) => tokens(s).filter((t) => t.length > 2 && !STOP.has(t));

export function scoreKeyword(spec, c, nowYear = new Date().getFullYear()) {
  const text = candidateText(c);
  const cDiscipline = c.discipline || detectDiscipline(text);
  const must = spec.must_have_skills || [];
  const nice = spec.nice_to_have_skills || [];
  const mustHits = must.filter((s) => hasSkill(c, s));
  const niceHits = nice.filter((s) => hasSkill(c, s));

  // 1. Skills (up to 40): must-haves dominate, nice-to-haves add a little.
  const skills = must.length
    ? (mustHits.length / must.length) * 32 + (nice.length ? (niceHits.length / nice.length) * 8 : 4)
    : nice.length ? (niceHits.length / nice.length) * 20 : 12;

  // 2. Job title match (up to 25): best overlap between the candidate's headline or
  //    recent roles and any title this kind of person would have.
  const have = new Set(titleTokens([c.headline, ...(c.experience || []).slice(0, 3)].join(" ")));
  let best = 0;
  for (const title of (spec.search_titles && spec.search_titles.length ? spec.search_titles : [spec.title])) {
    const want = titleTokens(title);
    if (want.length) best = Math.max(best, want.filter((w) => have.has(w)).length / want.length);
  }
  const titleScore = best * 25;

  // 3. Discipline (up to 10).
  const discipline = spec.discipline && spec.discipline !== "general" && cDiscipline === spec.discipline ? 10 : 0;

  // 4. Location (up to 12): the exact town beats elsewhere in the North East.
  const loc = String(c.location || "").toLowerCase();
  const town = String(spec.location || "").toLowerCase().split(",")[0].trim();
  const inNE = NE_LOCALITIES.some((l) => loc.includes(l)) || /north east|tyne|wear|durham|northumberland|teesside/.test(loc);
  const location = town && !/north east/.test(town) && loc.includes(town) ? 12
    : inNE ? 8
    : /united kingdom|england|\buk\b/.test(loc) ? 3
    : 0;

  // 5. Career stage against the level asked for (up to 8).
  const stage = classifyStage(c, nowYear);
  const level = spec.candidate_type && spec.candidate_type !== "any" ? spec.candidate_type : spec.seniority;
  const table = level === "graduate" || level === "junior" ? { graduate: 8, student: 4, experienced: 2, unknown: 3 }
    : level === "student" ? { student: 8, graduate: 4, experienced: 0, unknown: 2 }
    : level === "senior" || level === "mid" ? { experienced: 8, graduate: 3, student: 0, unknown: 3 }
    : null;
  const stageScore = table ? table[stage] : 4;

  // 6. Profile completeness (up to 5): more evidence to judge on.
  const richness = Math.min(5, (c.skills || []).length * 0.5 + (c.experience || []).length + (c.university ? 1 : 0));

  const score = Math.round(Math.max(1, Math.min(99, skills + titleScore + discipline + location + stageScore + richness)));
  return { score, mustHits, cDiscipline, best };
}

export function rankKeyword(spec, candidates, limit = 8) {
  const matches = candidates.map((c) => {
    const { score, mustHits, cDiscipline, best } = scoreKeyword(spec, c);
    const role = best >= 0.5 && c.headline
      ? `works as ${c.headline.split(/[|·]/)[0].trim()}`
      : `has ${/^[aeiou]/.test(cDiscipline) ? "an" : "a"} ${cDiscipline} background`;
    const missing = (spec.must_have_skills || []).filter((s) => !mustHits.includes(s));
    const reason = mustHits.length
      ? `Lists ${mustHits.join(", ")} and ${role}${c.location ? ` in ${c.location}` : ""}.`
      : `${role.charAt(0).toUpperCase()}${role.slice(1)}${c.location ? ` in ${c.location}` : ""}, but none of the named skills are listed.`;
    const gaps = missing.length ? `No evidence of ${missing.join(", ")}.` : "None obvious from the profile.";
    const first = String(c.name || "there").split(" ")[0];
    const outreach = `Hi ${first}, I came across your profile and your ${mustHits[0] || cDiscipline} experience caught my eye. We're hiring a ${spec.title} ${spec.location ? `in ${spec.location}` : "in the North East"} and think you could be a great fit. Would you be open to a quick chat this week?\n\n[Your name], [Company]`;
    return { id: c.id, score, reason, gaps, outreach };
  });
  matches.sort((a, b) => b.score - a.score);
  return { matches: matches.slice(0, limit) };
}

// Fallback CV extraction for TXT/DOCX text when Claude is unavailable.
export function parseCvKeyword(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = (lines.find((l) => /^[A-Z][a-z]+(\s[A-Z][a-z'-]+){1,3}$/.test(l)) || lines[0] || "Unknown").slice(0, 80);
  const linkedin = (raw.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/) || [""])[0];
  const email = (raw.match(/[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}/) || [""])[0];
  const uniLine = lines.find((l) => /university|college/i.test(l)) || "";
  const degreeLineRaw = lines.find((l) => /\b(BEng|MEng|BSc|MSc|BA|MA|PhD)\b/.test(l)) || "";
  // Lines like "MEng Mechanical Engineering, Newcastle University, 2021-2025" get split on commas.
  const degreeParts = degreeLineRaw.split(",").map((p) => p.trim()).filter(Boolean);
  const degreeLine = degreeParts.find((p) => /\b(BEng|MEng|BSc|MSc|BA|MA|PhD)\b/.test(p)) || degreeLineRaw;
  const uniFromDegree = degreeParts.find((p) => /university|college/i.test(p)) || "";
  const uniParts = uniLine.split(",").map((p) => p.trim()).filter(Boolean);
  const university = uniFromDegree || uniParts.find((p) => /university|college/i.test(p)) || uniLine;
  const gradYear = (raw.match(/\b(20[12][0-9])\b/g) || []).map(Number).sort((a, b) => b - a)[0] || "";
  const skills = detectSkills(raw);
  const experience = lines
    .filter((l) => /\b(at|@)\b/i.test(l) && /engineer|developer|analyst|intern|placement|assistant|technician/i.test(l))
    .slice(0, 5);
  return {
    name,
    headline: degreeLine
      ? `${degreeLine.slice(0, 80)} graduate${university ? `, ${university.slice(0, 60)}` : ""}`
      : `${titleCase(detectDiscipline(raw))} graduate`,
    location: detectLocation(raw),
    university: university.slice(0, 80),
    degree: degreeLine.slice(0, 80),
    grad_year: gradYear ? String(gradYear) : "",
    skills,
    experience,
    linkedin_url: linkedin,
    email,
    summary: `Profile extracted in keyword mode (no Claude key). ${skills.length} skills detected.`,
  };
}
