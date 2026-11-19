// Strict response shapes (QA5). A response body must match the contract exactly: every required field present and of
// the right type (the generated zod schema in src/lib/api/generated/, which comes from docs/openapi.yaml), AND no
// property the contract does not define, at any depth. zod's `.strict()` only covers one level, so the walker below
// reads the schema tree and reports every unknown key by its path. The failure names the field.
import { expect } from '@playwright/test';
import type { ZodType } from 'zod';

type Def = { type: string; shape?: Record<string, ZodType>; innerType?: ZodType; element?: ZodType; in?: ZodType; options?: ZodType[] };
const defOf = (s: ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Paths of properties present in `data` that the schema does not define. */
export function unknownKeys(schema: ZodType, data: unknown, path = '$'): string[] {
  const def = defOf(schema);
  switch (def.type) {
    case 'optional': case 'nullable': case 'default': case 'prefault': case 'readonly': case 'nonoptional': case 'catch':
      return def.innerType ? unknownKeys(def.innerType, data, path) : [];
    case 'pipe':
      return def.in ? unknownKeys(def.in, data, path) : [];
    case 'array':
      return Array.isArray(data) && def.element ? data.flatMap((d, i) => unknownKeys(def.element!, d, `${path}[${i}]`)) : [];
    case 'union': {
      // Only the options that accept the value are considered; a value no option accepts is a missing/wrong-type problem.
      const ok = (def.options ?? []).find((o) => o.safeParse(data).success);
      return ok ? unknownKeys(ok, data, path) : [];
    }
    case 'object': {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
      const shape = def.shape ?? {};
      const rec = data as Record<string, unknown>;
      const extra = Object.keys(rec).filter((k) => !(k in shape)).map((k) => `${path}.${k}`);
      const nested = Object.keys(shape).filter((k) => k in rec).flatMap((k) => unknownKeys(shape[k]!, rec[k], `${path}.${k}`));
      return [...extra, ...nested];
    }
    default:
      return [];
  }
}

/** Fails with the offending field named: `missing/invalid: $.jobs[0].version (...)`, `extra: $.jobs[0].secret`. */
export function expectShape(what: string, schema: ZodType, data: unknown): void {
  const parsed = schema.safeParse(data);
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((i) => `missing/invalid: $${i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('')} (${i.message})`);
  const extra = unknownKeys(schema, data).map((p) => `extra (not in the contract): ${p}`);
  expect([...problems, ...extra], `${what}: response body does not match the contract exactly`).toEqual([]);
}

// application/problem+json (components/schemas/Problem, StaleProblem). The contract's Problem has no generated zod
// schema, so the key sets are written here from docs/openapi.yaml.
const PROBLEM_KEYS = ['type', 'title', 'status', 'detail', 'code', 'errors'];
const PROBLEM_REQUIRED = ['type', 'title', 'status', 'code'];
const PROBLEM_CODES = ['bad_request', 'unauthenticated', 'not_allowed', 'not_found', 'stale_version', 'duplicate_email', 'owner_cannot_be_removed', 'technician_not_assignable', 'validation_failed', 'rate_limited'];
const FIELD_ERROR_CODES = ['required', 'too_long', 'invalid_format', 'invalid_date', 'technician_not_assignable'];

export function expectProblemShape(what: string, body: unknown, jobSchema?: ZodType): void {
  const out: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) out.push('body is not an object');
  else {
    for (const k of PROBLEM_REQUIRED) if (!(k in b)) out.push(`missing: $.${k}`);
    const allowed = jobSchema ? [...PROBLEM_KEYS, 'current'] : PROBLEM_KEYS;
    for (const k of Object.keys(b)) if (!allowed.includes(k)) out.push(`extra (not in the contract): $.${k}`);
    if (typeof b.type !== 'string') out.push('invalid: $.type is not a string');
    if (typeof b.title !== 'string') out.push('invalid: $.title is not a string');
    if (typeof b.status !== 'number') out.push('invalid: $.status is not an integer');
    if (!PROBLEM_CODES.includes(b.code as string)) out.push(`invalid: $.code "${String(b.code)}" is not a contract code`);
    if ('detail' in b && typeof b.detail !== 'string') out.push('invalid: $.detail is not a string');
    if ('errors' in b) {
      if (!Array.isArray(b.errors)) out.push('invalid: $.errors is not an array');
      else (b.errors as Record<string, unknown>[]).forEach((e, i) => {
        for (const k of ['field', 'message']) if (typeof e?.[k] !== 'string') out.push(`missing/invalid: $.errors[${i}].${k}`);
        for (const k of Object.keys(e ?? {})) if (!['field', 'message', 'code'].includes(k)) out.push(`extra (not in the contract): $.errors[${i}].${k}`);
        if ('code' in (e ?? {}) && !FIELD_ERROR_CODES.includes(e.code as string)) out.push(`invalid: $.errors[${i}].code "${String(e.code)}"`);
      });
    }
    if (jobSchema) {
      if (!('current' in b)) out.push('missing: $.current');
      else {
        const parsed = jobSchema.safeParse(b.current);
        if (!parsed.success) out.push(...parsed.error.issues.map((i) => `invalid: $.current${i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('')} (${i.message})`));
        out.push(...unknownKeys(jobSchema, b.current, '$.current').map((p) => `extra (not in the contract): ${p}`));
      }
    }
  }
  expect(out, `${what}: problem body does not match the contract exactly`).toEqual([]);
}
