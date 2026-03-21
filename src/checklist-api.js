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
 * @param {object} params - { limit, offset, date, type }
 * @returns {Promise<{submissions: Array, count: number}>}
 */
export async function fetchAdminSubmissions(params = {}, keys, NostrTools, fetchFn = fetch) {
  const qs = new URLSearchParams({
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    ...(params.date ? { date: params.date } : {}),
    ...(params.type ? { type: params.type } : {})
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
 * Validate a checklist submission payload before sending.
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
    const completedCount = contentData.items.filter(i => i.completed).length;
    if (completedCount === 0) {
      return { valid: false, error: 'Please complete at least one task before submitting' };
    }
  }
  return { valid: true };
}

/**
 * Render admin submissions as an HTML table string.
 * Pure function — no DOM manipulation, returns HTML string for setting innerHTML.
 */
export function renderAdminTable(submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return '<p style="color:#999;text-align:center;padding:20px;">No submissions found.</p>';
  }
  const icons = { opening: '🌅', closing: '🌙', inventory: '📦' };
  const rows = submissions.map(s => {
    const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) : '—';
    const type = s.type || '?';
    const icon = icons[type] || '📋';
    const staff = s.staffName || (s.staffPubkey ? s.staffPubkey.slice(0, 8) + '…' : '—');
    const rate = s.content?.completionRate || (s.type === 'inventory' ? '📦 inventory' : '—');
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${date}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;">${staff}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${icon} ${type}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${rate}</td>
    </tr>`;
  }).join('');
  return `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Date</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Staff</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;text-transform:uppercase;">Type</th>
          <th style="padding:8px 10px;text-align:center;font-size:12px;color:#555;text-transform:uppercase;">Completion</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
