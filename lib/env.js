// Loads .env without dotenv. Missing file is fine: the app runs with fallbacks.
try {
  process.loadEnvFile();
} catch {
  // no .env present, or loadEnvFile unavailable; environment variables still apply
}

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  PDL_API_KEY: process.env.PDL_API_KEY || "",
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  PDL_SIZE: num(process.env.PDL_SIZE, 5),
  PDL_DEMO: /^(1|true|yes)$/i.test(process.env.PDL_DEMO || ""),
  EXA_API_KEY: process.env.EXA_API_KEY || "",
  EXA_SIZE: num(process.env.EXA_SIZE, 5),
  PORT: num(process.env.PORT, 3000),
};

export const claudeEnabled = () => Boolean(env.ANTHROPIC_API_KEY);
export const pdlEnabled = () => Boolean(env.PDL_API_KEY);
export const exaEnabled = () => Boolean(env.EXA_API_KEY);
// Demo mode: no key, but PDL_DEMO=true serves fictional PDL-shaped records so the
// two-source merge can be shown honestly. Never active when a real key is set.
export const pdlDemo = () => !pdlEnabled() && env.PDL_DEMO;
