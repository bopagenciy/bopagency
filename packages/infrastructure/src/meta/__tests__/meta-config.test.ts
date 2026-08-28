import { describe, it, expect, afterEach } from 'vitest';
import { getMetaGraphApiVersion, getMetaAppConfig } from '../meta-config';

describe('Meta Config', () => {
  const origVersion = process.env['META_GRAPH_API_VERSION'];
  const origAppId = process.env['META_APP_ID'];
  const origAppSecret = process.env['META_APP_SECRET'];

  afterEach(() => {
    if (origVersion) process.env['META_GRAPH_API_VERSION'] = origVersion;
    else delete process.env['META_GRAPH_API_VERSION'];

    if (origAppId) process.env['META_APP_ID'] = origAppId;
    else delete process.env['META_APP_ID'];

    if (origAppSecret) process.env['META_APP_SECRET'] = origAppSecret;
    else delete process.env['META_APP_SECRET'];
  });

  it('devuelve la versión si es válida (formato vX.Y)', () => {
    process.env['META_GRAPH_API_VERSION'] = 'v26.0';
    expect(getMetaGraphApiVersion()).toBe('v26.0');
  });

  it('lanza error si META_GRAPH_API_VERSION falta', () => {
    delete process.env['META_GRAPH_API_VERSION'];
    expect(() => getMetaGraphApiVersion()).toThrow(/missing/);
  });

  it('lanza error si META_GRAPH_API_VERSION tiene formato inválido', () => {
    process.env['META_GRAPH_API_VERSION'] = '26.0';
    expect(() => getMetaGraphApiVersion()).toThrow(/format invalid/);
  });

  it('obtiene appId y appSecret si están presentes', () => {
    process.env['META_APP_ID'] = '123456';
    process.env['META_APP_SECRET'] = 'secret789';
    expect(getMetaAppConfig()).toEqual({ appId: '123456', appSecret: 'secret789' });
  });
});
