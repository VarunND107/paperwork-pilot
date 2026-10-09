import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createTestApp } from './test/appKit.js';

const t = createTestApp();
afterAll(async () => {
  await t.close();
});

describe('app skeleton', () => {
  it('answers the health check, including a database ping', async () => {
    const res = await request(t.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', env: 'test' });
  });

  it('exposes the feature flags the web app needs', async () => {
    const res = await request(t.app).get('/config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      proEnabled: true,
      adminEnabled: true,
      staleAfterDays: 90,
      disclaimer: 'Guidance, not legal advice.',
    });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(t.app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects malformed JSON with a clear 400', async () => {
    const res = await request(t.app)
      .post('/match')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(t.app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('loadConfig', () => {
  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
  });

  it('parses feature flags', () => {
    const c = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'x', PRO_ENABLED: 'true' });
    expect(c.proEnabled).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'x' }).proEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'x', PRO_ENABLED: '0' }).proEnabled).toBe(
      false,
    );
  });

  it('refuses to run in production without a real session secret', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'x',
        SESSION_SECRET: 'change-me-long-random',
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('disables the admin panel when the placeholder password is used in production', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'x',
      SESSION_SECRET: 'a'.repeat(32),
      ADMIN_PASSWORD: 'change-me-admin',
    });
    expect(c.adminPassword).toBe('');
  });
});
