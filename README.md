# Stay North — Talent

Hackathon project. A North East employer records a voice note describing who they need, and the app returns a ranked shortlist of candidates without a job ad ever being posted.

Candidates come from two sources, merged into one shortlist:

1. **Opted-in pool**: graduates upload a CV (or their LinkedIn "Save to PDF" export) on `/apply.html`. Claude extracts a structured profile. Only the profile and a consent timestamp are stored, never the file.
2. **People Data Labs (PDL)**: Person Search finds North East people who never signed up, usually with a LinkedIn URL.

Stay North never scrapes or automates LinkedIn.

## Setup

Node 20.12 or newer.

```
npm install
cp .env.example .env     # then fill in what you have
npm start                # http://localhost:3000
npm test                 # unit tests for the PDL query builder
```

The app runs with **no keys at all**: role parsing and ranking fall back to keyword matching, PDL is skipped and the UI shows "PDL off". PDF CV parsing needs a Claude key; DOCX and TXT work in keyword mode.

## Environment variables (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude for role parsing, CV extraction and ranking | unset = keyword fallback |
| `PDL_API_KEY` | People Data Labs Person Search | unset = PDL off |
| `CLAUDE_MODEL` | Claude model id | `claude-sonnet-5-5` |
| `PDL_SIZE` | PDL records per search (1 credit each; free plan is 100/month) | `5` |
| `PDL_DEMO` | With no PDL key, serve fictional PDL-shaped records from `data/pdl-demo.json`, labelled "via PDL (demo)" | `false` |
| `EXA_API_KEY` | Exa web search as a third candidate source | unset = Exa off |
| `EXA_SIZE` | Exa results per search | `5` |
| `PORT` | Web server port | `3000` |

Keys never reach the browser. `.env` is gitignored.

## How it works

```
voice note ──▶ /api/role ──▶ role spec (chips)
                                  │
                                  ▼
                            /api/search
                 ┌────────────────┴────────────────┐
     pool (data/candidates.json)         PDL Person Search (cached)
     keyword pre-filter to ≤40           query built in code from spec
                 └────────────────┬────────────────┘
                                  ▼
                   Claude rankCandidates (or keyword fallback)
                                  ▼
                 top 8 cards: score, reason, gaps, outreach draft
```

- **Role parsing** (`lib/llm.js` `parseRole`): Claude fills a strict tool schema. Nothing the employer didn't imply is added.
- **Ranking** (`rankCandidates`): judged only on skills, experience, education and location. Names are stripped from the prompt so they can't influence the score.
- **Transparency line**: the server appends one to every outreach draft. Opted-in candidates are told they opted in; PDL candidates are told where their profile came from and how to opt out.
- **PDL** (`lib/pdl.js`): the Elasticsearch query is built in code (`buildPdlQuery`) and only uses allowed query types. Every response is cached in `data/pdl-cache.json` keyed by the query, so repeat demos cost nothing. Any error gives zero results plus a note in the UI, with no retries.
- **Exa** (`lib/exa.js`): raw HTTP to `POST https://api.exa.ai/search` with the `x-api-key` header, no SDK. The body is built in code from the role spec: natural-language query (titles, location, must-have skills), `type: "auto"`, `category: "people"`, `numResults`, and `contents: { highlights: true }`. Results are normalised to the candidate shape with `source: "exa"` and cached in `data/exa-cache.json`. Exa's own guidance says the `people` category retrieves public profile documents and that large-scale sourcing belongs on its async `/agent` API; this app uses the synchronous search because a shortlist of 5 fits one request. Exa's index can surface public LinkedIn profile pages. Stay North never crawls LinkedIn itself.
- **Contactable only**: the shortlist only includes people with an email, a LinkedIn URL or a public profile URL. Anyone else is dropped before ranking, and the UI shows how many were hidden. Graduates must give an email on `/apply.html`. Fictional sample and demo people use `@example.com` addresses.
- **LinkedIn import demo** (`POST /api/linkedin-import-demo`): the graduate page offers a "Try the demo import" button that animates an import and adds one of four fictional profiles from `data/linkedin-demo.json`, badged "Demo import". It never contacts LinkedIn or reads any URL. The real route is LinkedIn's own "Save to PDF" export, uploaded as a CV.
- **CV upload** (`/api/cv`): multer in memory, 5 MB limit, consent required. PDFs go to Claude as a document block; DOCX is converted with mammoth; TXT is read as text.
- **Sample data**: `data/candidates.json` starts with 20 fictional graduates flagged `sample: true`, shown with a "Sample" badge so the demo is honest.
- **PDL demo mode**: if you can't get a PDL key, set `PDL_DEMO=true`. Nine fictional records in PDL's raw field shape go through the same normaliser and merge path, the status line says "PDL demo", and cards carry a "via PDL (demo)" badge. It is ignored as soon as a real key is set.

### A note on the Claude call

The brief asked for forced `tool_choice: {type: "tool"}`. Claude Sonnet 5.5 (and Opus 5.5) reject forced tool choice with a 400, so the code uses `tool_choice: auto` with `strict: true` on the tool and an explicit instruction, then retries once if no tool call comes back. The result is still read from the `tool_use` block's input and validated with defaults.

## API

| Route | Body | Returns |
|---|---|---|
| `GET /api/status` | | `{ claude, pdl, poolSize, model }` |
| `POST /api/role` | `{ transcript }` | `{ spec, mode }` |
| `POST /api/search` | `{ spec }` | `{ matches[], counts: { pool, pdl }, pdlNote, mode }` |
| `POST /api/cv` | multipart `cv`, `consent=true`, optional `linkedin_url` | `{ candidate, mode }` |

`mode` is `"claude"` or `"keyword"` so you can see which path ran.

## Demo script (about 3 minutes)

1. Open `http://localhost:3000`. Point at the status line: Claude on/off, PDL on/off, graduates in pool.
2. Tap the mic and say: *"I need a graduate mechanical engineer who knows SolidWorks for our plant in Sunderland."* Show the live transcript, then edit a word to prove it's editable.
3. Click **Find people**. Show the chips: that's what Claude understood, no job ad written.
4. Walk down the shortlist: score bar, one-sentence reason, gaps, skills, LinkedIn link. Point out the **Sample** badge vs **Opted in** vs **via PDL**.
5. Expand an outreach draft, click **Copy**, and read the transparency line at the bottom.
6. Switch to **Graduates**, upload a CV, tick consent, and show the extracted profile. Mention we never store the file.
7. Back on **Employers**, search again: the new graduate appears in the shortlist.

## Verified / not yet verified

Verified locally: unit tests, all four routes with and without keys, TXT CV upload in both modes, consent rejection, PDF rejected cleanly without a key.

Not verified: live PDL calls (no `PDL_API_KEY` during the build, so the `NE_LOCALITIES` strings and the `education[]` field names are unconfirmed against a real response), PDF and DOCX parsing with Claude, and Web Speech on Safari.
