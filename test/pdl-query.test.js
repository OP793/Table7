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

test("searchPdlDemo returns labelled fictional records matching the titles", async () => {
  const { searchPdlDemo } = await import("../lib/pdl.js");
  const { records, note } = searchPdlDemo(spec, 5);
  assert.ok(records.length > 0 && records.length <= 5);
  for (const r of records) {
    assert.equal(r.source, "pdl");
    assert.equal(r.demo, true);
    assert.ok(r.id.startsWith("pdl-demo-"));
  }
  assert.match(note, /PDL demo/);
  const other = searchPdlDemo({ search_titles: ["zoologist"] }, 5);
  assert.equal(other.records.length, 0);
});
