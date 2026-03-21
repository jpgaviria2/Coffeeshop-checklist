// tests/admin.test.js — Admin view rendering and fetchAdminSubmissions
import { describe, it, expect, vi } from 'vitest';
import {
  renderAdminTable,
  fetchAdminSubmissions,
  API_BASE,
} from '../src/checklist-api.js';

// ── Mock data ──────────────────────────────────────────────────────────────────
const mockKeys = {
  privateKey: new Uint8Array(32).fill(3),
  publicKey: 'managerkey'.padEnd(64, '0')
};

const mockNostrTools = {
  finalizeEvent: vi.fn((event) => ({ ...event, id: 'eid', pubkey: mockKeys.publicKey, sig: 'sig' }))
};

const sampleSubmissions = [
  {
    id: 'uuid-1',
    staffName: 'Charlene',
    staffPubkey: '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f',
    type: 'opening',
    submittedAt: '2026-03-21T08:30:00.000Z',
    content: { completionRate: '18/20' }
  },
  {
    id: 'uuid-2',
    staffName: 'Ruby',
    staffPubkey: 'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2',
    type: 'closing',
    submittedAt: '2026-03-21T16:00:00.000Z',
    content: { completionRate: '22/22' }
  },
  {
    id: 'uuid-3',
    staffName: 'Aziza',
    staffPubkey: '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f',
    type: 'inventory',
    submittedAt: '2026-03-21T12:00:00.000Z',
    content: {}
  }
];

// ── renderAdminTable ───────────────────────────────────────────────────────────
describe('renderAdminTable', () => {
  it('renders a message for empty array', () => {
    const html = renderAdminTable([]);
    expect(html).toContain('No submissions found');
  });

  it('renders a message for null', () => {
    const html = renderAdminTable(null);
    expect(html).toContain('No submissions found');
  });

  it('renders a table with correct row count', () => {
    const html = renderAdminTable(sampleSubmissions);
    expect(html).toContain('<table');
    // 3 data rows
    expect((html.match(/<tr>/g) || []).length).toBe(3);
  });

  it('renders staff names', () => {
    const html = renderAdminTable(sampleSubmissions);
    expect(html).toContain('Charlene');
    expect(html).toContain('Ruby');
    expect(html).toContain('Aziza');
  });

  it('renders completion rates', () => {
    const html = renderAdminTable(sampleSubmissions);
    expect(html).toContain('18/20');
    expect(html).toContain('22/22');
  });

  it('renders checklist type icons', () => {
    const html = renderAdminTable(sampleSubmissions);
    expect(html).toContain('🌅'); // opening
    expect(html).toContain('🌙'); // closing
    expect(html).toContain('📦'); // inventory
  });

  it('truncates pubkey for unnamed staff', () => {
    const html = renderAdminTable([{
      id: 'x',
      staffName: null,
      staffPubkey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      type: 'opening',
      submittedAt: '2026-03-21T08:00:00.000Z',
      content: {}
    }]);
    expect(html).toContain('abcdef12'); // First 8 chars
    expect(html).toContain('…');
  });

  it('shows "inventory" label for inventory type with no completionRate', () => {
    const html = renderAdminTable([{
      id: 'x', staffName: 'Test', staffPubkey: 'pk'.padEnd(64, '0'),
      type: 'inventory', submittedAt: '2026-03-21T12:00:00Z', content: {}
    }]);
    expect(html).toContain('inventory');
  });

  it('renders table headers', () => {
    const html = renderAdminTable(sampleSubmissions);
    expect(html).toMatch(/Date/i);
    expect(html).toMatch(/Staff/i);
    expect(html).toMatch(/Type/i);
    expect(html).toMatch(/Completion/i);
  });
});

// ── fetchSubmission (single) ───────────────────────────────────────────────────
import { fetchSubmission, apiFetch, DASHBOARD_API_KEY } from '../src/checklist-api.js';

describe('fetchSubmission', () => {
  it('calls the correct URL with submission ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => sampleSubmissions[0]
    });
    await fetchSubmission('uuid-1', mockKeys, mockNostrTools, mockFetch);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`${API_BASE}/api/v1/submissions/uuid-1`);
  });

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ error: 'Not found' })
    });
    await expect(fetchSubmission('bad-id', mockKeys, mockNostrTools, mockFetch))
      .rejects.toThrow('HTTP 404');
  });

  it('returns submission data on success', async () => {
    const expected = sampleSubmissions[0];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => expected
    });
    const result = await fetchSubmission('uuid-1', mockKeys, mockNostrTools, mockFetch);
    expect(result).toEqual(expected);
  });
});

describe('apiFetch', () => {
  it('calls correct URL with Bearer auth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: 'ok' })
    });
    await apiFetch('/api/bakery/forecast/today', mockFetch);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain(`${API_BASE}/api/bakery/forecast/today`);
    expect(opts.headers.Authorization).toContain('Bearer');
  });

  it('throws with path info on non-OK', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(apiFetch('/api/missing', mockFetch))
      .rejects.toThrow('returned 404');
  });
});

// ── fetchAdminSubmissions ──────────────────────────────────────────────────────
describe('fetchAdminSubmissions', () => {
  it('calls the correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ submissions: sampleSubmissions, count: 3 })
    });
    await fetchAdminSubmissions({}, mockKeys, mockNostrTools, mockFetch);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`${API_BASE}/api/v1/submissions`);
  });

  it('includes limit and offset query params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ submissions: [], count: 0 })
    });
    await fetchAdminSubmissions({ limit: 10, offset: 20 }, mockKeys, mockNostrTools, mockFetch);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=20');
  });

  it('includes date filter when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ submissions: [], count: 0 })
    });
    await fetchAdminSubmissions({ date: '2026-03-21' }, mockKeys, mockNostrTools, mockFetch);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('date=2026-03-21');
  });

  it('throws FORBIDDEN on 403', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: 'Manager access required' })
    });
    await expect(fetchAdminSubmissions({}, mockKeys, mockNostrTools, mockFetch))
      .rejects.toThrow('FORBIDDEN');
  });

  it('throws on other HTTP errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: 'Server error' })
    });
    await expect(fetchAdminSubmissions({}, mockKeys, mockNostrTools, mockFetch))
      .rejects.toThrow('HTTP 500');
  });

  it('returns submissions array on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ submissions: sampleSubmissions, count: 3 })
    });
    const result = await fetchAdminSubmissions({}, mockKeys, mockNostrTools, mockFetch);
    expect(result.submissions).toHaveLength(3);
    expect(result.count).toBe(3);
  });
});
