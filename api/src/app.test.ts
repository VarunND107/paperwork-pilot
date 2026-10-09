import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused' });

describe('app skeleton', () => {
  it('answers the health check', async () => {
    const res = await request(createApp(config)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', env: 'test' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(createApp(config)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects malformed JSON with a clear 400', async () => {
    const res = await request(createApp(config))
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
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
