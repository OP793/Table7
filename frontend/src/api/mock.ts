// Fake backend. Delete this file once the real API is wired up in ./index.ts.
// Keeps state in localStorage so a refresh doesn't log you out.

import type {
  Account,
  ApplicantProfile,
  CandidateMatch,
  CandidateSearchResult,
  LoginInput,
  MembershipPlan,
  SignUpInput,
} from "./types";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — fine for a mock */
  }
}

const ACCOUNT_KEY = "table7.mock.account";
const PROFILE_KEY = "table7.mock.profile";

let account: Account | null = load<Account | null>(ACCOUNT_KEY, null);
let profile: ApplicantProfile | null = load<ApplicantProfile | null>(PROFILE_KEY, null);

function setAccount(a: Account | null) {
  account = a;
  save(ACCOUNT_KEY, a);
}
function setProfile(p: ApplicantProfile | null) {
  profile = p;
  save(PROFILE_KEY, p);
}

function blankProfile(a: Account): ApplicantProfile {
  return {
    accountId: a.id,
    fullName: a.name,
    headline: "",
    location: "",
    skills: [],
    linkedinUrl: "",
    linkedinConnected: false,
    cvFileName: null,
    about: "",
    visible: true,
  };
}

const PLANS: MembershipPlan[] = [
  {
    id: "monthly",
    name: "Monthly",
    priceMonthly: 9.99,
    currency: "GBP",
    features: [
      "Profile shown to employers",
      "AI matching against every employer search",
      "LinkedIn + CV sync",
    ],
  },
  {
    id: "yearly",
    name: "Yearly",
    priceMonthly: 7.99,
    currency: "GBP",
    features: [
      "Everything in Monthly",
      "Priority placement in results",
      "2 months free",
    ],
  },
];

const POOL: Omit<CandidateMatch, "matchScore" | "reason">[] = [
  { id: "c1", name: "Priya Sharma", headline: "Senior Frontend Engineer", location: "London", skills: ["React", "TypeScript", "Design Systems", "Accessibility"], source: "member", profileUrl: "#" },
  { id: "c2", name: "James O'Connor", headline: "Full-Stack Developer", location: "Manchester", skills: ["Node.js", "React", "PostgreSQL", "AWS"], source: "linkedin", profileUrl: "#" },
  { id: "c3", name: "Amara Okafor", headline: "Data Scientist", location: "Remote (UK)", skills: ["Python", "Machine Learning", "SQL", "PyTorch"], source: "member", profileUrl: "#" },
  { id: "c4", name: "Tom Becker", headline: "Product Designer", location: "Bristol", skills: ["Figma", "User Research", "Prototyping", "Design Systems"], source: "linkedin", profileUrl: "#" },
  { id: "c5", name: "Li Wei", headline: "Backend Engineer", location: "Edinburgh", skills: ["Go", "Kubernetes", "PostgreSQL", "gRPC"], source: "member", profileUrl: "#" },
  { id: "c6", name: "Sofia Martins", headline: "Marketing Manager", location: "London", skills: ["SEO", "Content Strategy", "Analytics", "Paid Social"], source: "linkedin", profileUrl: "#" },
  { id: "c7", name: "Daniel Reyes", headline: "Mobile Engineer", location: "Leeds", skills: ["Swift", "Kotlin", "React Native", "TypeScript"], source: "member", profileUrl: "#" },
  { id: "c8", name: "Hannah Clarke", headline: "Machine Learning Engineer", location: "Cambridge", skills: ["Python", "LLMs", "MLOps", "AWS"], source: "linkedin", profileUrl: "#" },
];

function scoreFor(prompt: string, c: (typeof POOL)[number]) {
  const words = prompt.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1);
  const haystack = [c.headline, ...c.skills].join(" ").toLowerCase();
  const hits = c.skills.filter((s) => words.some((w) => s.toLowerCase().includes(w)));
  const headlineHit = words.some((w) => c.headline.toLowerCase().includes(w));
  let score = 45 + hits.length * 12 + (headlineHit ? 15 : 0);
  if (!words.some((w) => haystack.includes(w))) score = 30 + (c.id.charCodeAt(1) % 15);
  score = Math.min(98, score);
  const reason = hits.length
    ? `Strong on ${hits.slice(0, 2).join(" and ")}${headlineHit ? `; current role matches "${c.headline}"` : ""}.`
    : headlineHit
      ? `Current role "${c.headline}" lines up with the brief.`
      : `Adjacent experience in ${c.skills[0]}; may need upskilling.`;
  return { score, reason };
}

export const mock = {
  async signUp(input: SignUpInput): Promise<Account> {
    await delay();
    if (!input.email.includes("@")) throw new Error("Enter a valid email address.");
    if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");
    const a: Account = {
      id: crypto.randomUUID(),
      role: input.role,
      name: input.name,
      email: input.email,
      isMember: false,
      company: input.company,
    };
    setAccount(a);
    if (a.role === "applicant") setProfile(blankProfile(a));
    return a;
  },

  async logIn(input: LoginInput): Promise<Account> {
    await delay();
    if (!input.email.includes("@") || !input.password) throw new Error("Email or password is incorrect.");
    // Mock: any credentials work. Reuse the stored account if the email matches.
    if (account && account.email === input.email && account.role === input.role) return account;
    const a: Account = {
      id: crypto.randomUUID(),
      role: input.role,
      name: input.email.split("@")[0],
      email: input.email,
      isMember: false,
      company: input.role === "employer" ? "Your Company" : undefined,
    };
    setAccount(a);
    if (a.role === "applicant") setProfile(blankProfile(a));
    return a;
  },

  async logOut() {
    await delay(150);
    setAccount(null);
  },

  async getCurrentAccount() {
    await delay(100);
    return account;
  },

  async getMembershipPlans() {
    await delay(200);
    return PLANS;
  },

  async purchaseMembership(_planId: string): Promise<Account> {
    await delay(900);
    if (!account) throw new Error("Not signed in.");
    setAccount({ ...account, isMember: true });
    return account!;
  },

  async getMyProfile(): Promise<ApplicantProfile> {
    await delay(200);
    if (!account) throw new Error("Not signed in.");
    if (!profile || profile.accountId !== account.id) setProfile(blankProfile(account));
    return profile!;
  },

  async updateMyProfile(p: ApplicantProfile) {
    await delay(400);
    setProfile(p);
    return p;
  },

  async connectLinkedIn() {
    await delay(800);
    if (!profile) throw new Error("No profile.");
    const slug = profile.fullName.toLowerCase().replace(/\s+/g, "-") || "you";
    setProfile({
      ...profile,
      linkedinConnected: true,
      linkedinUrl: `https://www.linkedin.com/in/${slug}`,
      headline: profile.headline || "Software Engineer",
      skills: profile.skills.length ? profile.skills : ["TypeScript", "React", "Communication"],
    });
    return profile!;
  },

  async uploadCv(file: File) {
    await delay(600);
    if (!profile) throw new Error("No profile.");
    setProfile({ ...profile, cvFileName: file.name });
    return profile!;
  },

  async searchCandidates(prompt: string): Promise<CandidateSearchResult> {
    await delay(1400);
    const candidates = POOL.map((c) => {
      const { score, reason } = scoreFor(prompt, c);
      return { ...c, matchScore: score, reason };
    })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 6);
    return { prompt, candidates };
  },
};
