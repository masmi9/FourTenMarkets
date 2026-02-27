import Constants from "expo-constants";
import { getToken } from "./storage";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://localhost:3333";

async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text)?.error ?? text;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string, name?: string) =>
    apiFetch<LoginResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  me: () => apiFetch<{ user: AuthUser }>("/api/auth/me"),
};

// ── Events ──────────────────────────────────────────────────────────────────

export interface ConsensusOdds {
  odds: number;
  impliedProb: number;
  lineMovement: number;
}

export interface Selection {
  id: string;
  name: string;
  line: string | null;
  consensus: ConsensusOdds | null;
}

export interface Market {
  id: string;
  name: string;
  type: string;
  status: string;
  selections: Selection[];
}

export interface Event {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  league: { name: string; sport: { name: string } };
  markets?: Market[];
}

export const events = {
  list: (params?: { sport?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<Event[]>(`/api/events${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => apiFetch<Event>(`/api/events/${id}`),
};

// ── Single Bets ──────────────────────────────────────────────────────────────

export interface BetRequestResult {
  requestId?: string;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  acceptedOdds: number;
  potentialPayout: number;
  counterOdds?: number;
  reason?: string;
  expiresAt?: string;
}

export interface Bet {
  id: string;
  status: string;
  odds: number;
  stake: string;
  potentialPayout: string;
  placedAt: string;
  selection: {
    name: string;
    line: string | null;
    market: { name: string; event: { homeTeam: string; awayTeam: string } };
  };
  settlement?: { payout: string } | null;
}

export const bets = {
  request: (selectionId: string, requestedOdds: number, stake: number) =>
    apiFetch<BetRequestResult>("/api/bets/request", {
      method: "POST",
      body: JSON.stringify({ selectionId, requestedOdds, stake }),
    }),
  confirm: (requestId: string) =>
    apiFetch<{ betId: string }>("/api/bets/confirm", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    }),
  list: () => apiFetch<Bet[]>("/api/bets"),
};

// ── Parlays ──────────────────────────────────────────────────────────────────

export interface ParlayLegInput {
  selectionId: string;
  requestedOdds: number;
}

export interface ParlayLegResult {
  selectionId: string;
  requestedOdds: number;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  acceptedOdds: number;
  reason?: string;
}

export interface ParlayRequestResult {
  parlayId: string;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  legs: ParlayLegResult[];
  combinedOdds: number;
  potentialPayout: number;
  rejectReason?: string;
  expiresAt?: string;
}

export interface ParlayLeg {
  id: string;
  acceptedOdds: number;
  result: string;
  selection: { name: string; line: string | null };
}

export interface Parlay {
  id: string;
  status: string;
  combinedOdds: number;
  stake: string;
  potentialPayout: string;
  placedAt: string;
  legs: ParlayLeg[];
}

export const parlays = {
  request: (legs: ParlayLegInput[], stake: number) =>
    apiFetch<ParlayRequestResult>("/api/bets/parlay", {
      method: "POST",
      body: JSON.stringify({ legs, stake }),
    }),
  confirm: (parlayId: string) =>
    apiFetch<{ parlayId: string }>("/api/bets/parlay/confirm", {
      method: "POST",
      body: JSON.stringify({ parlayId }),
    }),
  list: () => apiFetch<Parlay[]>("/api/bets/parlay"),
};

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface Wallet {
  balance: string;
  lockedBalance: string;
  available: number;
}

export interface Transaction {
  id: string;
  type: string;
  amount: string;
  createdAt: string;
}

export const wallet = {
  get: () => apiFetch<Wallet>("/api/wallet"),
  deposit: (amount: number) =>
    apiFetch<Wallet>("/api/wallet/deposit", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  withdraw: (amount: number) =>
    apiFetch<Wallet>("/api/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  transactions: () => apiFetch<Transaction[]>("/api/wallet/transactions"),
};
