// tests/validation.test.js — Submission form validation
import { describe, it, expect } from 'vitest';
import { validateSubmission } from '../src/checklist-api.js';

describe('validateSubmission', () => {
  it('rejects null', () => {
    expect(validateSubmission(null)).toEqual({ valid: false, error: 'Invalid submission data' });
  });

  it('rejects non-object', () => {
    expect(validateSubmission('string')).toEqual({ valid: false, error: 'Invalid submission data' });
  });

  it('rejects invalid checklist type', () => {
    const result = validateSubmission({
      checklist: 'lunch',
      timestamp: new Date().toISOString(),
      items: [{ task: 'a', completed: true }]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid checklist type');
  });

  it('rejects missing timestamp', () => {
    const result = validateSubmission({
      checklist: 'opening',
      items: [{ task: 'a', completed: true }]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing timestamp');
  });

  it('rejects empty items array for opening', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: []
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No checklist items provided');
  });

  // ── Old checkbox format ────────────────────────────────────────────────────

  it('rejects zero completed tasks (old format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [{ task: 'task1', completed: false }]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least one task');
  });

  it('accepts valid opening checklist (old format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { task: 'Turn on lights', completed: true },
        { task: 'Check espresso', completed: false }
      ],
      completionRate: '1/2'
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts valid closing checklist (old format)', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [{ task: 'Lock up', completed: true }]
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts inventory checklist without items', () => {
    const result = validateSubmission({
      checklist: 'inventory',
      timestamp: new Date().toISOString(),
      inventory: { milk: { milk35: 5 } }
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects inventory checklist missing timestamp', () => {
    const result = validateSubmission({
      checklist: 'inventory',
      inventory: {}
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing timestamp');
  });

  // ── New pass/fail format ───────────────────────────────────────────────────

  it('accepts valid opening checklist (new pass/fail format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-1', taskLabel: 'Turn on lights', status: 'pass', comment: null, photoData: null },
        { taskId: 'opening-2', taskLabel: 'Calibrate espresso', status: 'pass', comment: null, photoData: null }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts valid closing checklist with one fail + evidence (new format)', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-1', taskLabel: 'Mop floors', status: 'pass' },
        { taskId: 'closing-2', taskLabel: 'Clean espresso machine', status: 'fail', comment: 'Grouphead blocked, needs deep clean', photoData: null }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts fail item with photo evidence and no comment (new format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-7', taskLabel: 'Calibrate espresso', status: 'fail', comment: null, photoData: 'data:image/jpeg;base64,/9j/abc' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects fail item with no comment and no photo (new format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-7', taskLabel: 'Calibrate espresso', status: 'fail', comment: null, photoData: null }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('failed item');
    expect(result.error).toContain('comment or photo');
  });

  it('rejects fail item with empty comment and no photo (new format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-7', taskLabel: 'Task', status: 'fail', comment: '', photoData: null }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('failed item');
  });

  it('rejects all-skipped items (new format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-1', taskLabel: 'Turn on lights', status: 'skipped' },
        { taskId: 'opening-2', taskLabel: 'Brew coffee', status: 'skipped' }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least one task');
  });

  it('rejects invalid status value (new format)', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'opening-1', taskLabel: 'Turn on lights', status: 'maybe' }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid item status');
  });

  it('reports count of fail items missing evidence (new format)', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-1', taskLabel: 'Mop', status: 'fail', comment: null, photoData: null },
        { taskId: 'closing-2', taskLabel: 'Clean oven', status: 'fail', comment: null, photoData: null },
        { taskId: 'closing-3', taskLabel: 'Restock', status: 'pass' }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2');
  });

  it('accepts mixed pass/fail/skipped with evidence on fail items (new format)', () => {
    const result = validateSubmission({
      checklist: 'closing',
      timestamp: new Date().toISOString(),
      items: [
        { taskId: 'closing-1', taskLabel: 'Mop', status: 'pass' },
        { taskId: 'closing-2', taskLabel: 'Broken drain', status: 'fail', comment: 'Drain blocked', photoData: null },
        { taskId: 'closing-3', taskLabel: 'Restock', status: 'skipped' }
      ]
    });
    expect(result).toEqual({ valid: true });
  });
});
