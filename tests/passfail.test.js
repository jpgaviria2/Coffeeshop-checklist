// tests/passfail.test.js — Pass/Fail UX logic: computePassRate, getFailCount, renderSubmissionDetail
import { describe, it, expect } from 'vitest';
import {
  computePassRate,
  getFailCount,
  renderSubmissionDetail,
  renderAdminTable,
} from '../src/checklist-api.js';

// ── computePassRate ───────────────────────────────────────────────────────────
describe('computePassRate', () => {
  it('returns null for empty array', () => {
    expect(computePassRate([])).toBeNull();
  });

  it('returns null for null', () => {
    expect(computePassRate(null)).toBeNull();
  });

  it('computes rate for new pass/fail format — all pass', () => {
    const items = [
      { taskId: 'a', status: 'pass' },
      { taskId: 'b', status: 'pass' },
      { taskId: 'c', status: 'pass' }
    ];
    const result = computePassRate(items);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.actedOn).toBe(3);
    expect(result.total).toBe(3);
    expect(result.rate).toBe('3/3');
  });

  it('computes rate for new format — mix of pass/fail/skipped', () => {
    const items = [
      { taskId: 'a', status: 'pass' },
      { taskId: 'b', status: 'fail' },
      { taskId: 'c', status: 'skipped' },
      { taskId: 'd', status: 'pass' }
    ];
    const result = computePassRate(items);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.actedOn).toBe(3); // pass + fail
    expect(result.total).toBe(4);
    expect(result.rate).toBe('2/3');
  });

  it('returns null rate when all skipped', () => {
    const items = [
      { taskId: 'a', status: 'skipped' },
      { taskId: 'b', status: 'skipped' }
    ];
    const result = computePassRate(items);
    expect(result.actedOn).toBe(0);
    expect(result.rate).toBeNull();
  });

  it('computes rate for old checkbox format', () => {
    const items = [
      { task: 'Turn on lights', completed: true },
      { task: 'Calibrate espresso', completed: true },
      { task: 'Check fridge temps', completed: false }
    ];
    const result = computePassRate(items);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(3);
    expect(result.rate).toBe('2/3');
  });

  it('handles old format all completed', () => {
    const items = [
      { task: 'a', completed: true },
      { task: 'b', completed: true }
    ];
    expect(computePassRate(items).rate).toBe('2/2');
  });

  it('handles new format with taskId but status missing gracefully via old path if no status', () => {
    // Edge: old-format-looking item with completed
    const items = [{ task: 'a', completed: false }];
    const result = computePassRate(items);
    expect(result.passed).toBe(0);
    expect(result.total).toBe(1);
  });
});

// ── getFailCount ─────────────────────────────────────────────────────────────
describe('getFailCount', () => {
  it('returns 0 for submission with no items', () => {
    expect(getFailCount({ content: {} })).toBe(0);
  });

  it('returns 0 for null submission', () => {
    expect(getFailCount(null)).toBe(0);
  });

  it('returns 0 for old-format items (no status field)', () => {
    const sub = { content: { items: [{ task: 'a', completed: true }] } };
    expect(getFailCount(sub)).toBe(0);
  });

  it('returns correct count for new-format items', () => {
    const sub = {
      content: {
        items: [
          { taskId: 'a', status: 'pass' },
          { taskId: 'b', status: 'fail' },
          { taskId: 'c', status: 'fail' },
          { taskId: 'd', status: 'skipped' }
        ]
      }
    };
    expect(getFailCount(sub)).toBe(2);
  });

  it('returns 0 when all pass', () => {
    const sub = {
      content: {
        items: [
          { taskId: 'a', status: 'pass' },
          { taskId: 'b', status: 'pass' }
        ]
      }
    };
    expect(getFailCount(sub)).toBe(0);
  });
});

// ── renderAdminTable with failure highlighting ────────────────────────────────
describe('renderAdminTable — failure highlighting', () => {
  const subWithFail = {
    id: 'uuid-fail',
    staffName: 'Charlene',
    staffPubkey: '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f',
    type: 'opening',
    submittedAt: '2026-03-21T08:30:00.000Z',
    content: {
      items: [
        { taskId: 'o-1', taskLabel: 'Lights', status: 'pass' },
        { taskId: 'o-7', taskLabel: 'Calibrate espresso', status: 'fail', comment: 'Shot timing off', photoData: null }
      ]
    }
  };

  const subAllPass = {
    id: 'uuid-pass',
    staffName: 'Ruby',
    staffPubkey: 'e9422'.padEnd(64, '0'),
    type: 'closing',
    submittedAt: '2026-03-21T16:00:00.000Z',
    content: {
      items: [
        { taskId: 'c-1', taskLabel: 'Mop', status: 'pass' },
        { taskId: 'c-2', taskLabel: 'Lock door', status: 'pass' }
      ]
    }
  };

  it('highlights rows with failures in red background', () => {
    const html = renderAdminTable([subWithFail, subAllPass]);
    // The failing row should have failure styling
    expect(html).toContain('fff5f5'); // fail background color
    expect(html).toContain('dc3545'); // fail border/badge color
  });

  it('shows fail badge with count', () => {
    const html = renderAdminTable([subWithFail]);
    expect(html).toContain('FAIL');
    expect(html).toContain('1');
  });

  it('shows pass rate as "X/Y ✅ · Z ❌" for failed submissions', () => {
    const html = renderAdminTable([subWithFail]);
    expect(html).toContain('1/2');
    expect(html).toContain('❌');
  });

  it('shows clean pass rate for all-pass submissions', () => {
    const html = renderAdminTable([subAllPass]);
    expect(html).toContain('2/2');
    // Should not have red fail styling
    expect(html).not.toContain('fff5f5');
  });

  it('filters to failures only when showFailuresOnly=true', () => {
    const html = renderAdminTable([subWithFail, subAllPass], true);
    expect(html).toContain('Charlene');
    expect(html).not.toContain('Ruby');
  });

  it('returns failures-not-found message when no failures and filter is on', () => {
    const html = renderAdminTable([subAllPass], true);
    expect(html).toContain('No submissions with failures found');
  });

  it('renders empty message for empty array regardless of filter', () => {
    expect(renderAdminTable([], false)).toContain('No submissions found');
    expect(renderAdminTable([], true)).toContain('No submissions found');
  });

  it('renders Pass Rate header (updated from Completion)', () => {
    const html = renderAdminTable([subAllPass]);
    expect(html).toMatch(/Pass Rate/i);
  });
});

// ── renderSubmissionDetail ────────────────────────────────────────────────────
describe('renderSubmissionDetail', () => {
  it('returns error message for null submission', () => {
    const html = renderSubmissionDetail(null);
    expect(html).toContain('not found');
  });

  it('shows pass/fail summary counts', () => {
    const sub = {
      staffName: 'Charlene',
      type: 'opening',
      submittedAt: '2026-03-21T08:30:00.000Z',
      content: {
        items: [
          { taskId: 'o-1', taskLabel: 'Lights', status: 'pass' },
          { taskId: 'o-2', taskLabel: 'Espresso', status: 'fail', comment: 'Off', photoData: null },
          { taskId: 'o-3', taskLabel: 'Coffee', status: 'skipped' }
        ]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('1 passed');
    expect(html).toContain('1 failed');
    expect(html).toContain('1 skipped');
  });

  it('shows PASS badge for pass items', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-1', taskLabel: 'Lights on', status: 'pass' }]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('✅ PASS');
  });

  it('shows FAIL badge for fail items', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-7', taskLabel: 'Calibrate', status: 'fail', comment: 'Broken', photoData: null }]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('❌ FAIL');
  });

  it('shows comment for fail items', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-7', taskLabel: 'Calibrate', status: 'fail', comment: 'Grouphead blocked', photoData: null }]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('Grouphead blocked');
  });

  it('shows photo img tag when photoData is present', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-7', taskLabel: 'Task', status: 'fail', comment: 'See photo', photoData: 'data:image/jpeg;base64,/9j/' }]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('<img');
    expect(html).toContain('data:image/jpeg;base64');
  });

  it('shows findings section when findings present', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-1', taskLabel: 'Task', status: 'pass' }],
        findings: 'The steam wand is leaking slightly'
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('Findings');
    expect(html).toContain('steam wand is leaking');
  });

  it('shows findings photo when findingsPhoto present', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-1', taskLabel: 'Task', status: 'pass' }],
        findings: 'See photo',
        findingsPhoto: 'data:image/jpeg;base64,/9j/abc'
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('data:image/jpeg;base64,/9j/abc');
  });

  it('hides findings section when no findings', () => {
    const sub = {
      content: {
        items: [{ taskId: 'o-1', taskLabel: 'Task', status: 'pass' }]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).not.toContain('Findings');
  });

  it('handles old checkbox format correctly', () => {
    const sub = {
      content: {
        items: [
          { task: 'Turn on lights', completed: true },
          { task: 'Brew coffee', completed: false }
        ]
      }
    };
    const html = renderSubmissionDetail(sub);
    expect(html).toContain('Turn on lights');
    expect(html).toContain('✅');
    expect(html).toContain('Brew coffee');
  });
});
