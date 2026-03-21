// tests/submission.test.js — Submission POST and offline queue
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitToAPI,
  submitWithFallback,
  enqueueSubmission,
  getQueue,
  retryQueuedSubmissions,
  OFFLINE_QUEUE_KEY,
  MAX_RETRY_COUNT,
  API_BASE,
} from '../src/checklist-api.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockKeys = {
  privateKey: new Uint8Array(32).fill(2),
  publicKey: 'pubkey123'.padEnd(64, '0')
};

const mockNostrTools = {
  finalizeEvent: vi.fn((event) => ({ ...event, id: 'eid', pubkey: mockKeys.publicKey, sig: 'sig' }))
};

const sampleSubmission = {
  checklist: 'opening',
  timestamp: new Date().toISOString(),
  items: [{ task: 'Turn on lights', completed: true }],
  completionRate: '1/1'
};

// In-memory localStorage mock
function makeStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// ── submitToAPI ────────────────────────────────────────────────────────────────
describe('submitToAPI', () => {
  it('POSTs to the correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'uuid-1', message: 'opening checklist saved' })
    });
    await submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/submissions`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('includes Content-Type: application/json', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, id: 'x', message: 'ok' })
    });
    await submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('includes NIP-98 Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, id: 'x', message: 'ok' })
    });
    await submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch);
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toMatch(/^Nostr /);
  });

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });
    await expect(submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch))
      .rejects.toThrow('Unauthorized');
  });

  it('returns the API response body', async () => {
    const expected = { success: true, id: 'uuid-abc', message: 'opening checklist saved' };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => expected
    });
    const result = await submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch);
    expect(result).toEqual(expected);
  });

  it('throws on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitToAPI(sampleSubmission, mockKeys, mockNostrTools, mockFetch))
      .rejects.toThrow('Failed to fetch');
  });
});

// ── Offline Queue ─────────────────────────────────────────────────────────────
describe('enqueueSubmission / getQueue', () => {
  it('adds an item to the queue', () => {
    const storage = makeStorage();
    enqueueSubmission(sampleSubmission, storage);
    const q = getQueue(storage);
    expect(q).toHaveLength(1);
    expect(q[0].data).toEqual(sampleSubmission);
    expect(q[0].retryCount).toBe(0);
    expect(q[0].queuedAt).toBeDefined();
  });

  it('adds multiple items to the queue', () => {
    const storage = makeStorage();
    enqueueSubmission(sampleSubmission, storage);
    enqueueSubmission({ ...sampleSubmission, checklist: 'closing' }, storage);
    expect(getQueue(storage)).toHaveLength(2);
  });

  it('getQueue returns empty array when nothing queued', () => {
    const storage = makeStorage();
    expect(getQueue(storage)).toEqual([]);
  });

  it('getQueue returns empty array on corrupt data', () => {
    const storage = makeStorage();
    storage.setItem(OFFLINE_QUEUE_KEY, 'not-json{{');
    expect(getQueue(storage)).toEqual([]);
  });
});

// ── submitWithFallback ─────────────────────────────────────────────────────────
describe('submitWithFallback', () => {
  it('returns API result on success', async () => {
    const storage = makeStorage();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, id: 'x', message: 'ok' })
    });
    const result = await submitWithFallback(sampleSubmission, mockKeys, mockNostrTools, mockFetch, storage);
    expect(result.success).toBe(true);
    expect(getQueue(storage)).toHaveLength(0); // Nothing queued
  });

  it('queues submission on API failure', async () => {
    const storage = makeStorage();
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Network offline'));
    await expect(
      submitWithFallback(sampleSubmission, mockKeys, mockNostrTools, mockFetch, storage)
    ).rejects.toThrow('Saved locally');
    expect(getQueue(storage)).toHaveLength(1);
    expect(getQueue(storage)[0].data).toEqual(sampleSubmission);
  });

  it('throws user-friendly message on fallback', async () => {
    const storage = makeStorage();
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    await expect(
      submitWithFallback(sampleSubmission, mockKeys, mockNostrTools, mockFetch, storage)
    ).rejects.toThrow('Saved locally — will sync when connection is restored');
  });
});

// ── retryQueuedSubmissions ────────────────────────────────────────────────────
describe('retryQueuedSubmissions', () => {
  it('returns 0 when queue is empty', async () => {
    const storage = makeStorage();
    const mockFetch = vi.fn();
    const synced = await retryQueuedSubmissions(mockKeys, mockNostrTools, mockFetch, storage);
    expect(synced).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('syncs queued item on success', async () => {
    const storage = makeStorage();
    enqueueSubmission(sampleSubmission, storage);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, id: 'x', message: 'ok' })
    });
    const synced = await retryQueuedSubmissions(mockKeys, mockNostrTools, mockFetch, storage);
    expect(synced).toBe(1);
    expect(getQueue(storage)).toHaveLength(0);
  });

  it('increments retryCount on failure and keeps item in queue', async () => {
    const storage = makeStorage();
    enqueueSubmission(sampleSubmission, storage);
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await retryQueuedSubmissions(mockKeys, mockNostrTools, mockFetch, storage);
    const q = getQueue(storage);
    expect(q).toHaveLength(1);
    expect(q[0].retryCount).toBe(1);
  });

  it('drops items that have exceeded MAX_RETRY_COUNT', async () => {
    const storage = makeStorage();
    // Manually insert an item with retryCount at max
    storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([{
      data: sampleSubmission,
      queuedAt: new Date().toISOString(),
      retryCount: MAX_RETRY_COUNT
    }]));
    const mockFetch = vi.fn();
    await retryQueuedSubmissions(mockKeys, mockNostrTools, mockFetch, storage);
    expect(getQueue(storage)).toHaveLength(0); // Dropped
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('syncs one item and keeps failed items', async () => {
    const storage = makeStorage();
    enqueueSubmission(sampleSubmission, storage);
    enqueueSubmission({ ...sampleSubmission, checklist: 'closing' }, storage);

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, id: 'x', message: 'ok' }) });
      }
      return Promise.reject(new Error('offline'));
    });

    const synced = await retryQueuedSubmissions(mockKeys, mockNostrTools, mockFetch, storage);
    expect(synced).toBe(1);
    expect(getQueue(storage)).toHaveLength(1);
  });
});
