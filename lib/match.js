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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

export function rankKeyword(spec, candidates) {
  const matches = candidates.map((c) => {
    const text = candidateText(c);
    const cDiscipline = c.discipline || detectDiscipline(text);
    const mustHits = spec.must_have_skills.filter((s) => hasSkill(c, s));
    const niceHits = spec.nice_to_have_skills.filter((s) => hasSkill(c, s));
    const mustScore = spec.must_have_skills.length
      ? (mustHits.length / spec.must_have_skills.length) * 55
      : 30;
    const niceScore = spec.nice_to_have_skills.length
      ? (niceHits.length / spec.nice_to_have_skills.length) * 15
      : 8;
    const disciplineScore = spec.discipline !== "general" && cDiscipline === spec.discipline ? 20 : 5;
    const locTok = String(spec.location || "").toLowerCase().split(" ")[0];
    const locationScore = locTok && locTok !== "north" && text.includes(locTok) ? 10 : 4;
    const score = Math.round(Math.min(100, mustScore + niceScore + disciplineScore + locationScore));
    const missing = spec.must_have_skills.filter((s) => !mustHits.includes(s));
    const reason = mustHits.length
      ? `Lists ${mustHits.join(", ")} and has ${/^[aeiou]/.test(cDiscipline) ? "an" : "a"} ${cDiscipline} background${c.location ? ` in ${c.location}` : ""}.`
      : `${titleCase(cDiscipline)} background${c.location ? ` based in ${c.location}` : ""}; no listed overlap on the named skills.`;
    const gaps = missing.length ? `No evidence of ${missing.join(", ")}.` : "None obvious from the profile.";
    const first = String(c.name || "there").split(" ")[0];
    const outreach = `Hi ${first}, I came across your profile and your ${mustHits[0] || cDiscipline} experience caught my eye. We're hiring a ${spec.title} ${spec.location ? `in ${spec.location}` : "in the North East"} and think you could be a great fit. Would you be open to a quick chat this week?\n\n[Your name], [Company]`;
    return { id: c.id, score, reason, gaps, outreach };
  });
  matches.sort((a, b) => b.score - a.score);
  return { matches: matches.slice(0, 8) };
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
