// tests/nip98.test.js — NIP-98 HTTP Auth header generation
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildNostrAuthHeader,
} from '../src/checklist-api.js';

// ── Mock nostr-tools ──────────────────────────────────────────────────────────
const mockPrivateKey = new Uint8Array(32).fill(1);
const mockPublicKey = 'abcdef0123456789'.padEnd(64, '0');

const mockNostrTools = {
  finalizeEvent: vi.fn((event, privateKey) => ({
    ...event,
    id: 'mockeventid123',
    pubkey: mockPublicKey,
    sig: 'mocksig'
  }))
};

const mockKeys = { privateKey: mockPrivateKey, publicKey: mockPublicKey };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildNostrAuthHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
  });

  it('throws if keys is null', async () => {
    await expect(buildNostrAuthHeader('POST', 'https://example.com', null, mockNostrTools))
      .rejects.toThrow('Not logged in');
  });

  it('returns a "Nostr " prefixed string', async () => {
    const header = await buildNostrAuthHeader('POST', 'https://api.trailscoffee.com/api/v1/submissions', mockKeys, mockNostrTools);
    expect(header).toMatch(/^Nostr /);
  });

  it('encodes a valid base64 JSON event', async () => {
    const header = await buildNostrAuthHeader('POST', 'https://api.trailscoffee.com/api/v1/submissions', mockKeys, mockNostrTools);
    const base64 = header.slice(6);
    const decoded = JSON.parse(atob(base64));
    expect(decoded.kind).toBe(27235);
    expect(decoded.content).toBe('');
  });

  it('sets the "u" tag to the provided URL', async () => {
    const url = 'https://api.trailscoffee.com/api/v1/submissions';
    const header = await buildNostrAuthHeader('POST', url, mockKeys, mockNostrTools);
    const decoded = JSON.parse(atob(header.slice(6)));
    const uTag = decoded.tags.find(t => t[0] === 'u');
    expect(uTag).toBeDefined();
    expect(uTag[1]).toBe(url);
  });

  it('sets the "method" tag to the provided HTTP method', async () => {
    const header = await buildNostrAuthHeader('GET', 'https://api.trailscoffee.com/api/v1/submissions', mockKeys, mockNostrTools);
    const decoded = JSON.parse(atob(header.slice(6)));
    const methodTag = decoded.tags.find(t => t[0] === 'method');
    expect(methodTag).toBeDefined();
    expect(methodTag[1]).toBe('GET');
  });

  it('uses current unix timestamp', async () => {
    const before = Math.floor(Date.now() / 1000);
    const header = await buildNostrAuthHeader('POST', 'https://example.com', mockKeys, mockNostrTools);
    const decoded = JSON.parse(atob(header.slice(6)));
    expect(decoded.created_at).toBeGreaterThanOrEqual(before);
    expect(decoded.created_at).toBeLessThanOrEqual(before + 2);
  });

  it('calls finalizeEvent with the keys privateKey', async () => {
    await buildNostrAuthHeader('POST', 'https://example.com', mockKeys, mockNostrTools);
    expect(mockNostrTools.finalizeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 27235 }),
      mockPrivateKey
    );
  });
});
