import test from "node:test";
import assert from "node:assert/strict";
import { buildPdlQuery, NE_LOCALITIES, normalisePdlRecord } from "../lib/pdl.js";

const spec = {
  title: "Graduate Mechanical Engineer",
  discipline: "mechanical",
  seniority: "graduate",
  must_have_skills: ["solidworks"],
  nice_to_have_skills: ["fea"],
  location: "Sunderland",
  summary: "Graduate mechanical engineer who knows SolidWorks for a plant in Sunderland.",
  search_titles: ["mechanical engineer", "Design Engineer", "graduate mechanical engineer"],
};

test("buildPdlQuery produces the expected bool.must structure", () => {
  const q = buildPdlQuery(spec);
  const must = q.query.bool.must;
  assert.equal(must.length, 4);
  assert.deepEqual(must[0], { term: { location_country: "united kingdom" } });
  assert.deepEqual(must[1], { terms: { location_locality: NE_LOCALITIES } });
  assert.deepEqual(must[3], { exists: { field: "linkedin_url" } });

  const should = must[2].bool.should;
  assert.deepEqual(should, [
    { match_phrase: { job_title: "mechanical engineer" } },
    { match_phrase: { job_title: "design engineer" } },
    { match_phrase: { job_title: "graduate mechanical engineer" } },
  ]);
});

test("buildPdlQuery lowercases titles and falls back to the role title", () => {
  const q = buildPdlQuery({ title: "Data Analyst", search_titles: [] });
  assert.deepEqual(q.query.bool.must[2].bool.should, [{ match_phrase: { job_title: "data analyst" } }]);
});

test("buildPdlQuery only uses allowed Elasticsearch query types", () => {
  const allowed = new Set(["term", "terms", "exists", "bool", "match", "match_phrase", "wildcard", "prefix", "range", "match_all"]);
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (["query", "must", "should", "must_not", "filter", "field"].includes(k)) {
          walk(v);
          continue;
        }
        assert.ok(allowed.has(k), `unexpected query type: ${k}`);
        if (["bool"].includes(k)) walk(v);
      }
    }
  };
  walk(buildPdlQuery(spec).query);
});

test("NE_LOCALITIES are lowercase", () => {
  for (const l of NE_LOCALITIES) assert.equal(l, l.toLowerCase());
});

test("normalisePdlRecord maps fields and prefixes the LinkedIn URL", () => {
  const c = normalisePdlRecord({
    id: "abc123",
    full_name: "jane smith",
    job_title: "design engineer",
    job_company_name: "tyne fabrications",
    location_name: "newcastle upon tyne, tyne and wear, united kingdom",
    linkedin_url: "linkedin.com/in/janesmith",
    skills: ["solidworks", "fea"],
    experience: [{ title: { name: "design engineer" }, company: { name: "tyne fabrications" } }],
    education: [{ school: { name: "newcastle university" }, degrees: ["masters"], majors: ["mechanical engineering"] }],
  });
  assert.equal(c.id, "pdl-abc123");
  assert.equal(c.name, "Jane Smith");
  assert.equal(c.headline, "Design Engineer At Tyne Fabrications");
  assert.equal(c.linkedin_url, "https://linkedin.com/in/janesmith");
  assert.deepEqual(c.experience, ["design engineer at tyne fabrications"]);
  assert.equal(c.education[0], "masters · mechanical engineering · newcastle university");
  assert.equal(c.source, "pdl");
});


test("buildExaRequest nests contents and uses the people category", async () => {
  const { buildExaRequest } = await import("../lib/exa.js");
  const body = buildExaRequest(spec, 5);
  assert.equal(body.type, "auto");
  assert.equal(body.category, "people");
  assert.equal(body.numResults, 5);
  assert.deepEqual(body.contents, { highlights: true });
  assert.match(body.query, /mechanical engineer/);
  assert.match(body.query, /Sunderland/);
  assert.match(body.query, /solidworks/i);
  for (const bad of ["text", "highlights", "summary", "useAutoprompt", "numSentences", "startPublishedDate"]) {
    assert.ok(!(bad in body), `${bad} must not be top-level`);
  }
});

test("normaliseExaResult maps a public profile result", async () => {
  const { normaliseExaResult } = await import("../lib/exa.js");
  const c = normaliseExaResult({
    id: "https://www.linkedin.com/in/jane-smith-123",
    url: "https://www.linkedin.com/in/jane-smith-123",
    title: "Jane Smith - Design Engineer - Tyne Fabrications | LinkedIn",
    highlights: ["Design Engineer at Tyne Fabrications in Gateshead using SolidWorks and FEA."],
  });
  assert.equal(c.name, "Jane Smith");
  assert.equal(c.headline, "Design Engineer at Tyne Fabrications in Gateshead using SolidWorks and FEA.");
  assert.equal(c.linkedin_url, "https://www.linkedin.com/in/jane-smith-123");
  assert.equal(c.location, "Gateshead");
  assert.ok(c.skills.includes("solidworks"));
  assert.equal(c.source, "exa");
  assert.ok(c.id.startsWith("exa-"));
});

test("normaliseExaResult reads the person entity when present", async () => {
  const { normaliseExaResult } = await import("../lib/exa.js");
  const c = normaliseExaResult({
    id: "x1",
    url: "https://uk.linkedin.com/in/test-person",
    title: "Test Person",
    highlights: ["# Test Person\n\nMechanical engineer using SolidWorks in Sunderland.\n\nSunderland, England"],
    entities: [{
      type: "person",
      properties: {
        name: "Test Person",
        location: "Sunderland, England, United Kingdom",
        workHistory: [{ title: "Design Engineer", company: { name: "Acme" }, dates: { from: "2025-01-01", to: null } }],
        educationHistory: [{ degree: "BEng Mechanical Engineering", institution: { name: "University of Sunderland" }, dates: { from: "2021", to: "2024" } }],
      },
    }],
  });
  assert.equal(c.name, "Test Person");
  assert.equal(c.headline, "Mechanical engineer using SolidWorks in Sunderland.");
  assert.equal(c.location, "Sunderland, England, United Kingdom");
  assert.deepEqual(c.experience, ["Design Engineer at Acme"]);
  assert.equal(c.university, "University of Sunderland");
  assert.equal(c.grad_year, "2024");
  assert.ok(c.skills.includes("solidworks"));
});

test("hasContact requires an email, LinkedIn URL or profile URL", async () => {
  const { hasContact } = await import("../lib/match.js");
  assert.equal(hasContact({ name: "No Contact", linkedin_url: "", email: "" }), false);
  assert.equal(hasContact({ email: "not-an-email" }), false);
  assert.equal(hasContact({ email: "jane@example.com" }), true);
  assert.equal(hasContact({ linkedin_url: "https://linkedin.com/in/jane" }), true);
  assert.equal(hasContact({ profile_url: "https://example.org/jane" }), true);
});

test("normalisePdlRecord picks up a work email when present", () => {
  const c = normalisePdlRecord({ id: "e1", full_name: "a b", work_email: "a.b@example.com" });
  assert.equal(c.email, "a.b@example.com");
});

test("normaliseExaResult treats bare and regional linkedin.com hosts as LinkedIn", async () => {
  const { normaliseExaResult } = await import("../lib/exa.js");
  for (const url of ["https://linkedin.com/in/a", "https://www.linkedin.com/in/a", "https://uk.linkedin.com/in/a"]) {
    assert.equal(normaliseExaResult({ url, title: "A" }).linkedin_url, url);
  }
  assert.equal(normaliseExaResult({ url: "https://notlinkedin.com/in/a", title: "A" }).linkedin_url, "");
});

test("classifyStage uses self-reported stage, education dates and headline text", async () => {
  const { classifyStage } = await import("../lib/match.js");
  const now = 2026;
  assert.equal(classifyStage({ stage: "student", grad_year: "2020" }, now), "student");
  assert.equal(classifyStage({ studying: true }, now), "student");
  assert.equal(classifyStage({ grad_year: "2027" }, now), "student");
  assert.equal(classifyStage({ headline: "Undergraduate seeking a placement year" }, now), "student");
  assert.equal(classifyStage({ grad_year: "2025" }, now), "graduate");
  assert.equal(classifyStage({ grad_year: "2023" }, now), "graduate");
  assert.equal(classifyStage({ grad_year: "2015" }, now), "experienced");
  assert.equal(classifyStage({ headline: "Graduate Mechanical Engineer at Acme" }, now), "graduate");
  assert.equal(classifyStage({ headline: "Mechanical Engineer" }, now), "unknown");
});

test("educationTimeline spots ongoing study and the latest end year", async () => {
  const { educationTimeline } = await import("../lib/match.js");
  assert.deepEqual(educationTimeline([{ from: "2024", to: null }], 2026), { studying: true, latestYear: null });
  assert.deepEqual(educationTimeline([{ from: "2019", to: "2022" }, { from: "2022", to: "2023-06" }], 2026), { studying: false, latestYear: 2023 });
  assert.deepEqual(educationTimeline([{ from: "2025-09", to: "2028-06" }], 2026), { studying: true, latestYear: 2028 });
});

test("student searches widen PDL titles and steer the Exa query", async () => {
  const { buildExaRequest } = await import("../lib/exa.js");
  const studentSpec = { ...spec, candidate_type: "student" };
  const should = buildPdlQuery(studentSpec).query.bool.must[2].bool.should.map((s) => s.match_phrase.job_title);
  assert.ok(should.includes("mechanical engineer intern"));
  assert.ok(should.includes("placement student"));
  assert.match(buildExaRequest(studentSpec, 5).query, /internship or placement/);
  assert.match(buildExaRequest({ ...spec, candidate_type: "graduate" }, 5).query, /^recent graduate/);
});

test("Exa headline skips location and follower-count lines", async () => {
  const { normaliseExaResult } = await import("../lib/exa.js");
  const c = normaliseExaResult({
    url: "https://uk.linkedin.com/in/x",
    title: "X",
    highlights: ["# X\n\nSunderland, England, United Kingdom (GB)\n\n54 connections • 74 followers\n\nBEng Mechanical Engineering Student"],
  });
  assert.equal(c.headline, "BEng Mechanical Engineering Student");
});
