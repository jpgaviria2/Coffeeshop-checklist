// tests/autosave.test.js — Phase 4: autosave & draft resume functions
// Focused tests for saveDraft, loadDraft, clearDraft, and buildSubmissionSummary
import { describe, it, expect, beforeEach } from 'vitest';
import {
  draftKey,
  saveDraft,
  loadDraftFromStorage,
  clearDraftFromStorage,
  buildSubmissionSummary,
  DRAFT_MAX_AGE_MS,
} from '../src/checklist-api.js';

// ── In-memory localStorage mock ───────────────────────────────────────────────
function makeStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => Object.keys(store).forEach(k => delete store[k]),
    _store: store
  };
}

// ─── saveDraft ────────────────────────────────────────────────────────────────
describe('saveDraft', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('saves a draft with passed items', () => {
    const items = [{ taskId: 'opening-1', status: 'pass', comment: '' }];
    const result = saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(true);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.type).toBe('opening');
    expect(stored.items[0].taskId).toBe('opening-1');
  });

  it('saves a draft with failed items', () => {
    const items = [{ taskId: 'opening-15', status: 'fail', comment: 'low quats' }];
    const result = saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(true);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.items[0].status).toBe('fail');
    expect(stored.items[0].comment).toBe('low quats');
  });

  it('does not save when all items are skipped and no findings/notes', () => {
    const items = [{ taskId: 'opening-1', status: 'skipped', comment: '' }];
    const result = saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(false);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
  });

  it('saves when only findings are present', () => {
    const result = saveDraft('opening', { items: [], findings: 'Oven dirty', shiftNotes: '' }, storage);
    expect(result).toBe(true);
  });

  it('saves when only shiftNotes are present', () => {
    const result = saveDraft('closing', { items: [], findings: '', shiftNotes: 'Low oat milk' }, storage);
    expect(result).toBe(true);
  });

  it('includes savedAt ISO timestamp', () => {
    const items = [{ taskId: 'opening-1', status: 'pass', comment: '' }];
    saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(new Date(stored.savedAt).getTime()).not.toBeNaN();
  });

  it('overwrites previous draft of same type', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }], findings: 'first', shiftNotes: ''
    }, storage);
    saveDraft('opening', {
      items: [{ taskId: 'opening-2', status: 'fail', comment: 'broken' }], findings: 'second', shiftNotes: ''
    }, storage);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.findings).toBe('second');
    expect(stored.items[0].taskId).toBe('opening-2');
  });
});

// ─── loadDraft (loadDraftFromStorage) ─────────────────────────────────────────
describe('loadDraft', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns null when no draft exists', () => {
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('returns a valid fresh draft', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    const draft = loadDraftFromStorage('opening', storage);
    expect(draft).not.toBeNull();
    expect(draft.type).toBe('opening');
  });

  it('returns null for expired draft (>24h) and removes it', () => {
    const oldDate = new Date(Date.now() - DRAFT_MAX_AGE_MS - 5000).toISOString();
    storage.setItem(draftKey('opening'), JSON.stringify({
      type: 'opening', savedAt: oldDate,
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }));
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
    expect(storage.getItem(draftKey('opening'))).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    storage.setItem(draftKey('closing'), '{ bad json }}}');
    expect(loadDraftFromStorage('closing', storage)).toBeNull();
  });

  it('returns null when savedAt is missing', () => {
    storage.setItem(draftKey('opening'), JSON.stringify({ type: 'opening', items: [] }));
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('keeps separate drafts for different types', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }], findings: '', shiftNotes: ''
    }, storage);
    saveDraft('closing', {
      items: [], findings: 'Closing note', shiftNotes: ''
    }, storage);
    const opening = loadDraftFromStorage('opening', storage);
    const closing = loadDraftFromStorage('closing', storage);
    expect(opening.items[0].taskId).toBe('opening-1');
    expect(closing.findings).toBe('Closing note');
  });
});

// ─── clearDraft (clearDraftFromStorage) ───────────────────────────────────────
describe('clearDraft', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('removes an existing draft', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }], findings: '', shiftNotes: ''
    }, storage);
    clearDraftFromStorage('opening', storage);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
  });

  it('does not throw when draft does not exist', () => {
    expect(() => clearDraftFromStorage('opening', storage)).not.toThrow();
  });

  it('only clears the specified type, leaves others intact', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }], findings: '', shiftNotes: ''
    }, storage);
    saveDraft('closing', {
      items: [], findings: 'Keep this', shiftNotes: ''
    }, storage);
    clearDraftFromStorage('opening', storage);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
    expect(storage.getItem(draftKey('closing'))).not.toBeNull();
  });

  it('draft is unrecoverable after clear', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }], findings: '', shiftNotes: ''
    }, storage);
    clearDraftFromStorage('opening', storage);
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });
});

// ─── showSubmissionResults (via buildSubmissionSummary) ───────────────────────
describe('showSubmissionResults / buildSubmissionSummary', () => {
  const ts = '2026-03-21T17:00:00.000Z';

  it('calculates pass/fail/total correctly', () => {
    const data = {
      checklist: 'opening', timestamp: ts,
      items: [
        { taskId: 'opening-1', taskLabel: 'Lights', status: 'pass' },
        { taskId: 'opening-2', taskLabel: 'Pastries', status: 'fail', comment: 'still frozen' },
        { taskId: 'opening-3', taskLabel: 'Coffee', status: 'pass' },
        { taskId: 'opening-4', taskLabel: 'Grinder', status: 'skipped' }
      ]
    };
    const summary = buildSubmissionSummary(data, 'Dayana');
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.total).toBe(4);
  });

  it('failedItems has correct labels and comments', () => {
    const data = {
      checklist: 'opening', timestamp: ts,
      items: [
        { taskId: 'opening-15', taskLabel: 'Quats test', status: 'fail', comment: 'low ppm' },
        { taskId: 'opening-15b', taskLabel: 'Sanitizer', status: 'fail', comment: '' }
      ]
    };
    const summary = buildSubmissionSummary(data, 'Charlene');
    expect(summary.failedItems).toHaveLength(2);
    expect(summary.failedItems[0].taskLabel).toBe('Quats test');
    expect(summary.failedItems[0].comment).toBe('low ppm');
  });

  it('returns empty failedItems when all pass', () => {
    const data = {
      checklist: 'closing', timestamp: ts,
      items: [
        { taskId: 'closing-1', taskLabel: 'Sweep', status: 'pass' },
        { taskId: 'closing-2', taskLabel: 'Mop', status: 'pass' }
      ]
    };
    const summary = buildSubmissionSummary(data, 'jP');
    expect(summary.failedItems).toHaveLength(0);
    expect(summary.passed).toBe(2);
  });

  it('includes findings in summary output', () => {
    const data = {
      checklist: 'opening', timestamp: ts,
      items: [{ taskId: 'opening-1', status: 'pass' }],
      findings: 'Fridge was warm'
    };
    const summary = buildSubmissionSummary(data, 'jP');
    expect(summary.findings).toBe('Fridge was warm');
  });

  it('defaults staffName to "Staff"', () => {
    const data = { checklist: 'opening', timestamp: ts, items: [] };
    expect(buildSubmissionSummary(data).staffName).toBe('Staff');
  });

  it('handles all-skipped submission gracefully', () => {
    const data = {
      checklist: 'opening', timestamp: ts,
      items: [
        { taskId: 'opening-1', status: 'skipped' },
        { taskId: 'opening-2', status: 'skipped' }
      ]
    };
    const summary = buildSubmissionSummary(data, 'Staff');
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.failedItems).toHaveLength(0);
  });

  it('handles empty items array', () => {
    const data = { checklist: 'inventory', timestamp: ts, items: [] };
    const summary = buildSubmissionSummary(data, 'Staff');
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it('uses timestamp from contentData', () => {
    const data = { checklist: 'opening', timestamp: ts, items: [] };
    const summary = buildSubmissionSummary(data, 'jP');
    expect(summary.submittedAt).toBe(ts);
  });
});
