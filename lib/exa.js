// Exa web search as a third candidate source. Raw HTTP against https://api.exa.ai
// (no SDK needed: Node's global fetch). Shapes follow Exa's build-with-exa skill:
// POST /search with the query, type "auto", category "people", numResults and
// contents.highlights nested under contents. Responses are cached by request body.
import { env, exaEnabled } from "./env.js";
import { detectSkills, detectLocation, educationTimeline } from "./match.js";
import { readCache, writeCache } from "./store.js";

const EXA_URL = "https://api.exa.ai/search";
const CACHE_FILE = "exa-cache.json";

// Builds the request body in code from the role spec. Claude never writes it.
export function buildExaRequest(spec, numResults = env.EXA_SIZE) {
  const titles = (spec.search_titles || []).slice(0, 3).join(" or ") || spec.title || "engineer";
  const skills = (spec.must_have_skills || []).slice(0, 3).join(", ");
  const location = spec.location && !/north east england/i.test(spec.location) ? spec.location : "North East England";
  const withSkills = skills ? ` with ${skills}` : "";
  const query = spec.candidate_type === "student"
    ? `${titles} student looking for an internship or placement, studying in or near ${location}, UK${withSkills}`
    : spec.candidate_type === "graduate"
      ? `recent graduate ${titles} based in ${location}, UK${withSkills}`
      : `${titles} based in ${location}, UK${withSkills}`;
  return {
    query,
    type: "auto",
    category: "people",
    numResults,
    userLocation: "GB",
    contents: { highlights: true },
  };
}

function cleanName(title = "") {
  // Public profile titles tend to look like "Jane Smith - Design Engineer - Acme | LinkedIn".
  return String(title).split(/\s[|–-]\s/)[0].replace(/\s*\|.*$/, "").trim().slice(0, 80) || "Unknown";
}

function headlineFrom(title = "") {
  const parts = String(title).split(/\s[|–-]\s/).map((p) => p.trim()).filter(Boolean);
  const rest = parts.slice(1).filter((p) => !/^linkedin$/i.test(p));
  return rest.join(" · ").slice(0, 120);
}

// People results carry entities[{ type: "person", properties: { name, location,
// workHistory[{ title, company.name, dates }], educationHistory[{ degree,
// institution.name, dates }] } }]. Checked against a live response.
function personEntity(r) {
  const e = Array.isArray(r.entities) ? r.entities.find((x) => x?.type === "person") : null;
  return e?.properties || {};
}

// The first highlight usually opens with "# Name" then a one-line headline.
function headlineFromHighlight(h = "") {
  const lines = String(h).split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    // Skip location lines such as "Sunderland, England, United Kingdom (GB)".
    .filter((l) => !/\((GB|UK)\)$|,\s*United Kingdom\b/i.test(l))
    // ...and profile stats such as "54 connections • 74 followers".
    .filter((l) => !/\b\d[\d,+]*\s+(connections|followers)\b/i.test(l));
  return (lines[0] || "").slice(0, 140);
}

export function normaliseExaResult(r = {}, index = 0) {
  const url = typeof r.url === "string" ? r.url : "";
  const highlights = Array.isArray(r.highlights) ? r.highlights.filter((h) => typeof h === "string") : [];
  const text = [r.title, ...highlights].join(" ");
  let isLinkedIn = false;
  try {
    isLinkedIn = /(^|\.)linkedin\.com$/i.test(new URL(url).hostname);
  } catch {
    isLinkedIn = false;
  }
  const id = `exa-${(r.id || url || String(index)).replace(/[^a-z0-9]/gi, "").slice(-24) || index}`;
  const p = personEntity(r);
  const work = Array.isArray(p.workHistory) ? p.workHistory : [];
  const edu = Array.isArray(p.educationHistory) ? p.educationHistory : [];
  const experience = work
    .map((w) => [w?.title, w?.company?.name].filter((v) => typeof v === "string" && v).join(" at "))
    .filter(Boolean)
    .slice(0, 8);
  const education = edu
    .map((e) => [e?.degree, e?.institution?.name].filter((v) => typeof v === "string" && v).join(" · "))
    .filter(Boolean)
    .slice(0, 4);
  const firstEdu = edu.find((e) => e?.institution?.name) || {};
  const { studying, latestYear } = educationTimeline(edu.map((e) => ({ from: e?.dates?.from, to: e?.dates?.to })));
  const current = work.find((w) => w && w.dates && w.dates.to == null) || work[0];
  const headline = headlineFromHighlight(highlights[0])
    || (current ? [current.title, current.company?.name].filter(Boolean).join(" at ") : "")
    || headlineFrom(r.title);
  const location = typeof p.location === "string" && p.location ? p.location : detectLocation(text);
  return {
    id,
    name: (typeof p.name === "string" && p.name) || cleanName(r.title),
    headline,
    location,
    university: firstEdu?.institution?.name || "",
    degree: typeof firstEdu?.degree === "string" ? firstEdu.degree : "",
    grad_year: latestYear ? String(latestYear) : "",
    studying,
    skills: detectSkills(text),
    experience,
    education,
    linkedin_url: isLinkedIn ? url : "",
    profile_url: url,
    summary: highlights.join(" ").slice(0, 600),
    source: "exa",
  };
}

// Returns { records, note }. Any error or non-200 gives zero records with the
// reason in `note`. No retry loops.
export async function searchExa(spec, numResults = env.EXA_SIZE) {
  if (!exaEnabled()) return { records: [], note: "Exa off: no EXA_API_KEY set." };
  const body = buildExaRequest(spec, numResults);
  const key = JSON.stringify(body);
  const cache = readCache(CACHE_FILE);
  if (cache[key]) {
    const results = Array.isArray(cache[key].results) ? cache[key].results : [];
    return { records: results.map(normaliseExaResult), note: `Exa: ${results.length} result(s) from cache (no cost).` };
  }
  try {
    const res = await fetch(EXA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.EXA_API_KEY },
      body: key,
      signal: AbortSignal.timeout(20000),
    });
    const payloadText = await res.text();
    if (!res.ok) {
      return { records: [], note: `Exa returned ${res.status}: ${payloadText.slice(0, 160)}` };
    }
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return { records: [], note: "Exa returned a non-JSON response." };
    }
    const results = Array.isArray(payload?.results) ? payload.results : [];
    cache[key] = { results, requestId: payload?.requestId, costDollars: payload?.costDollars, cached_at: new Date().toISOString() };
    writeCache(CACHE_FILE, cache);
    const cost = payload?.costDollars?.total;
    return {
      records: results.map(normaliseExaResult),
      note: `Exa: ${results.length} new result(s)${typeof cost === "number" ? ` ($${cost.toFixed(3)})` : ""}, now cached.`,
    };
  } catch (err) {
    return { records: [], note: `Exa error: ${(err?.message || String(err)).slice(0, 160)}` };
  }
}
