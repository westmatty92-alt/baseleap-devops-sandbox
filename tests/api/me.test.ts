// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/me/route';
import { GetMeResponse } from '@/lib/api/generated/session/session.zod';
import { authed, cleanupTenant, deactivate, request, testTenant, type Tenant } from '../helpers/auth';

let t: Tenant;
beforeAll(async () => {
  t = await testTenant();
});
afterAll(async () => {
  await cleanupTenant(t);
});

const call = (user?: { accessToken: string }) =>
  GET(user ? authed(request('GET', '/api/me'), user) : request('GET', '/api/me'), undefined);

describe('GET /api/me (getMe)', () => {
  it('AC-004.8 returns the member, role and the org today, in the contract shape', async () => {
    const res = await call(t.techA);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = GetMeResponse.parse(await res.json());
    expect(body.member).toEqual({ id: t.techA.memberId, name: t.techA.name, role: 'technician' });
    expect(body.org.id).toBe(t.orgId);
    expect(body.org.time_zone).toBe('America/Toronto');
  });

  it('owner sees role owner', async () => {
    expect(GetMeResponse.parse(await (await call(t.owner)).json()).member.role).toBe('owner');
  });

  it('no session → 401 problem+json', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect((await res.json()).code).toBe('unauthenticated');
  });

  it('garbage or malformed bearer token → 401', async () => {
    expect((await call({ accessToken: 'not-a-jwt' })).status).toBe(401);
    const res = await GET(request('GET', '/api/me', { headers: { authorization: 'Basic abc' } }), undefined);
    expect(res.status).toBe(401);
  });

  it('cross-tenant: each org sees only its own org', async () => {
    const body = GetMeResponse.parse(await (await call(t.other.owner)).json());
    expect(body.org.id).toBe(t.other.orgId);
    expect(body.org.id).not.toBe(t.orgId);
  });

  it('a removed member gets 401', async () => {
    await deactivate(t.techB);
    expect((await call(t.techB)).status).toBe(401);
  });
});
