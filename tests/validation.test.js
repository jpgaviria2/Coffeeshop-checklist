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

  it('rejects zero completed tasks', () => {
    const result = validateSubmission({
      checklist: 'opening',
      timestamp: new Date().toISOString(),
      items: [{ task: 'task1', completed: false }]
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least one task');
  });

  it('accepts valid opening checklist', () => {
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

  it('accepts valid closing checklist', () => {
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
});
