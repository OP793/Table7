// ─────────────────────────────────────────────────────────────────────────────
// Data layer. EVERY screen gets its data through these functions and nothing else.
//
// Right now they return mock data (see ./mock.ts) so the frontend can be built
// without a backend. To hook up the real backend, replace each function body
// with a fetch() to the matching endpoint — the suggested endpoints are noted
// above each one. The screens won't need to change.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Account,
  ApplicantProfile,
  CandidateSearchResult,
  LoginInput,
  MembershipPlan,
  SignUpInput,
} from "./types";
import { mock } from "./mock";

// POST /auth/signup
export function signUp(input: SignUpInput): Promise<Account> {
  return mock.signUp(input);
}

// POST /auth/login
export function logIn(input: LoginInput): Promise<Account> {
  return mock.logIn(input);
}

// POST /auth/logout
export function logOut(): Promise<void> {
  return mock.logOut();
}

// GET /auth/me  (returns null when not signed in)
export function getCurrentAccount(): Promise<Account | null> {
  return mock.getCurrentAccount();
}

// GET /membership/plans
export function getMembershipPlans(): Promise<MembershipPlan[]> {
  return mock.getMembershipPlans();
}

// POST /membership/checkout  — real version will likely redirect to Stripe etc.
export function purchaseMembership(planId: string): Promise<Account> {
  return mock.purchaseMembership(planId);
}

// GET /applicants/me/profile
export function getMyProfile(): Promise<ApplicantProfile> {
  return mock.getMyProfile();
}

// PUT /applicants/me/profile
export function updateMyProfile(profile: ApplicantProfile): Promise<ApplicantProfile> {
  return mock.updateMyProfile(profile);
}

// POST /applicants/me/linkedin  — real version will be an OAuth redirect
export function connectLinkedIn(): Promise<ApplicantProfile> {
  return mock.connectLinkedIn();
}

// POST /applicants/me/cv  (multipart upload)
export function uploadCv(file: File): Promise<ApplicantProfile> {
  return mock.uploadCv(file);
}

// POST /employers/search  { prompt }
// Works signed out too — the UI blurs results until the employer signs in.
export function searchCandidates(prompt: string): Promise<CandidateSearchResult> {
  return mock.searchCandidates(prompt);
}
