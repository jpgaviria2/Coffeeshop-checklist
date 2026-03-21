// tests/phase4.test.js — Phase 4: autosave, draft resume, post-submit summary
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
    _store: store
  };
}

// ─── draftKey ────────────────────────────────────────────────────────────────
describe('draftKey', () => {
  it('returns correct key for opening', () => {
    expect(draftKey('opening')).toBe('checklist_draft_opening');
  });
  it('returns correct key for closing', () => {
    expect(draftKey('closing')).toBe('checklist_draft_closing');
  });
  it('returns correct key for inventory', () => {
    expect(draftKey('inventory')).toBe('checklist_draft_inventory');
  });
});

// ─── saveDraft ───────────────────────────────────────────────────────────────
describe('saveDraft', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns false and does not save if no interactions', () => {
    const result = saveDraft('opening', { items: [], findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(false);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
  });

  it('saves draft when user has marked at least one item', () => {
    const items = [
      { taskId: 'opening-1', status: 'pass', comment: '' }
    ];
    const result = saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(true);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.type).toBe('opening');
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].taskId).toBe('opening-1');
    expect(stored.savedAt).toBeTruthy();
  });

  it('saves draft when only findings are filled', () => {
    const result = saveDraft('closing', { items: [], findings: 'Fridge temp was high', shiftNotes: '' }, storage);
    expect(result).toBe(true);
    const stored = JSON.parse(storage.getItem(draftKey('closing')));
    expect(stored.findings).toBe('Fridge temp was high');
  });

  it('saves draft when only shiftNotes are filled', () => {
    const result = saveDraft('closing', { items: [], findings: '', shiftNotes: 'Low on oat milk' }, storage);
    expect(result).toBe(true);
    const stored = JSON.parse(storage.getItem(draftKey('closing')));
    expect(stored.shiftNotes).toBe('Low on oat milk');
  });

  it('does not save skipped-only items', () => {
    const items = [
      { taskId: 'opening-1', status: 'skipped', comment: '' },
      { taskId: 'opening-2', status: 'skipped', comment: '' }
    ];
    const result = saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    expect(result).toBe(false);
  });

  it('overwrites existing draft', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    saveDraft('opening', {
      items: [{ taskId: 'opening-2', status: 'fail', comment: 'broken' }],
      findings: 'update', shiftNotes: ''
    }, storage);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.items[0].taskId).toBe('opening-2');
    expect(stored.findings).toBe('update');
  });

  it('saves all item fields: taskId, status, comment', () => {
    const items = [
      { taskId: 'opening-15', status: 'fail', comment: 'low quats reading' }
    ];
    saveDraft('opening', { items, findings: '', shiftNotes: '' }, storage);
    const stored = JSON.parse(storage.getItem(draftKey('opening')));
    expect(stored.items[0].comment).toBe('low quats reading');
    expect(stored.items[0].status).toBe('fail');
  });
});

// ─── loadDraftFromStorage ─────────────────────────────────────────────────────
describe('loadDraftFromStorage', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns null when no draft exists', () => {
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('returns draft when it exists and is fresh', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    const draft = loadDraftFromStorage('opening', storage);
    expect(draft).not.toBeNull();
    expect(draft.type).toBe('opening');
    expect(draft.items[0].taskId).toBe('opening-1');
  });

  it('returns null and removes expired draft (>24h old)', () => {
    const oldDate = new Date(Date.now() - DRAFT_MAX_AGE_MS - 1000).toISOString();
    storage.setItem(draftKey('closing'), JSON.stringify({
      type: 'closing',
      savedAt: oldDate,
      items: [{ taskId: 'closing-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }));
    const draft = loadDraftFromStorage('closing', storage);
    expect(draft).toBeNull();
    // Should be removed from storage
    expect(storage.getItem(draftKey('closing'))).toBeNull();
  });

  it('returns null if JSON is corrupt', () => {
    storage.setItem(draftKey('opening'), 'not-valid-json{{{');
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('returns null if savedAt is missing', () => {
    storage.setItem(draftKey('opening'), JSON.stringify({ type: 'opening', items: [] }));
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('returns draft for different types independently', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    saveDraft('closing', {
      items: [{ taskId: 'closing-1', status: 'fail', comment: 'dirty' }],
      findings: '', shiftNotes: ''
    }, storage);
    const openingDraft = loadDraftFromStorage('opening', storage);
    const closingDraft = loadDraftFromStorage('closing', storage);
    expect(openingDraft.items[0].taskId).toBe('opening-1');
    expect(closingDraft.items[0].taskId).toBe('closing-1');
  });
});

// ─── clearDraftFromStorage ────────────────────────────────────────────────────
describe('clearDraftFromStorage', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('removes draft from storage', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    clearDraftFromStorage('opening', storage);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
  });

  it('does not throw when clearing non-existent draft', () => {
    expect(() => clearDraftFromStorage('opening', storage)).not.toThrow();
  });

  it('only clears the specified type', () => {
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    saveDraft('closing', {
      items: [], findings: 'note', shiftNotes: ''
    }, storage);
    clearDraftFromStorage('opening', storage);
    expect(storage.getItem(draftKey('opening'))).toBeNull();
    expect(storage.getItem(draftKey('closing'))).not.toBeNull();
  });
});

// ─── buildSubmissionSummary ───────────────────────────────────────────────────
describe('buildSubmissionSummary', () => {
  const ts = '2026-03-21T10:00:00.000Z';

  it('computes pass/fail counts correctly', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [
        { taskId: 'opening-1', taskLabel: 'Turn on lights', status: 'pass' },
        { taskId: 'opening-2', taskLabel: 'Pastries', status: 'fail', comment: 'still frozen' },
        { taskId: 'opening-3', taskLabel: 'Brew coffee', status: 'pass' },
        { taskId: 'opening-4', taskLabel: 'Calibrate', status: 'skipped' }
      ]
    };
    const summary = buildSubmissionSummary(contentData, 'Dayana');
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.total).toBe(4);
    expect(summary.staffName).toBe('Dayana');
    expect(summary.type).toBe('opening');
  });

  it('failedItems contains only failed items with their labels', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [
        { taskId: 'opening-1', taskLabel: 'Lights', status: 'pass' },
        { taskId: 'opening-15', taskLabel: 'Quats test', status: 'fail', comment: 'low ppm' },
        { taskId: 'opening-15b', taskLabel: 'Sanitizer spray', status: 'fail', comment: 'no vinegar' }
      ]
    };
    const summary = buildSubmissionSummary(contentData, 'Charlene');
    expect(summary.failedItems).toHaveLength(2);
    expect(summary.failedItems[0].taskLabel).toBe('Quats test');
    expect(summary.failedItems[1].comment).toBe('no vinegar');
  });

  it('returns zero counts for all-skipped submission', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [
        { taskId: 'opening-1', status: 'skipped' },
        { taskId: 'opening-2', status: 'skipped' }
      ]
    };
    const summary = buildSubmissionSummary(contentData);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.total).toBe(2);
    expect(summary.failedItems).toHaveLength(0);
  });

  it('returns empty failedItems when all tasks pass', () => {
    const contentData = {
      checklist: 'closing',
      timestamp: ts,
      items: [
        { taskId: 'closing-1', taskLabel: 'Sweep floors', status: 'pass' },
        { taskId: 'closing-2', taskLabel: 'Mop', status: 'pass' }
      ]
    };
    const summary = buildSubmissionSummary(contentData, 'jP');
    expect(summary.failedItems).toHaveLength(0);
    expect(summary.passed).toBe(2);
  });

  it('includes findings in summary', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [{ taskId: 'opening-1', status: 'pass' }],
      findings: 'Oven was dirty'
    };
    const summary = buildSubmissionSummary(contentData, 'jP');
    expect(summary.findings).toBe('Oven was dirty');
  });

  it('uses default staffName of "Staff" when not provided', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [{ taskId: 'opening-1', status: 'pass' }]
    };
    const summary = buildSubmissionSummary(contentData);
    expect(summary.staffName).toBe('Staff');
  });

  it('uses timestamp from contentData', () => {
    const contentData = {
      checklist: 'opening',
      timestamp: ts,
      items: [{ taskId: 'opening-1', status: 'pass' }]
    };
    const summary = buildSubmissionSummary(contentData, 'jP');
    expect(summary.submittedAt).toBe(ts);
  });

  it('handles empty items array', () => {
    const contentData = {
      checklist: 'inventory',
      timestamp: ts,
      items: []
    };
    const summary = buildSubmissionSummary(contentData, 'Staff');
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.failedItems).toHaveLength(0);
  });
});

// ─── Draft round-trip (save + load) ──────────────────────────────────────────
describe('Draft save/load round-trip', () => {
  it('saves and loads a complete opening draft', () => {
    const storage = makeStorage();
    const items = [
      { taskId: 'opening-0a', status: 'pass', comment: '' },
      { taskId: 'opening-0b', status: 'fail', comment: 'could not find whiteboard' },
      { taskId: 'opening-1', status: 'pass', comment: '' },
      { taskId: 'opening-2', status: 'skipped', comment: '' }
    ];
    saveDraft('opening', { items, findings: 'oven needs cleaning', shiftNotes: '' }, storage);
    const draft = loadDraftFromStorage('opening', storage);
    expect(draft.items).toHaveLength(4);
    expect(draft.items[1].comment).toBe('could not find whiteboard');
    expect(draft.findings).toBe('oven needs cleaning');
  });

  it('draft is cleared after successful submit', () => {
    const storage = makeStorage();
    saveDraft('opening', {
      items: [{ taskId: 'opening-1', status: 'pass', comment: '' }],
      findings: '', shiftNotes: ''
    }, storage);
    // Simulate post-submit clear
    clearDraftFromStorage('opening', storage);
    expect(loadDraftFromStorage('opening', storage)).toBeNull();
  });

  it('draft contains savedAt timestamp that can be formatted', () => {
    const storage = makeStorage();
    saveDraft('closing', {
      items: [], findings: 'low oat milk', shiftNotes: 'Handover note'
    }, storage);
    const draft = loadDraftFromStorage('closing', storage);
    const d = new Date(draft.savedAt);
    expect(isNaN(d.getTime())).toBe(false); // Valid date
  });
});
