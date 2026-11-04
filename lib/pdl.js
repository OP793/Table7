// People Data Labs Person Search: query builder, cached search, normalisation.
// The query is built in code from the role spec; Claude never writes raw queries.
import PDLJS from "peopledatalabs";
import { env, pdlEnabled } from "./env.js";
import { NE_LOCALITIES } from "./match.js";
import { readCache, writeCache } from "./store.js";

export { NE_LOCALITIES };

const CACHE_FILE = "pdl-cache.json";

export function buildPdlQuery(spec) {
  const titles = (spec.search_titles || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  const should = (titles.length ? titles : [String(spec.title || "engineer").toLowerCase()])
    .map((t) => ({ match_phrase: { job_title: t } }));
  return {
    query: {
      bool: {
        must: [
          { term: { location_country: "united kingdom" } },
          { terms: { location_locality: NE_LOCALITIES } },
          { bool: { should } },
          { exists: { field: "linkedin_url" } },
        ],
      },
    },
  };
}

function titleCaseName(s) {
  return String(s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function joinParts(...parts) {
  return parts.filter((p) => typeof p === "string" && p.trim()).join(" at ");
}

export function normalisePdlRecord(rec = {}) {
  const experience = (Array.isArray(rec.experience) ? rec.experience : [])
    .map((e) => joinParts(e?.title?.name, e?.company?.name))
    .filter(Boolean)
    .slice(0, 10);
  // UNVERIFIED against a live response: education[].school.name / degrees / majors
  const education = (Array.isArray(rec.education) ? rec.education : [])
    .map((e) => {
      const school = e?.school?.name || "";
      const degrees = Array.isArray(e?.degrees) ? e.degrees.join(", ") : "";
      const majors = Array.isArray(e?.majors) ? e.majors.join(", ") : "";
      return [degrees, majors, school].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .slice(0, 5);
  const linkedin = typeof rec.linkedin_url === "string" && rec.linkedin_url
    ? (rec.linkedin_url.startsWith("http") ? rec.linkedin_url : `https://${rec.linkedin_url}`)
    : "";
  // Free PDL plans hide emails; paid plans return work_email / emails[].address.
  const email = [rec.work_email, ...(Array.isArray(rec.personal_emails) ? rec.personal_emails : []),
    ...(Array.isArray(rec.emails) ? rec.emails.map((e) => e?.address) : [])]
    .find((e) => typeof e === "string" && e.includes("@")) || "";
  const headline = [rec.job_title, rec.job_company_name].filter((v) => typeof v === "string" && v).join(" at ");
  return {
    id: `pdl-${rec.id || Math.random().toString(36).slice(2)}`,
    name: titleCaseName(rec.full_name) || "Unknown",
    headline: titleCaseName(headline),
    location: typeof rec.location_name === "string" ? titleCaseName(rec.location_name) : "",
    university: education[0] ? education[0].split(" · ").pop() : "",
    degree: "",
    grad_year: "",
    skills: Array.isArray(rec.skills) ? rec.skills.filter((s) => typeof s === "string").slice(0, 25) : [],
    experience,
    education,
    linkedin_url: linkedin,
    email,
    summary: "",
    source: "pdl",
  };
}

let client = null;
function getClient() {
  if (!client) client = new PDLJS({ apiKey: env.PDL_API_KEY });
  return client;
}

// Returns { records, note }. Any error or non-200 response gives zero records
// with the reason in `note`. No retries.
export async function searchPdl(spec, size = env.PDL_SIZE) {
  if (!pdlEnabled()) return { records: [], note: "PDL off: no PDL_API_KEY set." };
  const searchQuery = buildPdlQuery(spec);
  const key = JSON.stringify({ searchQuery, size });
  const cache = readCache(CACHE_FILE);
  if (cache[key]) {
    const data = Array.isArray(cache[key].data) ? cache[key].data : [];
    return { records: data.map(normalisePdlRecord), note: `PDL: ${data.length} result(s) from cache (no credits used).` };
  }
  try {
    const response = await getClient().person.search.elastic({ searchQuery, size, pretty: false });
    if (response?.status && response.status !== 200) {
      return { records: [], note: `PDL returned status ${response.status}.` };
    }
    const data = Array.isArray(response?.data) ? response.data : [];
    cache[key] = { data, total: response?.total ?? data.length, cached_at: new Date().toISOString() };
    writeCache(CACHE_FILE, cache);
    return { records: data.map(normalisePdlRecord), note: `PDL: ${data.length} new result(s) (${data.length} credit(s) used, now cached).` };
  } catch (err) {
    const status = err?.status || err?.response?.status;
    const msg = err?.message || String(err);
    return { records: [], note: `PDL error${status ? ` (${status})` : ""}: ${msg.slice(0, 160)}` };
  }
}

// Optional helper for checking NE_LOCALITIES against PDL's free location cleaner.
export async function checkLocalities(names = NE_LOCALITIES.slice(0, 5)) {
  if (!pdlEnabled()) return [];
  const out = [];
  for (const name of names) {
    try {
      const r = await getClient().location.cleaner({ location: `${name}, united kingdom` });
      out.push({ input: name, locality: r?.locality ?? null, name: r?.name ?? null });
    } catch (err) {
      out.push({ input: name, error: err?.message || String(err) });
    }
  }
  return out;
}
