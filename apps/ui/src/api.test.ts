import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, browserConnection } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('runtime connection', () => {
  it('reads only fragment token and uses browser origin', () => {
    expect(browserConnection({ hash: '#token=secret%2Bvalue', origin: 'http://localhost:1420' })).toEqual({ endpoint: 'http://localhost:1420', token: 'secret+value' });
    expect(() => browserConnection({ hash: '', origin: 'http://localhost:1420' })).toThrow('缺少连接令牌');
  });
  it('normalizes runtime task IDs and authenticates requests', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [{ task_id: 'task-1', status: 'running' }] })));
    vi.stubGlobal('fetch', fetch);
    const api = new Api({ endpoint: 'http://127.0.0.1:4317/', token: 'secret' });
    expect(await api.tasks()).toEqual([{ task_id: 'task-1', id: 'task-1', status: 'running' }]);
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:4317/api/tasks');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
  });
  it('sends interactive input JSON and accepts empty success', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await new Api({ endpoint: 'http://localhost', token: 'secret' }).request('/api/tasks/test/input', { input: '\r' });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"input":"\\r"}' });
  });
  it('explains expired credentials without reflecting response secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret', { status: 401 })));
    await expect(new Api({ endpoint: 'http://localhost', token: 'secret' }).tasks()).rejects.toThrow('连接令牌无效');
  });
});
