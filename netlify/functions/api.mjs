// Runs the Express app as a Netlify Function (v2, native ES module) on /api/*.
// Netlify's filesystem is read-only except /tmp, so data is written there.
// /tmp is per-instance and temporary: sign-ups do not survive a cold start.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import serverless from "serverless-http";

const TMP_DATA = "/tmp/stay-north-data";
let lambda = null;

async function load() {
  if (!existsSync(TMP_DATA)) {
    mkdirSync(TMP_DATA, { recursive: true });
    const bundled = join(process.cwd(), "data");
    if (existsSync(bundled)) cpSync(bundled, TMP_DATA, { recursive: true });
  }
  // Must be set before server.js (and lib/store.js) are first imported.
  process.env.STAY_NORTH_DATA_DIR = TMP_DATA;
  const { default: app } = await import("../../server.js");
  return serverless(app, { binary: true });
}

// Adapt the web Request to the Lambda-style event serverless-http expects.
export default async (req, context) => {
  if (!lambda) lambda = await load();
  const url = new URL(req.url);
  const body = req.method === "GET" || req.method === "HEAD" ? null : Buffer.from(await req.arrayBuffer());
  const headers = Object.fromEntries(req.headers);
  const result = await lambda({
    httpMethod: req.method,
    path: url.pathname,
    headers,
    multiValueHeaders: {},
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: body ? body.toString("base64") : null,
    isBase64Encoded: Boolean(body),
    requestContext: {},
  }, context);
  const out = new Headers();
  for (const [k, v] of Object.entries(result.headers || {})) out.set(k, String(v));
  for (const [k, vs] of Object.entries(result.multiValueHeaders || {})) for (const v of vs) out.append(k, String(v));
  const payload = result.isBase64Encoded ? Buffer.from(result.body || "", "base64") : result.body;
  return new Response(payload, { status: result.statusCode || 200, headers: out });
};

export const config = { path: "/api/*" };
