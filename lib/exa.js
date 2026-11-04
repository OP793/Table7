// Exa web search as a third candidate source. Raw HTTP against https://api.exa.ai
// (no SDK needed: Node's global fetch). Shapes follow Exa's build-with-exa skill:
// POST /search with the query, type "auto", category "people", numResults and
// contents.highlights nested under contents. Responses are cached by request body.
import { env, exaEnabled } from "./env.js";
import { detectSkills, detectLocation } from "./match.js";
import { readCache, writeCache } from "./store.js";

const EXA_URL = "https://api.exa.ai/search";
const CACHE_FILE = "exa-cache.json";

// Builds the request body in code from the role spec. Claude never writes it.
export function buildExaRequest(spec, numResults = env.EXA_SIZE) {
  const titles = (spec.search_titles || []).slice(0, 3).join(" or ") || spec.title || "engineer";
  const skills = (spec.must_have_skills || []).slice(0, 3).join(", ");
  const location = spec.location && !/north east england/i.test(spec.location) ? spec.location : "North East England";
  const query = `${titles} based in ${location}, UK${skills ? ` with ${skills}` : ""}`;
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

export function normaliseExaResult(r = {}, index = 0) {
  const url = typeof r.url === "string" ? r.url : "";
  const highlights = Array.isArray(r.highlights) ? r.highlights.filter((h) => typeof h === "string") : [];
  const text = [r.title, ...highlights].join(" ");
  const isLinkedIn = /(^|\.)linkedin\.com\//i.test(url);
  const id = `exa-${(r.id || url || String(index)).replace(/[^a-z0-9]/gi, "").slice(-24) || index}`;
  return {
    id,
    name: cleanName(r.title),
    headline: headlineFrom(r.title),
    location: detectLocation(text),
    university: "",
    degree: "",
    grad_year: "",
    skills: detectSkills(text),
    experience: [],
    education: [],
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
