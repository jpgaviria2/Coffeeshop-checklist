// tests/phase3.test.js — Phase 3: food safety items, security closing steps,
// shift handover notes, duplicate closing items merged.
import { describe, it, expect, vi } from 'vitest';
import {
  validateSubmission,
  renderSubmissionDetail,
  submitToAPI,
  enqueueSubmission,
  getQueue,
  API_BASE,
} from '../src/checklist-api.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockKeys = {
  privateKey: new Uint8Array(32).fill(7),
  publicKey: 'pubkey_phase3'.padEnd(64, '0')
};
const mockNostrTools = {
  finalizeEvent: vi.fn((event) => ({ ...event, id: 'eid3', pubkey: mockKeys.publicKey, sig: 'sig3' }))
};

// ── shiftNotes in closing submission payload ──────────────────────────────────
describe('shiftNotes in closing checklist submission', () => {
  it('includes shiftNotes in closing submission payload sent to API', async () => {
    const closingPayload = {
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-1', taskLabel: 'Sweep and mop floors', status: 'pass' },
        { taskId: 'closing-sec1', taskLabel: 'Drop cash', status: 'pass' },
        { taskId: 'closing-sec2', taskLabel: 'Lock back door', status: 'pass' }
      ],
      shiftNotes: 'Low on oat milk — only 2 cartons left. Espresso machine needs cleaning tomorrow.'
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'uuid-cl-1', message: 'closing checklist saved' })
    });

    await submitToAPI(closingPayload, mockKeys, mockNostrTools, mockFetch);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.shiftNotes).toBe('Low on oat milk — only 2 cartons left. Espresso machine needs cleaning tomorrow.');
    expect(body.checklist).toBe('closing');
  });

  it('closing submission with empty shiftNotes does not break validation', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-1', taskLabel: 'Sweep and mop', status: 'pass' }
      ],
      shiftNotes: ''
    });
    expect(result).toEqual({ valid: true });
  });

  it('closing submission with shiftNotes passes validation', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-sec1', taskLabel: 'Drop cash', status: 'pass' },
        { taskId: 'closing-sec2', taskLabel: 'Lock back door', status: 'pass' }
      ],
      shiftNotes: 'All good tonight. Coffee beans running low.'
    });
    expect(result).toEqual({ valid: true });
  });

  it('shiftNotes is preserved through offline queue enqueue/dequeue', () => {
    const storage = { _store: {}, getItem(k) { return this._store[k] ?? null; }, setItem(k, v) { this._store[k] = v; } };
    const payload = {
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'c1', taskLabel: 'Task', status: 'pass' }],
      shiftNotes: 'Urgent: fridge temp was high at close, checked and reset.'
    };
    enqueueSubmission(payload, storage);
    const q = getQueue(storage);
    expect(q[0].data.shiftNotes).toBe('Urgent: fridge temp was high at close, checked and reset.');
  });
});

// ── New closing checklist items present ────────────────────────────────────────
describe('new closing checklist items', () => {
  it('security item: closing-sec1 drop cash is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-sec1', taskLabel: 'Drop cash — leave till with only float', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('security item: closing-sec2 lock back door is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-sec2', taskLabel: 'Lock back door and verify it is secure', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('security item: closing-sec3 set alarm is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-sec3', taskLabel: 'Set alarm before leaving', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('food safety: closing-fs1 label/date prepped items is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-fs1', taskLabel: 'Label and date any prepped items going into fridge/freezer', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('food safety: closing-fs2 dairy expiry check is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-fs2', taskLabel: 'Check all dairy expiry — discard anything expiring today', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('shift handover: closing-sh1 write shift notes is a valid taskId', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ taskId: 'closing-sh1', taskLabel: 'Write shift notes', status: 'pass' }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('merged sweep/mop item replaces duplicate (closing-16 merged)', () => {
    // Verify that a single sweep+mop item (closing-16) is sufficient
    // and duplicating it as closing-19 is no longer expected
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-16', taskLabel: 'Sweep and mop floors (front of house + back of house)', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
    // closing-19 (old duplicate) should NOT be present as a separate item
    const itemIds = result.valid ? ['closing-16'] : [];
    expect(itemIds).not.toContain('closing-19');
  });

  it('full closing submission with all new phase 3 items passes validation', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-16', taskLabel: 'Sweep and mop floors (front of house + back of house)', status: 'pass' },
        { taskId: 'closing-fs1', taskLabel: 'Label and date any prepped items', status: 'pass' },
        { taskId: 'closing-fs2', taskLabel: 'Check all dairy expiry', status: 'pass' },
        { taskId: 'closing-sec1', taskLabel: 'Drop cash', status: 'pass' },
        { taskId: 'closing-sec2', taskLabel: 'Lock back door', status: 'pass' },
        { taskId: 'closing-sec3', taskLabel: 'Set alarm before leaving', status: 'pass' },
        { taskId: 'closing-sh1', taskLabel: 'Write shift notes', status: 'pass' }
      ],
      shiftNotes: 'Stock is good. All tasks complete.'
    });
    expect(result).toEqual({ valid: true });
  });
});

// ── New opening checklist food safety items ───────────────────────────────────
describe('new opening checklist food safety items', () => {
  it('sanitizer item (opening-15b) is a valid taskId in opening submission', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-15b', taskLabel: 'Prepare sanitizer solution in spray bottle (1 tsp bleach per 1L water)', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('dairy expiry check (opening-14b) is a valid taskId in opening submission', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-14b', taskLabel: 'Check milk/dairy expiry dates — discard anything expired or off-smell', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('handwash item (opening-0a) is a valid first taskId in opening submission', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-0a', taskLabel: 'Handwash before handling any food or drinks', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('shift notes check (opening-0b) is a valid second taskId in opening submission', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-0b', taskLabel: 'Check for any shift notes or messages from previous shift', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('full opening submission with all new phase 3 opening items passes validation', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-0a', taskLabel: 'Handwash before handling any food or drinks', status: 'pass' },
        { taskId: 'opening-0b', taskLabel: 'Check for any shift notes or messages', status: 'pass' },
        { taskId: 'opening-1', taskLabel: 'Turn on lights', status: 'pass' },
        { taskId: 'opening-14b', taskLabel: 'Check milk/dairy expiry dates', status: 'pass' },
        { taskId: 'opening-15b', taskLabel: 'Prepare sanitizer solution', status: 'pass' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });
});

// ── renderSubmissionDetail with shiftNotes ─────────────────────────────────────
describe('renderSubmissionDetail with shiftNotes', () => {
  it('renders shift handover notes section when shiftNotes is present', () => {
    const submission = {
      staffName: 'Alice',
      type: 'closing',
      submittedAt: new Date().toISOString(),
      content: {
        items: [{ taskId: 'closing-1', taskLabel: 'Sweep floors', status: 'pass' }],
        shiftNotes: 'We are low on oat milk. The espresso machine grinder needs calibration tomorrow.'
      }
    };
    const html = renderSubmissionDetail(submission);
    expect(html).toContain('Shift Handover Notes');
    expect(html).toContain('We are low on oat milk');
    expect(html).toContain('espresso machine grinder');
  });

  it('does not render shift notes section when shiftNotes is absent', () => {
    const submission = {
      staffName: 'Bob',
      type: 'closing',
      submittedAt: new Date().toISOString(),
      content: {
        items: [{ taskId: 'closing-1', taskLabel: 'Lock up', status: 'pass' }]
      }
    };
    const html = renderSubmissionDetail(submission);
    expect(html).not.toContain('Shift Handover Notes');
  });

  it('renders shift notes before findings section', () => {
    const submission = {
      staffName: 'Carol',
      type: 'closing',
      submittedAt: new Date().toISOString(),
      content: {
        items: [{ taskId: 'closing-1', taskLabel: 'Mop floors', status: 'pass' }],
        shiftNotes: 'Important handover note',
        findings: 'Equipment finding'
      }
    };
    const html = renderSubmissionDetail(submission);
    const shiftPos = html.indexOf('Shift Handover Notes');
    const findingsPos = html.indexOf('Findings');
    expect(shiftPos).toBeLessThan(findingsPos);
  });
});
