# Northern Beacon

Hackathon project. A North East employer records a voice note describing who they need, and the app returns a ranked shortlist of candidates without a job ad ever being posted.

Candidates come from two sources, merged into one shortlist:

1. **Opted-in pool**: graduates upload a CV (or their LinkedIn "Save to PDF" export) on the **I'm looking for work** side of the home page (`/#work`). Claude extracts a structured profile. Only the profile and a consent timestamp are stored, never the file.
2. **People Data Labs (PDL)**: Person Search finds North East people who never signed up, usually with a LinkedIn URL.
3. **Exa**: people search over public profiles, mostly LinkedIn pages, with name, role, education and a profile link.

Public LinkedIn profiles reach the shortlist through Exa's people search API, which indexes them. Northern Beacon does not run its own LinkedIn scraper or log in to LinkedIn.

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
| `EXA_API_KEY` | Exa web search as a third candidate source | unset = Exa off |
| `EXA_SIZE` | Exa results per search | `5` |
| `PORT` | Web server port | `3000` |
| `NORTHERN_BEACON_DATA_DIR` | Folder for data files | `data/` |

Keys never reach the browser. `.env` is gitignored.

## How it works

```
voice note ──▶ /api/role ──▶ role spec (chips)
                                  │
                                  ▼
                            /api/search
                 ┌────────────────┴────────────────┐
     pool (data/applicants.json)         PDL Person Search (cached)
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
- **Exa** (`lib/exa.js`): raw HTTP to `POST https://api.exa.ai/search` with the `x-api-key` header, no SDK. The body is built in code from the role spec: natural-language query (titles, location, must-have skills), `type: "auto"`, `category: "people"`, `numResults`, and `contents: { highlights: true }`. Results are normalised to the candidate shape with `source: "exa"` and cached in `data/exa-cache.json`. Exa's own guidance says the `people` category retrieves public profile documents and that large-scale sourcing belongs on its async `/agent` API; this app uses the synchronous search because a shortlist of 5 fits one request. Exa's index can surface public LinkedIn profile pages. Northern Beacon never crawls LinkedIn itself.
- **Contactable only**: the shortlist only includes people with an email, a LinkedIn URL or a public profile URL. Anyone else is dropped before ranking, and the UI shows how many were hidden. Applicants always have an email because it is their login.
- **Real people only**: there is no sample, demo or made-up data. The pool starts empty and fills only with graduates who make an account. Every other candidate comes live from Exa (and PDL when a key is set). Before a demo, have a few real graduates sign up so the pool isn't empty.
- **Graduates or students**: employers pick **Anyone**, **Recent graduates** or **Students for internships or placements** before searching. Applicants choose their stage on their profile, and that always wins. Exa and PDL people are classified from their education dates: still studying or finishing in a future year means student, finished within the last 3 years means recent graduate (`classifyStage` in `lib/match.js`). People who don't match, or whose stage can't be worked out, are left out and counted in the UI. With a filter on, Exa is asked for twice as many results, and student searches add intern and placement titles to the PDL query.
- **Applicant accounts** (`lib/accounts.js`): graduates and students create a free account (name, email, password) on the **I'm looking for work** side, then add a CV or fill in their details by hand, and can come back any time to edit, hide or delete their profile. Passwords are stored as salted scrypt hashes using Node's built-in `crypto`. Logins use a random token in an HttpOnly cookie, and only a SHA-256 of the token is stored. Ten wrong passwords for one email locks it for 15 minutes. The account email is the contact email employers see.
- **Where applicant data lives**: accounts in `data/accounts.json`, login sessions in `data/sessions.json`, profiles in `data/applicants.json`. All three are gitignored because they hold personal data. Set `NORTHERN_BEACON_DATA_DIR` to keep data somewhere else (the tests use this).
- **CV upload** (`POST /api/me/cv`): multer in memory, 5 MB limit, consent and stage required for a new profile. PDFs go to Claude as a document block; DOCX is converted with mammoth; TXT is read as text. Uploading a newer CV refreshes the profile and keeps anything the CV doesn't mention. Only the extracted details are stored, never the file.

### A note on the Claude call

The brief asked for forced `tool_choice: {type: "tool"}`. Claude Sonnet 5.5 (and Opus 5.5) reject forced tool choice with a 400, so the code uses `tool_choice: auto` with `strict: true` on the tool and an explicit instruction, then retries once if no tool call comes back. The result is still read from the `tool_use` block's input and validated with defaults.

## API

| Route | Body | Returns |
|---|---|---|
| `GET /api/status` | | `{ claude, pdl, poolSize, model }` |
| `POST /api/role` | `{ transcript }` | `{ spec, mode }` |
| `POST /api/search` | `{ spec }` | `{ matches[], counts: { pool, pdl }, pdlNote, mode }` |
| `POST /api/auth/signup` | `{ name, email, password }` | `{ account, profile: null }` + login cookie |
| `POST /api/auth/login` | `{ email, password }` | `{ account, profile }` + login cookie |
| `POST /api/auth/logout` | | `{ ok }` |
| `GET /api/me` | | `{ account, profile }` (both `null` when logged out) |
| `POST /api/me/cv` | multipart `cv`, plus `consent=true` and `stage` for a new profile, optional `linkedin_url` | `{ profile, mode }` |
| `PUT /api/me/profile` | profile fields, `stage` (`graduate` or `student`), `visible`, `consent=true` for a new profile | `{ profile }` |
| `DELETE /api/me` | | `{ ok }`; deletes the account, profile and sessions |

`mode` is `"claude"` or `"keyword"` so you can see which path ran.

## Demo script (about 3 minutes)

1. Open `http://localhost:3000`. The **I'm hiring** side of the switch is open by default. Point at the status line in the footer: graduates in pool, Claude on/off, PDL on/off, Exa on/off.
2. Tap the mic and say: *"I need a graduate mechanical engineer who knows SolidWorks for our plant in Sunderland."* Show the live transcript, then edit a word to prove it's editable.
3. Click **Find people**. Show the chips: that's what Claude understood, no job ad written.
4. Walk down the shortlist: score bar, one-sentence reason, gaps, skills, LinkedIn link. Point out the source tags: **signed up** (graduates who sent a CV), **via PDL** and **via Exa**.
5. Expand an outreach draft, click **Copy**, and read the transparency line at the bottom.
6. Flip the switch to **I'm looking for work**, create an account, upload a CV, tick consent, and show the profile it filled in. Change a skill and save. Mention we never store the file.
7. Back on **I'm hiring**, search again: the new graduate appears in the shortlist.

## Verified / not yet verified

Verified locally: unit tests, all four routes with and without keys, TXT CV upload in both modes, consent rejection, PDF rejected cleanly without a key.

Not verified: live PDL calls (no `PDL_API_KEY` during the build, so the `NE_LOCALITIES` strings and the `education[]` field names are unconfirmed against a real response), PDF and DOCX parsing with Claude, and Web Speech on Safari.
