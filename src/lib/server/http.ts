import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { ZodError } from 'zod';
import type { Problem, ProblemCode } from '@/lib/api/generated/model';
import { actorOf, logRequest } from './log';

type FieldErrorCode = 'required' | 'too_long' | 'invalid_format' | 'invalid_date' | 'technician_not_assignable';
export type FieldError = { field: string; message: string; code?: FieldErrorCode };

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Sign in again',
  403: 'Not allowed',
  404: 'Not found',
  409: 'The job changed',
  422: 'Check the highlighted fields',
};

/** A contract error: becomes application/problem+json with exactly the documented fields. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
    readonly code: ProblemCode,
    readonly extra: { detail?: string; errors?: FieldError[]; current?: unknown } = {},
  ) {
    super(code);
  }
}

const BASE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: BASE_HEADERS });
}

export function problemResponse(e: HttpError) {
  const body: Problem & { current?: unknown } = {
    type: 'about:blank',
    title: TITLES[e.status] ?? 'Error',
    status: e.status,
    code: e.code,
    ...(e.extra.detail ? { detail: e.extra.detail } : {}),
    ...(e.extra.errors ? { errors: e.extra.errors } : {}),
    ...(e.extra.current !== undefined ? { current: e.extra.current } : {}),
  };
  return NextResponse.json(body, {
    status: e.status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/problem+json' },
  });
}

export const unauthenticated = () => new HttpError(401, 'unauthenticated');
export const notAllowed = () => new HttpError(403, 'not_allowed');
export const notFound = () => new HttpError(404, 'not_found');

const MESSAGES: Record<FieldErrorCode, string> = {
  required: 'This field is required',
  too_long: 'This is too long',
  invalid_format: 'Check this value',
  invalid_date: 'Enter a valid date',
  technician_not_assignable: 'That technician is no longer on the team',
};

const DATE_FIELDS = new Set(['job_date', 'date']);

function valueAt(input: unknown, path: PropertyKey[]): unknown {
  let cur = input;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

/** Zod issues → the contract's 422 `errors[]`. Unknown fields are rejected, never silently dropped. */
export function validationError(error: ZodError, input: unknown): HttpError {
  const errors: FieldError[] = [];
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.') || 'body';
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) errors.push({ field: [...issue.path.map(String), key].join('.'), message: 'Unknown field' });
      continue;
    }
    let code: FieldErrorCode;
    if (valueAt(input, issue.path) === undefined) code = 'required';
    else if (issue.code === 'too_big' && issue.origin === 'string') code = 'too_long';
    else if (issue.code === 'too_small' && issue.origin === 'string') code = 'required';
    else if (DATE_FIELDS.has(field)) code = 'invalid_date';
    else code = 'invalid_format';
    errors.push({ field, message: MESSAGES[code], code });
  }
  return new HttpError(422, 'validation_failed', { errors });
}

/** Malformed JSON → 400 (contract: BadRequest). */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'bad_request', { detail: 'The request body must be valid JSON' });
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a handler: request id, problem+json for contract errors, a generic 500 for the rest, one log line. */
export function route<C = unknown>(name: string, handler: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    let res: Response;
    let code: string | undefined;
    try {
      res = await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        code = e.code;
        res = problemResponse(e);
      } else {
        code = 'internal_error';
        // The cause stays out of the response and the log: SQL and stack text can carry customer data.
        res = NextResponse.json(
          { type: 'about:blank', title: 'Something went wrong', status: 500, code: 'internal_error' },
          { status: 500, headers: { ...BASE_HEADERS, 'Content-Type': 'application/problem+json' } },
        );
      }
    }
    res.headers.set('X-Request-Id', requestId);
    logRequest({
      request_id: requestId,
      route: name,
      status: res.status,
      outcome: res.status >= 500 ? 'server_error' : res.status >= 400 ? 'client_error' : 'ok',
      duration_ms: Date.now() - started,
      ...(actorOf(req) ?? {}),
      ...(code ? { code } : {}),
    });
    return res;
  };
}
