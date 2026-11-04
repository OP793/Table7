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
  PORT: num(process.env.PORT, 3000),
};

export const claudeEnabled = () => Boolean(env.ANTHROPIC_API_KEY);
export const pdlEnabled = () => Boolean(env.PDL_API_KEY);
