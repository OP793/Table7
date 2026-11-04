// Shared data shapes. This is the contract between the frontend and the backend.
// If the backend returns something different, change it here and TypeScript
// will point at every screen that needs updating.

export type Role = "applicant" | "employer";

export interface Account {
  id: string;
  role: Role;
  name: string;
  email: string;
  /** Applicants only: whether the membership fee has been paid. */
  isMember: boolean;
  /** Employers only. */
  company?: string;
}

export interface SignUpInput {
  role: Role;
  name: string;
  email: string;
  password: string;
  company?: string;
}

export interface LoginInput {
  role: Role;
  email: string;
  password: string;
}

export interface ApplicantProfile {
  accountId: string;
  fullName: string;
  headline: string;
  location: string;
  skills: string[];
  linkedinUrl: string;
  linkedinConnected: boolean;
  cvFileName: string | null;
  about: string;
  /** Whether employers can see this profile in search results. */
  visible: boolean;
}

export interface MembershipPlan {
  id: string;
  name: string;
  priceMonthly: number;
  currency: string;
  features: string[];
}

export interface CandidateMatch {
  id: string;
  name: string;
  headline: string;
  location: string;
  skills: string[];
  /** 0–100, how well the AI thinks they fit the prompt. */
  matchScore: number;
  /** Short AI explanation of why they fit. */
  reason: string;
  /** "member" = a paying Table7 applicant; "linkedin" = found by scanning. */
  source: "member" | "linkedin";
  profileUrl: string;
}

export interface CandidateSearchResult {
  prompt: string;
  candidates: CandidateMatch[];
}
