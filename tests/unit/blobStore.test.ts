import { describe, expect, it } from 'vitest';
import { BlobCloudStore, type BlobApi } from '../../server/blobStore';
import { CloudService } from '../../server/cloud';

/** Fake Blob SDK: a store that is either private or public; the wrong access mode fails like the real API (403). */
function fakeBlob(storeAccess: 'private' | 'public'): BlobApi & { files: Map<string, string>; calls: string[] } {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const check = (access: string, op: string): void => {
    calls.push(`${op}:${access}`);
    if (access !== storeAccess) throw new Error(`Failed to fetch blob: 403 Forbidden`);
  };
  return {
    files,
    calls,
    async get(pathname, options) {
      check(options.access, 'get');
      const text = files.get(pathname);
      if (text === undefined) return null;
      return { statusCode: 200, stream: new Blob([text]).stream() };
    },
    async put(pathname, body, options) {
      check(options.access, 'put');
      files.set(pathname, body);
      return {};
    },
    async del(pathname) {
      calls.push('del');
      files.delete(pathname);
    },
  };
}

describe('Cloud saves: Vercel Blob store', () => {
  it('works with a private store without any fallback', async () => {
    const blob = fakeBlob('private');
    const store = new BlobCloudStore(blob, 'private');
    const service = new CloudService(store, 'test-secret-with-enough-length');
    const reg = await service.register('Ada', 'geheim1');
    expect(reg.ok).toBe(true);
    expect(store.mode).toBe('private');
    expect(blob.calls.every((c) => c.endsWith(':private') || c === 'del')).toBe(true);
    expect((await service.login('ada', 'geheim1')).ok).toBe(true);
  });

  it('falls back to public access when the store was created as public (the former cause of a bare 500)', async () => {
    const blob = fakeBlob('public');
    const messages: string[] = [];
    const store = new BlobCloudStore(blob, 'private', (m) => messages.push(m));
    const service = new CloudService(store, 'test-secret-with-enough-length');
    const reg = await service.register('Bo', 'geheim2');
    expect(reg.ok).toBe(true);
    expect(store.mode).toBe('public');
    expect(messages.length).toBe(1);
    expect(blob.calls[0]).toBe('get:private');
    expect(blob.calls[1]).toBe('get:public');
    // Once confirmed, no more private attempts.
    expect((await service.login('bo', 'geheim2')).ok).toBe(true);
    expect(blob.calls.slice(2).every((c) => c.endsWith(':public'))).toBe(true);
    expect(blob.files.size).toBe(1);
  });

  it('propagates real failures once the mode is confirmed', async () => {
    const blob = fakeBlob('private');
    const store = new BlobCloudStore(blob, 'private');
    await store.writeUser('k', { id: 'u', name: 'X', salt: 's', hash: 'h', createdAt: 1 });
    blob.get = async () => {
      throw new Error('Failed to fetch blob: 500 Internal Server Error');
    };
    await expect(store.readUser('k')).rejects.toThrow('500');
  });
});
