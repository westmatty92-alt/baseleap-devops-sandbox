// Unit test for the e2e safety guard (tests/e2e/support/guard.ts). No network, no database, no browser.
// The rules: nothing runs with PRODUCTION_HOSTS unset or the target listed in it; remote mode takes only https previews or
// STAGING_HOST; local mode takes only localhost:3000 and Supabase on 127.0.0.1:554xx; the production Supabase ref is refused.
import { describe, expect, it } from 'vitest';
import { assertSafeSupabase, assertSafeTarget } from '../e2e/support/guard';

const PROD = { PRODUCTION_HOSTS: 'northside-board.vercel.app, board.northside.example' };

describe('assertSafeTarget', () => {
  it('refuses when BASE_URL is missing or not a URL', () => {
    expect(() => assertSafeTarget(undefined, PROD)).toThrow(/BASE_URL is not set/);
    expect(() => assertSafeTarget('not a url', PROD)).toThrow(/not a valid URL/);
  });

  it('refuses with PRODUCTION_HOSTS unset or empty, in both modes', () => {
    expect(() => assertSafeTarget('https://app-git-staging-x.vercel.app', {})).toThrow(/PRODUCTION_HOSTS is not set/);
    expect(() => assertSafeTarget('https://app-git-staging-x.vercel.app', { PRODUCTION_HOSTS: ' , ' })).toThrow(/PRODUCTION_HOSTS is not set/);
    expect(() => assertSafeTarget('http://localhost:3000', { E2E_TARGET: 'local' })).toThrow(/PRODUCTION_HOSTS is not set/);
  });

  it('refuses a production host, with or without scheme in the list', () => {
    expect(() => assertSafeTarget('https://northside-board.vercel.app', PROD)).toThrow(/PRODUCTION_HOSTS/);
    expect(() => assertSafeTarget('https://board.northside.example/board', PROD)).toThrow(/PRODUCTION_HOSTS/);
    expect(() => assertSafeTarget('https://board.northside.example', { PRODUCTION_HOSTS: 'https://board.northside.example/' })).toThrow(/PRODUCTION_HOSTS/);
  });

  it('remote mode: accepts a vercel.app preview that is not production, and the named STAGING_HOST', () => {
    expect(assertSafeTarget('https://app-git-staging-x.vercel.app', PROD).hostname).toBe('app-git-staging-x.vercel.app');
    expect(assertSafeTarget('https://staging.northside.example', { ...PROD, STAGING_HOST: 'staging.northside.example' }).hostname).toBe('staging.northside.example');
  });

  it('remote mode: refuses http, localhost and unknown hosts', () => {
    expect(() => assertSafeTarget('http://app-git-staging-x.vercel.app', PROD)).toThrow(/non-https/);
    expect(() => assertSafeTarget('http://localhost:3000', PROD)).toThrow(/non-https/);
    expect(() => assertSafeTarget('https://example.com', PROD)).toThrow(/not a Vercel preview/);
    expect(() => assertSafeTarget('https://evil.vercel.app.example.com', PROD)).toThrow(/not a Vercel preview/);
  });

  it('local mode: accepts only http://localhost:3000 or 127.0.0.1:3000', () => {
    const env = { ...PROD, E2E_TARGET: 'local' };
    expect(assertSafeTarget('http://localhost:3000', env).port).toBe('3000');
    expect(assertSafeTarget('http://127.0.0.1:3000/', env).hostname).toBe('127.0.0.1');
    expect(() => assertSafeTarget('http://localhost:3001', env)).toThrow(/only allows/);
    expect(() => assertSafeTarget('http://localhost', env)).toThrow(/only allows/);
    expect(() => assertSafeTarget('https://localhost:3000', env)).toThrow(/only allows/);
    expect(() => assertSafeTarget('http://192.168.1.10:3000', env)).toThrow(/only allows/);
    expect(() => assertSafeTarget('https://app-git-staging-x.vercel.app', env)).toThrow(/only allows/);
  });

  it('local mode does not let a production host through even if it is named localhost', () => {
    expect(() => assertSafeTarget('http://localhost:3000', { PRODUCTION_HOSTS: 'localhost', E2E_TARGET: 'local' })).toThrow(/PRODUCTION_HOSTS/);
  });
});

describe('assertSafeSupabase', () => {
  it('refuses a missing or invalid URL', () => {
    expect(() => assertSafeSupabase({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
    expect(() => assertSafeSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'nope' })).toThrow(/not a valid URL/);
  });

  it('remote mode needs SUPABASE_PROD_PROJECT_REF and refuses a URL containing it', () => {
    expect(() => assertSafeSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref.supabase.co' })).toThrow(/SUPABASE_PROD_PROJECT_REF is not set/);
    expect(() => assertSafeSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://prodref.supabase.co', SUPABASE_PROD_PROJECT_REF: 'prodref' })).toThrow(/production project/);
    expect(assertSafeSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref.supabase.co', SUPABASE_PROD_PROJECT_REF: 'prodref' })).toBe('https://stagingref.supabase.co');
  });

  it('local mode accepts only http://127.0.0.1 or localhost on ports 55400-55499', () => {
    const env = { E2E_TARGET: 'local' };
    expect(assertSafeSupabase({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55421' })).toBe('http://127.0.0.1:55421');
    expect(assertSafeSupabase({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:55499' })).toBe('http://localhost:55499');
    for (const url of ['http://127.0.0.1:54321', 'http://127.0.0.1:55500', 'http://127.0.0.1', 'https://127.0.0.1:55421', 'https://stagingref.supabase.co', 'http://10.0.0.5:55421']) {
      expect(() => assertSafeSupabase({ ...env, NEXT_PUBLIC_SUPABASE_URL: url }), url).toThrow(/only allows/);
    }
  });

  it('local mode still refuses the production ref', () => {
    expect(() => assertSafeSupabase({ E2E_TARGET: 'local', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55421', SUPABASE_PROD_PROJECT_REF: '55421' })).toThrow(/production project/);
  });
});
