// Runs the Express app as a single Netlify Function behind /api/*.
// Netlify's filesystem is read-only except /tmp, so data is written there.
// /tmp is per-instance and temporary: sign-ups do not survive a cold start.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import serverless from "serverless-http";

const TMP_DATA = "/tmp/stay-north-data";
let wrapped = null;

async function load() {
  if (!existsSync(TMP_DATA)) {
    mkdirSync(TMP_DATA, { recursive: true });
    const bundled = join(process.cwd(), "data");
    if (existsSync(bundled)) cpSync(bundled, TMP_DATA, { recursive: true });
  }
  // Must be set before server.js (and lib/store.js) are first imported.
  process.env.STAY_NORTH_DATA_DIR = TMP_DATA;
  const { default: app } = await import("../../server.js");
  // Netlify may hand the function its own path; map it back to /api/*.
  return serverless((req, res) => {
    req.url = req.url.replace(/^\/\.netlify\/functions\/api/, "/api");
    return app(req, res);
  });
}

export const handler = async (event, context) => {
  if (!wrapped) wrapped = await load();
  return wrapped(event, context);
};
