// src/checklist-api.js — Pure/testable API functions for checklist submissions
// No DOM dependencies. Import this in app.js and in tests.

export const API_BASE = 'https://api.trailscoffee.com';
export const DASHBOARD_API_KEY = '794ee28efee105ed74601cf0d8b7da9bd7776ac2bc5cd8a87174f04b703dab64';
export const OFFLINE_QUEUE_KEY = 'submission_queue';
export const MAX_RETRY_COUNT = 3;

/**
 * Build a NIP-98 HTTP auth header.
 * @param {string} method  HTTP method (GET, POST, …)
 * @param {string} url     Full URL being requested
 * @param {{ privateKey: Uint8Array }} keys  Nostr key pair
 * @param {object} NostrTools  NostrTools global (finalizeEvent)
 * @returns {string} Authorization header value
 */
export async function buildNostrAuthHeader(method, url, keys, NostrTools) {
  if (!keys) throw new Error('Not logged in');
  const authEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method]
    ],
    content: ''
  };
  const signed = NostrTools.finalizeEvent(authEvent, keys.privateKey);
  return 'Nostr ' + btoa(JSON.stringify(signed));
}

/**
 * POST a checklist submission to the API.
 * @returns {Promise<{success: boolean, id: string, message: string}>}
 */
export async function submitToAPI(contentData, keys, NostrTools, fetchFn = fetch) {
  const url = `${API_BASE}/api/v1/submissions`;
  const authHeader = await buildNostrAuthHeader('POST', url, keys, NostrTools);
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify(contentData)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Submit with offline fallback — queues to localStorage on failure.
 * @throws {Error} with user-friendly message about local save
 */
export async function submitWithFallback(contentData, keys, NostrTools, fetchFn = fetch, storage = localStorage) {
  try {
    return await submitToAPI(contentData, keys, NostrTools, fetchFn);
  } catch (err) {
    console.warn('API submission failed, queuing locally:', err.message);
    enqueueSubmission(contentData, storage);
    throw new Error('Saved locally — will sync when connection is restored');
  }
}

/**
 * Add a submission to the offline queue.
 */
export function enqueueSubmission(contentData, storage = localStorage) {
  const queue = getQueue(storage);
  queue.push({
    data: contentData,
    queuedAt: new Date().toISOString(),
    retryCount: 0
  });
  storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get the current offline queue.
 */
export function getQueue(storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Retry all queued submissions. Returns count of successfully synced items.
 */
export async function retryQueuedSubmissions(keys, NostrTools, fetchFn = fetch, storage = localStorage) {
  const queue = getQueue(storage);
  if (queue.length === 0) return 0;
  const remaining = [];
  let synced = 0;
  for (const item of queue) {
    if (item.retryCount >= MAX_RETRY_COUNT) continue; // Drop after 3 failures
    try {
      await submitToAPI(item.data, keys, NostrTools, fetchFn);
      synced++;
      console.log('✅ Queued submission synced:', item.data.checklist);
    } catch (err) {
      item.retryCount++;
      remaining.push(item);
    }
  }
  storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return synced;
}

/**
 * Fetch submissions list for the admin view.
 * @param {object} params - { limit, offset, date, type, failuresOnly }
 * @returns {Promise<{submissions: Array, count: number}>}
 */
export async function fetchAdminSubmissions(params = {}, keys, NostrTools, fetchFn = fetch) {
  const qs = new URLSearchParams({
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    ...(params.date ? { date: params.date } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.failuresOnly ? { failures_only: '1' } : {})
  }).toString();
  const url = `${API_BASE}/api/v1/submissions?${qs}`;
  const authHeader = await buildNostrAuthHeader('GET', url, keys, NostrTools);
  const res = await fetchFn(url, { headers: { Authorization: authHeader } });
  if (res.status === 403) throw new Error('FORBIDDEN'); // Not a manager
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch a single submission by ID.
 * @returns {Promise<object>}
 */
export async function fetchSubmission(id, keys, NostrTools, fetchFn = fetch) {
  const url = `${API_BASE}/api/v1/submissions/${id}`;
  const authHeader = await buildNostrAuthHeader('GET', url, keys, NostrTools);
  const res = await fetchFn(url, { headers: { Authorization: authHeader } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * General authenticated GET helper for read endpoints.
 */
export async function apiFetch(path, fetchFn = fetch) {
  const url = `${API_BASE}${path}`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${DASHBOARD_API_KEY}` }
  });
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

/**
 * Compute pass/fail rate from a submissions items array.
 * Supports both old checkbox format and new pass/fail format.
 * @param {Array} items
 * @returns {{ passed: number, failed: number, skipped: number, total: number, actedOn: number, rate: string|null } | null}
 */
export function computePassRate(items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const first = items[0];
  const isNewFormat = first && ('status' in first || 'taskId' in first);

  if (isNewFormat) {
    const passed = items.filter(i => i.status === 'pass').length;
    const failed = items.filter(i => i.status === 'fail').length;
    const skipped = items.filter(i => i.status === 'skipped').length;
    const actedOn = passed + failed;
    const rate = actedOn > 0 ? `${passed}/${actedOn}` : null;
    return { passed, failed, skipped, total: items.length, actedOn, rate };
  }

  // Old checkbox format
  const completed = items.filter(i => i.completed).length;
  return {
    passed: completed,
    failed: 0,
    skipped: 0,
    total: items.length,
    actedOn: completed,
    rate: `${completed}/${items.length}`
  };
}

/**
 * Get number of FAIL items from a submission object.
 * @param {object} submission
 * @returns {number}
 */
export function getFailCount(submission) {
  const items = submission?.content?.items;
  if (!Array.isArray(items)) return 0;
  return items.filter(i => i.status === 'fail').length;
}

/**
 * Validate a checklist submission payload before sending.
 * Supports both old checkbox format and new pass/fail format.
 * Returns { valid: boolean, error?: string }
 */
export function validateSubmission(contentData) {
  if (!contentData || typeof contentData !== 'object') {
    return { valid: false, error: 'Invalid submission data' };
  }
  const validTypes = ['opening', 'closing', 'inventory'];
  if (!validTypes.includes(contentData.checklist)) {
    return { valid: false, error: `Invalid checklist type: ${contentData.checklist}` };
  }
  if (!contentData.timestamp) {
    return { valid: false, error: 'Missing timestamp' };
  }
  if (contentData.checklist !== 'inventory') {
    if (!Array.isArray(contentData.items) || contentData.items.length === 0) {
      return { valid: false, error: 'No checklist items provided' };
    }

    const firstItem = contentData.items[0];
    const isNewFormat = firstItem && ('status' in firstItem || 'taskId' in firstItem);

    if (isNewFormat) {
      // New pass/fail format
      const validStatuses = ['pass', 'fail', 'skipped'];
      const invalidItems = contentData.items.filter(i => !validStatuses.includes(i.status));
      if (invalidItems.length > 0) {
        return { valid: false, error: `Invalid item status: ${invalidItems[0].status}` };
      }
      const actedOn = contentData.items.filter(i => i.status !== 'skipped');
      if (actedOn.length === 0) {
        return { valid: false, error: 'Please complete at least one task before submitting' };
      }
      // FAIL items must have comment or photo evidence
      const failItems = contentData.items.filter(i => i.status === 'fail');
      const missingEvidence = failItems.filter(i => !i.comment && !i.photoData);
      if (missingEvidence.length > 0) {
        return { valid: false, error: `${missingEvidence.length} failed item(s) require a comment or photo` };
      }
    } else {
      // Old checkbox format
      const completedCount = contentData.items.filter(i => i.completed).length;
      if (completedCount === 0) {
        return { valid: false, error: 'Please complete at least one task before submitting' };
      }
    }
  }
  return { valid: true };
}

/**
 * Render admin submissions as an HTML table string.
 * Supports pass rate display and failure highlighting.
 * Pure function — no DOM manipulation, returns HTML string for setting innerHTML.
 * @param {Array} submissions
 * @param {boolean} showFailuresOnly - if true, filter to submissions with failures
 */
export function renderAdminTable(submissions, showFailuresOnly = false) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return '<p style="color:#999;text-align:center;padding:20px;">No submissions found.</p>';
  }

  let filtered = showFailuresOnly
    ? submissions.filter(s => getFailCount(s) > 0)
    : submissions;

  if (showFailuresOnly && filtered.length === 0) {
    return '<p style="color:#999;text-align:center;padding:20px;">No submissions with failures found.</p>';
  }

  const icons = { opening: '🌅', closing: '🌙', inventory: '📦' };

  const rows = filtered.map(s => {
    const hasFail = getFailCount(s) > 0;
    const failCount = getFailCount(s);
    const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) : '—';
    const type = s.type || '?';
    const icon = icons[type] || '📋';
    const staff = s.staffName || (s.staffPubkey ? s.staffPubkey.slice(0, 8) + '…' : '—');

    // Compute pass rate display
    let passRateDisplay = '—';
    if (type === 'inventory') {
      passRateDisplay = '📦 inventory';
    } else if (s.content?.items) {
      const rate = computePassRate(s.content.items);
      if (rate) {
        if (rate.failed > 0) {
          passRateDisplay = `${rate.passed}/${rate.actedOn} ✅ · ${rate.failed} ❌`;
        } else {
          passRateDisplay = rate.rate || s.content?.completionRate || '—';
        }
      }
    } else if (s.content?.completionRate) {
      passRateDisplay = s.content.completionRate;
    }

    const failBadge = hasFail
      ? `<span style="display:inline-block;background:#dc3545;color:white;border-radius:10px;padding:2px 7px;font-size:11px;margin-left:5px;font-weight:600;">⚠️ ${failCount} FAIL</span>`
      : '';

    const rowStyle = hasFail
      ? 'background:#fff5f5;border-left:4px solid #dc3545;'
      : '';

    return `<tr style="${rowStyle}" data-id="${s.id || ''}">
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${date}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;">${staff}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${icon} ${type}${failBadge}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${passRateDisplay}</td>
    </tr>`;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Date</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Staff</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Type</th>
          <th style="padding:8px 10px;text-align:center;font-size:12px;color:#555;text-transform:uppercase;">Pass Rate</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Render detail view of a single submission, highlighting FAIL items.
 * Returns HTML string.
 * @param {object} submission
 */
export function renderSubmissionDetail(submission) {
  if (!submission) return '<p style="color:#c00;">Submission not found.</p>';

  const content = submission.content || {};
  const items = content.items || [];
  const findings = content.findings || '';
  const findingsPhoto = content.findingsPhoto || null;
  const shiftNotes = content.shiftNotes || '';

  const rate = computePassRate(items);
  const rateSummary = rate
    ? `<span style="font-weight:600;color:#155724;">${rate.passed} passed</span>${rate.failed > 0 ? ` · <span style="font-weight:600;color:#721c24;">${rate.failed} failed</span>` : ''}${rate.skipped > 0 ? ` · ${rate.skipped} skipped` : ''} of ${rate.total} tasks`
    : '';

  let itemsHtml = '';
  if (items.length > 0) {
    itemsHtml = items.map(item => {
      const isNewFmt = 'status' in item;
      const label = item.taskLabel || item.task || '(unknown)';
      let statusBadge = '';
      let rowStyle = 'padding:8px 12px;border-bottom:1px solid #eee;';

      if (isNewFmt) {
        if (item.status === 'pass') {
          statusBadge = '<span style="color:#28a745;font-weight:700;">✅ PASS</span>';
        } else if (item.status === 'fail') {
          statusBadge = '<span style="color:#dc3545;font-weight:700;">❌ FAIL</span>';
          rowStyle += 'background:#fff5f5;border-left:3px solid #dc3545;';
        } else {
          statusBadge = '<span style="color:#999;">— skipped</span>';
        }
      } else {
        statusBadge = item.completed ? '<span style="color:#28a745;">✅</span>' : '<span style="color:#999;">☐</span>';
      }

      let evidenceHtml = '';
      if (item.comment) {
        evidenceHtml += `<div style="margin-top:4px;font-size:12px;color:#555;background:#f8f9fa;padding:6px;border-radius:6px;">💬 ${item.comment}</div>`;
      }
      if (item.photoData) {
        evidenceHtml += `<div style="margin-top:6px;"><img src="${item.photoData}" alt="Evidence photo" style="max-width:200px;border-radius:6px;border:1px solid #ddd;"></div>`;
      }

      return `<div style="${rowStyle}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <span style="font-size:13px;color:#333;flex:1;">${label}</span>
          <span style="margin-left:10px;white-space:nowrap;">${statusBadge}</span>
        </div>
        ${evidenceHtml}
      </div>`;
    }).join('');
  }

  let shiftNotesHtml = '';
  if (shiftNotes) {
    shiftNotesHtml = `<div style="margin-top:16px;border-top:2px solid #e0e0e0;padding-top:12px;">
      <div style="font-weight:600;color:#555;margin-bottom:8px;">📋 Shift Handover Notes</div>
      <div style="font-size:13px;color:#333;background:#fff9e6;padding:10px;border-radius:8px;border-left:3px solid #f0a500;">${shiftNotes}</div>
    </div>`;
  }

  let findingsHtml = '';
  if (findings || findingsPhoto) {
    findingsHtml = `<div style="margin-top:16px;border-top:2px solid #e0e0e0;padding-top:12px;">
      <div style="font-weight:600;color:#555;margin-bottom:8px;">📝 Findings & Suggestions</div>
      ${findings ? `<div style="font-size:13px;color:#333;background:#f8f9fa;padding:10px;border-radius:8px;">${findings}</div>` : ''}
      ${findingsPhoto ? `<div style="margin-top:8px;"><img src="${findingsPhoto}" alt="Findings photo" style="max-width:250px;border-radius:8px;border:1px solid #ddd;"></div>` : ''}
    </div>`;
  }

  return `
    <div style="font-size:14px;">
      ${rateSummary ? `<div style="background:#e8f5e9;padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;">${rateSummary}</div>` : ''}
      <div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        ${itemsHtml || '<p style="padding:12px;color:#999;">No item data available.</p>'}
      </div>
      ${shiftNotesHtml}
      ${findingsHtml}
    </div>`;
}
