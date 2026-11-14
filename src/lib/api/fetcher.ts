// The one hand-written piece of the API layer (frontend lane owns it after the scaffold).
// Orval's generated fetchers call apiFetch(url, init). The URL already carries the contract's
// server base (/api). Session auth is the Supabase cookie, so requests are same-origin with
// credentials. Non-2xx answers carrying application/problem+json are thrown as ApiProblem.
import type { Problem } from './generated/model';

export class ApiProblem extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.title || `HTTP ${status}`);
    this.name = 'ApiProblem';
    this.status = status;
    this.problem = problem;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const text = res.status === 204 ? '' : await res.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok && type.includes('application/problem+json')) {
    throw new ApiProblem(res.status, body as Problem);
  }
  return { data: body, status: res.status, headers: res.headers } as T;
}
