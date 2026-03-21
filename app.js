// Nostr Checklist App - Mobile-friendly with direct nsec login
// Using global NostrTools from CDN
// Architecture: Nostr = AUTH ONLY. Submissions POST directly to trails-api (NIP-98).
// Offline queue: failed submissions stored in localStorage, retried on reconnect.

// Get local date string (YYYY-MM-DD) in Vancouver (Pacific) timezone.
// Using Intl.DateTimeFormat with 'en-CA' gives YYYY-MM-DD format directly.
// This avoids the UTC offset bug where toISOString() can return the wrong calendar
// date for Vancouver (e.g. 8 PM PDT = next day UTC).
function getVancouverDate(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(d);
}

let userKeys = null;
let currentChecklist = 'opening';
let currentWeekOffset = 0;

// Shop management pubkey — kept for reference
const SHOP_MGMT_PUBKEY = 'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2';

// API backend
const API_BASE = 'https://api.trailscoffee.com';

// ─── API Config ──────────────────────────────────────────────────────────────
// Dashboard API key — Bearer token for read-only GET /api/* endpoints.
// This key is safe to store here since this app is staff-only.
const DASHBOARD_API_KEY = '794ee28efee105ed74601cf0d8b7da9bd7776ac2bc5cd8a87174f04b703dab64';

// Manager pubkeys — can access admin view (submission history)
const MANAGER_PUBKEYS = new Set([
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP alt
    'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2', // JP shop mgmt
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayana
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b', // Dayana alt
]);

// Fetch helper with Bearer auth (for read endpoints)
async function apiFetch(path) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${DASHBOARD_API_KEY}` }
    });
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
    return res.json();
}

// NIP-98 HTTP Auth helper — signs a kind:27235 event to authorize the HTTP request
async function buildNostrAuthHeader(method, url) {
    if (!userKeys) throw new Error('Not logged in');
    const authEvent = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['u', url],
            ['method', method]
        ],
        content: ''
    };
    const signed = NostrTools.finalizeEvent(authEvent, userKeys.privateKey);
    return 'Nostr ' + btoa(JSON.stringify(signed));
}

// Submit a checklist to the local API backend (NIP-98 authenticated)
async function submitToAPI(contentData) {
    const url = `${API_BASE}/api/v1/submissions`;
    const authHeader = await buildNostrAuthHeader('POST', url);

    const response = await fetch(url, {
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

    return await response.json();
}

// Offline queue — store failed submissions locally, retry on reconnect
async function submitWithFallback(contentData) {
    try {
        return await submitToAPI(contentData);
    } catch (err) {
        console.warn('API submission failed, queuing locally:', err.message);
        const queue = JSON.parse(localStorage.getItem('submission_queue') || '[]');
        queue.push({
            data: contentData,
            queuedAt: new Date().toISOString(),
            retryCount: 0
        });
        localStorage.setItem('submission_queue', JSON.stringify(queue));
        throw new Error('Saved locally — will sync when connection is restored');
    }
}

// Retry any locally-queued submissions (called on page load)
async function retryQueuedSubmissions() {
    const queue = JSON.parse(localStorage.getItem('submission_queue') || '[]');
    if (queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
        if (item.retryCount >= 3) continue;
        try {
            await submitToAPI(item.data);
            console.log('✅ Queued submission synced:', item.data.checklist);
        } catch (err) {
            item.retryCount++;
            remaining.push(item);
        }
    }
    localStorage.setItem('submission_queue', JSON.stringify(remaining));
    if (queue.length !== remaining.length) loadTodaysActivity();
}

// Page load
window.addEventListener('DOMContentLoaded', () => {
    
    // Check for saved login (now using localStorage for persistence)
    if (typeof NostrTools === 'undefined') {
        console.error('NostrTools not loaded');
        showStatus('error', 'Error loading app. Please refresh the page.');
        return;
    }
    
    const savedNsec = localStorage.getItem('nostr_nsec');
    if (savedNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedNsec);
            userKeys = {
                privateKey: decoded.data,
                publicKey: NostrTools.getPublicKey(decoded.data)
            };
            localStorage.setItem('nostr_pubkey', userKeys.publicKey);
            showLoggedInState();
            // Retry any submissions that were queued while offline
            retryQueuedSubmissions();
        } catch (error) {
            // Don't delete the nsec on decode failure — could be a transient load error.
            // Just fall through to show the login form; the user can re-enter if truly bad.
            console.warn('Saved nsec failed to decode, showing login form:', error);
        }
    }
});

// Schedule functions (deprecated — Square Team app handles this now)
function changeWeek(direction) { return; }
function loadSchedule(weekOffset) { return; }

// Old schedule rendering and formatting functions removed

// Show logged in state
function showLoggedInState() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('quickActions').style.display = 'grid';
    // Show Square Team app notice
    const squareNotice = document.getElementById('squareNotice');
    if (squareNotice) squareNotice.style.display = 'block';
    // Show admin button for managers
    const adminBtn = document.getElementById('adminViewBtn');
    if (adminBtn && userKeys && MANAGER_PUBKEYS.has(userKeys.publicKey)) {
        adminBtn.style.display = 'block';
    }
    // Load today's activity
    loadTodaysActivity();
}

// ─── Admin View ──────────────────────────────────────────────────────────────

// Load and render the admin submission history view
async function loadAdminView() {
    const container = document.getElementById('adminSection');
    const tableContainer = document.getElementById('adminTableContainer');
    if (!container || !tableContainer) return;

    container.style.display = 'block';
    document.getElementById('quickActions').style.display = 'none';
    tableContainer.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Loading submissions…</p>';

    const failuresOnly = document.getElementById('adminFailuresOnly')?.checked || false;

    try {
        const limit = 50;
        const offset = parseInt(container.dataset.offset || 0);
        const qs = new URLSearchParams({
            limit, offset,
            ...(failuresOnly ? { failures_only: '1' } : {})
        }).toString();
        const url = `${API_BASE}/api/v1/submissions?${qs}`;
        const authHeader = await buildNostrAuthHeader('GET', url);
        const res = await fetch(url, { headers: { Authorization: authHeader } });

        if (res.status === 403) {
            tableContainer.innerHTML = '<p style="color:#c00;text-align:center;padding:20px;">Access denied — manager role required.</p>';
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const submissions = data.submissions || [];

        // Use renderAdminTable from checklist-api.js (imported via src/checklist-api.js)
        // For now inline the rendering here since app.js isn't a module
        if (submissions.length === 0) {
            tableContainer.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">No submissions found.</p>';
            return;
        }

        const icons = { opening: '🌅', closing: '🌙', inventory: '📦' };

        function getPassRateDisplay(s) {
            if (s.type === 'inventory') return '📦 inventory';
            const items = s.content?.items;
            if (Array.isArray(items) && items.length > 0) {
                const first = items[0];
                if ('status' in first) {
                    const passed = items.filter(i => i.status === 'pass').length;
                    const failed = items.filter(i => i.status === 'fail').length;
                    const actedOn = passed + failed;
                    if (failed > 0) return `${passed}/${actedOn} ✅ · ${failed} ❌`;
                    if (actedOn > 0) return `${passed}/${actedOn}`;
                }
            }
            return s.content?.completionRate || '—';
        }

        function getFailCountLocal(s) {
            const items = s.content?.items;
            if (!Array.isArray(items)) return 0;
            return items.filter(i => i.status === 'fail').length;
        }

        const rows = submissions.map(s => {
            const failCount = getFailCountLocal(s);
            const hasFail = failCount > 0;
            const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-CA', {
                timeZone: 'America/Vancouver',
                month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit'
            }) : '—';
            const icon = icons[s.type] || '📋';
            const staff = s.staffName || (s.staffPubkey ? s.staffPubkey.slice(0, 8) + '…' : '—');
            const rate = getPassRateDisplay(s);
            const failBadge = hasFail
                ? `<span style="display:inline-block;background:#dc3545;color:white;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:5px;font-weight:600;">⚠️ ${failCount}</span>`
                : '';
            const rowStyle = hasFail ? 'background:#fff5f5;border-left:3px solid #dc3545;' : '';
            return `<tr style="${rowStyle}" onclick="openAdminDetail('${s.id || ''}')" style="cursor:pointer;${rowStyle}">
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${date}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;">${staff}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${icon} ${s.type}${failBadge}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${rate}</td>
            </tr>`;
        }).join('');

        tableContainer.innerHTML = `
          <table style="width:100%;border-collapse:collapse;cursor:pointer;">
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

    } catch (err) {
        console.error('Admin view error:', err);
        tableContainer.innerHTML = `<p style="color:#c00;text-align:center;padding:20px;">Error loading submissions: ${err.message}</p>`;
    }
}

// Open a detailed submission view in a modal/overlay
async function openAdminDetail(submissionId) {
    if (!submissionId) return;

    // Simple inline detail overlay
    const existing = document.getElementById('adminDetailOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'adminDetailOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;overflow-y:auto;padding:16px;';

    overlay.innerHTML = `
        <div style="background:white;border-radius:14px;max-width:600px;margin:0 auto;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#764ba2,#667eea);color:white;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:15px;">📋 Submission Detail</span>
                <button onclick="document.getElementById('adminDetailOverlay').remove()" style="background:rgba(255,255,255,0.2);color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:13px;">✕ Close</button>
            </div>
            <div id="adminDetailContent" style="padding:16px;">
                <p style="color:#999;text-align:center;">Loading…</p>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    try {
        const url = `${API_BASE}/api/v1/submissions/${submissionId}`;
        const authHeader = await buildNostrAuthHeader('GET', url);
        const res = await fetch(url, { headers: { Authorization: authHeader } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const submission = await res.json();

        const content = submission.content || {};
        const items = content.items || [];
        const findings = content.findings || '';
        const findingsPhoto = content.findingsPhoto || null;

        // Compute pass rate
        let passedN = 0, failedN = 0, skippedN = 0;
        if (items.length > 0 && 'status' in items[0]) {
            passedN = items.filter(i => i.status === 'pass').length;
            failedN = items.filter(i => i.status === 'fail').length;
            skippedN = items.filter(i => i.status === 'skipped').length;
        } else {
            passedN = items.filter(i => i.completed).length;
        }

        let summaryHtml = '';
        if (passedN + failedN > 0) {
            summaryHtml = `<div style="background:#e8f5e9;padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;">
                <strong>${passedN} passed</strong>${failedN > 0 ? ` · <span style="color:#dc3545;font-weight:700;">${failedN} failed</span>` : ''}${skippedN > 0 ? ` · ${skippedN} skipped` : ''} of ${items.length} tasks
            </div>`;
        }

        let itemsHtml = items.map(item => {
            const isNew = 'status' in item;
            const label = item.taskLabel || item.task || '(unknown)';
            let badge = '', rowStyle = 'padding:8px 12px;border-bottom:1px solid #eee;';
            if (isNew) {
                if (item.status === 'pass') badge = '<span style="color:#28a745;font-weight:700;">✅ PASS</span>';
                else if (item.status === 'fail') { badge = '<span style="color:#dc3545;font-weight:700;">❌ FAIL</span>'; rowStyle += 'background:#fff5f5;border-left:3px solid #dc3545;'; }
                else badge = '<span style="color:#999;">— skipped</span>';
            } else {
                badge = item.completed ? '<span style="color:#28a745;">✅</span>' : '<span style="color:#999;">☐</span>';
            }
            let evidence = '';
            if (item.comment) evidence += `<div style="margin-top:4px;font-size:12px;color:#555;background:#f8f9fa;padding:6px;border-radius:6px;">💬 ${item.comment}</div>`;
            if (item.photoData) evidence += `<div style="margin-top:6px;"><img src="${item.photoData}" alt="Evidence" style="max-width:200px;border-radius:6px;border:1px solid #ddd;"></div>`;
            return `<div style="${rowStyle}"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><span style="font-size:13px;color:#333;flex:1;">${label}</span><span style="margin-left:10px;">${badge}</span></div>${evidence}</div>`;
        }).join('');

        let findingsHtml = '';
        if (findings || findingsPhoto) {
            findingsHtml = `<div style="margin-top:16px;border-top:2px solid #e0e0e0;padding-top:12px;">
                <div style="font-weight:600;color:#555;margin-bottom:8px;">📝 Findings &amp; Suggestions</div>
                ${findings ? `<div style="font-size:13px;color:#333;background:#f8f9fa;padding:10px;border-radius:8px;">${findings}</div>` : ''}
                ${findingsPhoto ? `<div style="margin-top:8px;"><img src="${findingsPhoto}" alt="Findings photo" style="max-width:250px;border-radius:8px;border:1px solid #ddd;"></div>` : ''}
            </div>`;
        }

        const staffName = submission.staffName || '?';
        const date = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('en-CA', {
            timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short'
        }) : '—';

        document.getElementById('adminDetailContent').innerHTML = `
            <div style="font-size:13px;color:#666;margin-bottom:12px;">
                <strong>${staffName}</strong> · ${submission.type} · ${date}
            </div>
            ${summaryHtml}
            <div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                ${itemsHtml || '<p style="padding:12px;color:#999;">No item data.</p>'}
            </div>
            ${findingsHtml}`;
    } catch (err) {
        document.getElementById('adminDetailContent').innerHTML = `<p style="color:#c00;">Error: ${err.message}</p>`;
    }
}

function closeAdminView() {
    const container = document.getElementById('adminSection');
    if (container) container.style.display = 'none';
    document.getElementById('quickActions').style.display = 'grid';
}

// Load and display today's submissions
async function loadTodaysActivity() {
    const container = document.getElementById('todaysActivity');
    if (!container || !userKeys) return;

    try {
        const todayStr = getVancouverDate();
        const url = `${API_BASE}/api/v1/submissions/mine?days=1`;
        const authHeader = await buildNostrAuthHeader('GET', url);

        const response = await fetch(url, { headers: { 'Authorization': authHeader } });

        if (!response.ok) {
            container.innerHTML = '<div style="padding:12px;color:#999;text-align:center;font-size:13px;">Could not load today\'s activity</div>';
            container.style.display = 'block';
            return;
        }

        const data = await response.json();
        const todaySubmissions = (data.submissions || []).filter(s => s.submittedAt && s.submittedAt.startsWith(todayStr));

        if (todaySubmissions.length === 0) {
            container.innerHTML = '<div style="padding:12px;color:#999;text-align:center;font-size:13px;">No submissions yet today</div>';
            container.style.display = 'block';
            return;
        }

        const icons = { opening: '🌅', closing: '🌙', inventory: '📦' };
        let html = '';

        for (const s of todaySubmissions) {
            const type = s.type;
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            const rate = s.content?.completionRate ? ` (${s.content.completionRate})` : '';
            const time = new Date(s.submittedAt);
            const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            html += `<div style="padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;">
                <span>${icons[type] || '📋'} ${label}${rate}</span>
                <span style="color:#28a745;font-size:13px;">${timeStr} ✅</span>
            </div>`;
        }

        container.innerHTML = html;
        container.style.display = 'block';
    } catch (err) {
        console.error('Error loading today\'s activity:', err);
        // Fail silently — not critical
    }
}

// Load dynamic freezer pulls for closing checklist (based on TOMORROW's forecast)
// Fetches from /api/bakery/forecast/tomorrow — the most important close task
async function loadClosingFreezerPulls() {
    const container = document.getElementById('closingFreezerPulls');
    if (!container) return;
    try {
        let fc;
        try {
            fc = await apiFetch('/api/bakery/forecast/tomorrow');
        } catch (apiErr) {
            console.warn('Bakery API unavailable, falling back to forecast.json:', apiErr.message);
            // Fallback: try local forecast.json
            try {
                const fcRes = await fetch('data/forecast.json');
                if (!fcRes.ok) throw new Error('forecast.json not available');
                const fcData = await fcRes.json();
                const tomorrowKey = getVancouverDate(1);
                const tomorrowFc = fcData.forecast?.[tomorrowKey];
                if (tomorrowFc) {
                    // Convert old format to new API format
                    const items = Object.entries(tomorrowFc.items || {})
                        .filter(([, v]) => v.predicted > 0)
                        .map(([name, v]) => ({ name, recommended: v.predicted, parQty: v.predicted }));
                    fc = {
                        date: tomorrowKey,
                        dayOfWeek: tomorrowFc.dayOfWeek || '',
                        weatherNote: '',
                        items
                    };
                }
            } catch (fbErr) {
                fc = null;
            }
        }

        if (!fc || !fc.items || fc.items.length === 0) {
            container.innerHTML = `<div style="background:linear-gradient(135deg,#FFF3E0,#FFE0B2);border:3px solid #FF8C00;border-radius:14px;padding:18px;margin-bottom:20px;box-shadow:0 4px 16px rgba(255,140,0,0.2);">
                <div style="font-weight:800;color:#7B3F00;font-size:19px;margin-bottom:8px;">🧊 Freezer Pull</div>
                <strong style="color:#8D4600;">⚠️ No forecast for tomorrow</strong> — check with manager for quantities.
            </div>`;
            return;
        }

        const tomorrowDay = fc.dayOfWeek || '';
        const [year, month, day] = (fc.date || getVancouverDate(1)).split('-').map(Number);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dateLabel = `${tomorrowDay}, ${monthNames[month-1]} ${day}`;

        const bakeable = new Set(['Cinnamon Bun', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Spinach Feta Croissant']);

        // Build card
        let html = `<div style="background:linear-gradient(135deg,#FFF3E0 0%,#FFE0B2 100%);border:3px solid #FF8C00;border-radius:14px;padding:18px 18px 14px;margin-bottom:20px;box-shadow:0 4px 20px rgba(255,140,0,0.28);">`;
        html += `<div style="font-weight:800;color:#7B3F00;font-size:20px;margin-bottom:4px;letter-spacing:-0.2px;">🌙 Tonight's Freezer Pull — ${dateLabel}</div>`;
        html += `<div style="font-size:12px;color:#8D4600;font-weight:500;margin-bottom:10px;">Pull tonight → thaw on rack overnight → bake in AM</div>`;

        if (fc.weatherNote) {
            html += `<div style="display:inline-block;background:rgba(255,255,255,0.55);border-radius:8px;padding:5px 12px;font-size:13px;color:#6D3400;font-weight:600;margin-bottom:14px;">${fc.weatherNote}</div>`;
        }

        const pulls = (fc.items || []).filter(item => item.recommended > 0);

        if (pulls.length === 0) {
            html += `<div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;color:#555;">✅ No freezer pulls needed for tomorrow.</div>`;
        } else {
            html += `<div style="display:flex;flex-direction:column;gap:6px;">`;
            for (const item of pulls) {
                const id = `freezer-pull-${item.name.replace(/\s+/g,'-')}`;
                const needsBaking = bakeable.has(item.name);
                const earlySelloutNote = item.earlySellout
                    ? `<span style="font-size:11px;background:#c0392b;color:white;padding:2px 7px;border-radius:10px;margin-left:8px;font-weight:700;vertical-align:middle;">⚠️ put out at 8am</span>`
                    : '';
                const bakeNote = needsBaking
                    ? `<span style="font-size:11px;background:#FF6B35;color:white;padding:2px 7px;border-radius:10px;margin-left:8px;font-weight:700;vertical-align:middle;">🔥 bake AM</span>`
                    : '';
                html += `<div class="checklist-item" style="background:rgba(255,255,255,0.72);border:1.5px solid rgba(255,140,0,0.35);margin-bottom:0;">
                    <input type="checkbox" id="${id}">
                    <label for="${id}" style="font-size:15px;font-weight:500;">Pull <strong style="font-size:16px;color:#5D2E00;">${item.recommended}</strong> × ${item.name}${bakeNote}${earlySelloutNote}</label>
                </div>`;
            }
            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    } catch (e) { console.error('Error loading freezer pulls:', e); }
}

// Load dynamic opening pastry info — Today's PAR forecast + Last night's defrost pull
async function loadOpeningPastryInfo() {
    const container = document.getElementById('openingPastryInfo');
    if (!container) return;
    try {
        let todayFc = null;
        let lastNightPull = null;

        // Try to fetch today's forecast from API
        try {
            const todayKey = getVancouverDate();
            todayFc = await apiFetch(`/api/bakery/forecast/${todayKey}`);
        } catch (apiErr) {
            console.warn('Bakery API unavailable for today forecast, falling back:', apiErr.message);
            // Fallback to local forecast.json
            try {
                const fcRes = await fetch('data/forecast.json');
                if (fcRes.ok) {
                    const fcData = await fcRes.json();
                    const todayKey = getVancouverDate();
                    const raw = fcData.forecast?.[todayKey];
                    if (raw) {
                        todayFc = {
                            items: Object.entries(raw.items || {}).map(([name, v]) => ({ name, recommended: v.predicted })),
                            weatherNote: ''
                        };
                    }
                }
            } catch (e) {}
        }

        // Fetch last night's defrost list (yesterday's forecast = today's thaw)
        try {
            const yesterdayKey = getVancouverDate(-1);
            const yesterdayFc = await apiFetch(`/api/bakery/forecast/${yesterdayKey}`);
            if (yesterdayFc?.items?.length) {
                lastNightPull = yesterdayFc.items.filter(i => i.recommended > 0);
            }
        } catch (e) {
            console.warn('Could not fetch last night\'s pull:', e.message);
        }

        let html = '';

        // Last night's pull banner (at the top)
        html += `<div style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);border:2px solid #1976d2;border-radius:12px;padding:14px;margin-bottom:14px;">`;
        html += `<div style="font-weight:700;color:#0d47a1;font-size:15px;margin-bottom:6px;">📋 Last Night's Defrost Pull</div>`;
        if (lastNightPull && lastNightPull.length > 0) {
            html += `<div style="font-size:12px;color:#1565c0;margin-bottom:8px;font-style:italic;">Items pulled from freezer last night — confirm these are thawed and on the rack</div>`;
            html += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
            for (const item of lastNightPull) {
                html += `<div style="background:white;border:1px solid #90caf9;border-radius:8px;padding:4px 10px;font-size:13px;font-weight:600;color:#0d47a1;">${item.recommended} × ${item.name}</div>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="color:#555;font-size:13px;">⚠️ No defrost data for last night — check with the closing shift.</div>`;
        }
        html += `</div>`;

        // Today's forecast
        if (todayFc) {
            const items = todayFc.items || [];
            html += `<div style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border:2px solid #4caf50;border-radius:12px;padding:14px;margin-bottom:18px;">`;
            html += `<div style="font-weight:700;color:#1b5e20;font-size:15px;margin-bottom:4px;">📊 Today's Pastry PAR</div>`;
            html += `<div style="font-size:12px;color:#2e7d32;margin-bottom:10px;font-style:italic;">Target quantities for today${todayFc.weatherNote ? ' · ' + todayFc.weatherNote : ''}</div>`;
            html += `<div style="display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;">`;

            let hasAny = false;
            for (const item of items) {
                if (!item.recommended) continue;
                hasAny = true;
                const bar = '█'.repeat(Math.min(item.recommended, 12));
                const barColor = item.recommended >= 8 ? '#1b5e20' : item.recommended >= 5 ? '#388e3c' : '#66bb6a';
                html += `<div style="font-size:13px;color:#333;padding:3px 0;">${item.name}</div>`;
                html += `<div style="font-size:13px;font-weight:700;color:#1b5e20;text-align:right;padding:3px 0;">×${item.recommended} <span style="font-size:10px;color:${barColor};">${bar}</span></div>`;
            }

            if (!hasAny) {
                html += `<div style="grid-column:1/-1;color:#666;font-size:13px;">No pastry PAR data for today.</div>`;
            }

            html += `</div></div>`;
        }

        container.innerHTML = html;
    } catch (e) { console.error('Error loading opening pastry info:', e); }
}

// Pastry items tracked for reconciliation
const RECONCILIATION_PASTRIES = [
    { key: 'chocolateCroissant', name: 'Chocolate Croissant' },
    { key: 'hamCheese', name: 'Ham and Cheese Croissant' },
    { key: 'plainCroissant', name: 'Plain Croissant' },
    { key: 'bananaBread', name: 'Banana Bread' },
    { key: 'lemonCake', name: 'Lemon cake' },
    { key: 'cinnamonBun', name: 'Cinnamon Bun' },
    { key: 'cookie', name: 'Cookie' },
    { key: 'spinachFeta', name: 'Spinach Feta Croissant' }
];

// Store forecast data for reconciliation (populated when closing tab loads)
let closingForecastData = {};

// Load closing pastry reconciliation section
async function loadClosingReconciliation() {
    const container = document.getElementById('closingReconciliation');
    if (!container) return;
    try {
        const fcRes = await fetch('data/forecast.json');
        if (!fcRes.ok) {
            container.innerHTML = `<div style="background:#fff3e0;border:2px solid #ff9800;border-radius:10px;padding:12px;margin-top:15px;"><strong>⚠️ Could not load forecast data</strong> for reconciliation.</div>`;
            return;
        }
        const fcData = await fcRes.json();
        const todayKey = getVancouverDate();
        const todayFc = fcData.forecast?.[todayKey];

        // Store forecast globally for use in submit handler
        closingForecastData = {};
        if (todayFc) {
            for (const p of RECONCILIATION_PASTRIES) {
                closingForecastData[p.name] = todayFc.items?.[p.name]?.predicted ?? 0;
            }
        }

        let html = `<div id="reconciliationBox" style="margin-top:20px;background:#fafafa;border:2px solid #667eea;border-radius:12px;overflow:hidden;">`;
        html += `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 15px;">`;
        html += `<div style="font-weight:700;font-size:15px;">🥐 Pastry Reconciliation</div>`;
        html += `<div style="font-size:12px;opacity:0.9;margin-top:3px;">Enter leftover quantities at close — counts what's still on the shelf/rack</div>`;
        html += `</div>`;

        html += `<div style="padding:12px;">`;
        html += `<div style="display:grid;grid-template-columns:1fr 60px 80px 60px;gap:6px;align-items:center;margin-bottom:8px;">`;
        html += `<div style="font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Item</div>`;
        html += `<div style="font-size:11px;font-weight:600;color:#667eea;text-align:center;text-transform:uppercase;">Forecast</div>`;
        html += `<div style="font-size:11px;font-weight:600;color:#333;text-align:center;text-transform:uppercase;">Leftover</div>`;
        html += `<div style="font-size:11px;font-weight:600;color:#333;text-align:center;text-transform:uppercase;">Status</div>`;
        html += `</div>`;

        for (const p of RECONCILIATION_PASTRIES) {
            const predicted = closingForecastData[p.name] ?? 0;
            html += `<div style="display:grid;grid-template-columns:1fr 60px 80px 60px;gap:6px;align-items:center;padding:6px 0;border-top:1px solid #eee;">`;
            html += `<div style="font-size:13px;color:#333;">${p.name}</div>`;
            html += `<div style="font-size:13px;color:#667eea;font-weight:600;text-align:center;">${predicted}</div>`;
            html += `<div style="text-align:center;"><input type="number" id="leftover-${p.key}" min="0" value="0" oninput="updateReconciliationSummary()" style="width:60px;padding:6px;border:2px solid #e0e0e0;border-radius:6px;font-size:15px;text-align:center;font-weight:600;"></div>`;
            html += `<div id="status-${p.key}" style="font-size:16px;text-align:center;">—</div>`;
            html += `</div>`;
        }

        html += `</div>`;

        // Summary section (updated live)
        html += `<div id="reconciliationSummary" style="padding:10px 15px;background:#f8f9fa;border-top:1px solid #e0e0e0;font-size:13px;color:#666;">Enter leftover counts above to see summary.</div>`;

        html += `</div>`;
        container.innerHTML = html;

    } catch (e) { console.error('Error loading closing reconciliation:', e); }
}

// Update the reconciliation summary and status icons live as staff type
function updateReconciliationSummary() {
    const overstock = [];
    const understock = [];
    const onTarget = [];

    for (const p of RECONCILIATION_PASTRIES) {
        const input = document.getElementById(`leftover-${p.key}`);
        const statusEl = document.getElementById(`status-${p.key}`);
        if (!input || !statusEl) continue;

        const leftover = parseInt(input.value) || 0;
        const predicted = closingForecastData[p.name] ?? 0;

        // We don't have opening stock, so we compare leftover to forecast
        // If leftover > 0, they made more than they sold → potential waste
        // But we also need to know sold count. Without opening stock, use leftover as waste proxy.
        // Status logic: compare (predicted - leftover) vs predicted
        // High leftover relative to forecast → overstock/waste
        // Zero leftover and sold > predicted → understock
        // Estimated sold = forecast - leftover (rough, since opening stock = forecast + buffer)
        const estimatedSold = Math.max(0, predicted - leftover);

        if (leftover === 0 && predicted > 0) {
            // Sold out — could be understocked
            statusEl.textContent = '🟢';
            statusEl.title = 'Sold out — possible understock risk';
            understock.push(p.name);
        } else if (leftover >= predicted * 0.5) {
            // More than half left over — significant waste
            statusEl.textContent = '🔴';
            statusEl.title = `${leftover} leftover — overstock/waste`;
            overstock.push(p.name);
        } else if (leftover > 0 && leftover < predicted * 0.5) {
            // Some leftover but reasonable
            statusEl.textContent = '✅';
            statusEl.title = `${leftover} leftover — on target`;
            onTarget.push(p.name);
        } else {
            statusEl.textContent = '—';
            onTarget.push(p.name);
        }
    }

    const summaryEl = document.getElementById('reconciliationSummary');
    if (!summaryEl) return;

    let summaryHtml = '';
    if (understock.length > 0) {
        summaryHtml += `<div style="margin-bottom:4px;">🟢 <strong>Sold out (understock risk):</strong> ${understock.join(', ')}</div>`;
    }
    if (overstock.length > 0) {
        summaryHtml += `<div style="margin-bottom:4px;">🔴 <strong>High waste/overstock:</strong> ${overstock.join(', ')}</div>`;
    }
    if (onTarget.length > 0) {
        summaryHtml += `<div>✅ <strong>On target:</strong> ${onTarget.join(', ')}</div>`;
    }
    summaryEl.innerHTML = summaryHtml || '<span style="color:#999;">Enter leftover counts above to see summary.</span>';
}

// Show specific checklist
function showChecklist(type) {
    currentChecklist = type;
    document.getElementById('checklistSection').style.display = 'block';
    document.getElementById('quickActions').style.display = 'none';
    
    // Hide all checklists first
    document.getElementById('openingChecklist').style.display = 'none';
    document.getElementById('closingChecklist').style.display = 'none';
    document.getElementById('inventoryChecklist').style.display = 'none';
    
    // Remove active from all buttons
    document.getElementById('openingBtn').classList.remove('active');
    document.getElementById('closingBtn').classList.remove('active');
    document.getElementById('inventoryBtn').classList.remove('active');
    
    if (type === 'opening') {
        document.getElementById('checklistTitle').textContent = 'Opening Checklist';
        document.getElementById('openingBtn').classList.add('active');
        document.getElementById('openingChecklist').style.display = 'block';
        loadOpeningPastryInfo();
        initPassFail(document.getElementById('openingChecklist'));
        hideShiftNotesSection();
        showFindingsSection();
    } else if (type === 'closing') {
        document.getElementById('checklistTitle').textContent = 'Closing Checklist';
        document.getElementById('closingBtn').classList.add('active');
        document.getElementById('closingChecklist').style.display = 'block';
        loadClosingFreezerPulls();
        loadClosingReconciliation();
        initPassFail(document.getElementById('closingChecklist'));
        showShiftNotesSection();
        showFindingsSection();
    } else if (type === 'inventory') {
        document.getElementById('checklistTitle').textContent = 'Inventory Handover';
        document.getElementById('inventoryBtn').classList.add('active');
        document.getElementById('inventoryChecklist').style.display = 'block';
        // Show predicted usage hints
        loadInventoryPredictions();
        // Inventory doesn't use pass/fail per-item — it's numeric entry
        hideFindingsSection(); // will be shown after loadInventoryPredictions if needed
        hideShiftNotesSection();
        showFindingsSection(); // findings still apply to inventory
    }

    // Reset summary screen visibility, show submit controls
    const summaryEl = document.getElementById('submissionSummary');
    if (summaryEl) summaryEl.style.display = 'none';
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.style.display = '';
    const saveBtn = document.getElementById('saveProgressBtn');
    if (saveBtn) saveBtn.style.display = '';

    // Check for a saved draft (not for inventory)
    if (type !== 'inventory') {
        checkForDraftAndPrompt(type);
        startAutosave();
    } else {
        stopAutosave();
        const banner = document.getElementById('draftResumeBanner');
        if (banner) banner.style.display = 'none';
    }

    // Scroll to checklist
    document.getElementById('checklistSection').scrollIntoView({ behavior: 'smooth' });
}

// Close checklist
function closeChecklist() {
    stopAutosave();
    document.getElementById('checklistSection').style.display = 'none';
    document.getElementById('quickActions').style.display = 'grid';
    hideFindingsSection();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load forecast predictions into inventory form
async function loadInventoryPredictions() {
    try {
        const res = await fetch('data/forecast.json');
        if (!res.ok) return;
        const fcData = await res.json();
        const todayKey = getVancouverDate();
        const todayFc = fcData.forecast?.[todayKey];
        if (!todayFc) return;

        // Add prediction hints to pastry section
        const hints = {
            'inv-ham-cheese': 'Ham and Cheese Croissant',
            'inv-chocolate': 'Chocolate Croissant',
            'inv-plain': 'Plain Croissant',
            'inv-banana-bread': 'Banana Bread',
            'inv-lemon-loaf': 'Lemon cake',
            'inv-cinnamon-buns': 'Cinnamon Bun'
        };

        for (const [inputId, fcName] of Object.entries(hints)) {
            const input = document.getElementById(inputId);
            if (!input) continue;
            const predicted = todayFc.items?.[fcName]?.predicted || 0;
            const item = input.closest('.inventory-item');
            if (!item) continue;
            // Remove existing hint
            const existing = item.querySelector('.pred-hint');
            if (existing) existing.remove();
            if (predicted > 0) {
                const hint = document.createElement('span');
                hint.className = 'pred-hint';
                hint.style.cssText = 'font-size:11px;color:#667eea;display:block;margin-top:2px;';
                hint.textContent = `📊 ~${predicted} predicted sales today`;
                item.querySelector('label').appendChild(hint);
            }
        }
    } catch (e) { /* optional enhancement */ }
}

// Login error helper
function showLoginError(msg) {
    let errEl = document.getElementById('loginError');
    if (!errEl) {
        errEl = document.createElement('p');
        errEl.id = 'loginError';
        errEl.style.cssText = 'color:#e63946;font-size:14px;text-align:center;margin:8px 0 0;font-weight:600;';
        const btn = document.getElementById('loginBtn');
        if (btn) btn.parentNode.insertBefore(errEl, btn.nextSibling);
        else document.getElementById('authSection').appendChild(errEl);
    }
    errEl.textContent = msg;
}

function clearLoginError() {
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';
}

// Global login handler — called via onclick attribute on loginBtn (most reliable on iOS PWA)
function handleLogin() {
    const nsecInput = document.getElementById('nsecInput').value.trim();
    const btn = document.getElementById('loginBtn');

    if (!nsecInput) {
        showLoginError('Please enter your nsec key.');
        return;
    }

    clearLoginError();
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    setTimeout(() => {
        try {
            if (typeof NostrTools === 'undefined') throw new Error('App not ready — please force reload.');

            const decoded = NostrTools.nip19.decode(nsecInput);

            if (decoded.type !== 'nsec') {
                throw new Error('Key must start with nsec1…');
            }

            const privateKey = decoded.data;
            const publicKey = NostrTools.getPublicKey(privateKey);

            userKeys = { privateKey, publicKey };

            localStorage.setItem('nostr_nsec', nsecInput);
            localStorage.setItem('nostr_pubkey', publicKey);

            showLoggedInState();

            document.getElementById('nsecInput').value = '';

        } catch (error) {
            showLoginError('⚠️ ' + (error.message || 'Invalid nsec — please check and try again.'));
            btn.disabled = false;
            btn.textContent = 'Login';
        }
    }, 300);
}

// Also support Enter key in nsec field

// Allow Enter key to login
document.getElementById('nsecInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});

// Checklist type switching
document.getElementById('openingBtn').addEventListener('click', () => {
    currentChecklist = 'opening';
    document.getElementById('checklistTitle').textContent = 'Opening Checklist';
    document.getElementById('openingBtn').classList.add('active');
    document.getElementById('closingBtn').classList.remove('active');
    document.getElementById('inventoryBtn').classList.remove('active');
    document.getElementById('openingChecklist').style.display = 'block';
    document.getElementById('closingChecklist').style.display = 'none';
    document.getElementById('inventoryChecklist').style.display = 'none';
    initPassFail(document.getElementById('openingChecklist'));
    hideShiftNotesSection();
    showFindingsSection();
});

document.getElementById('closingBtn').addEventListener('click', () => {
    currentChecklist = 'closing';
    document.getElementById('checklistTitle').textContent = 'Closing Checklist';
    document.getElementById('closingBtn').classList.add('active');
    document.getElementById('openingBtn').classList.remove('active');
    document.getElementById('inventoryBtn').classList.remove('active');
    document.getElementById('openingChecklist').style.display = 'none';
    document.getElementById('closingChecklist').style.display = 'block';
    document.getElementById('inventoryChecklist').style.display = 'none';
    loadClosingFreezerPulls();
    loadClosingReconciliation();
    initPassFail(document.getElementById('closingChecklist'));
    showShiftNotesSection();
    showFindingsSection();
});

document.getElementById('inventoryBtn').addEventListener('click', () => {
    currentChecklist = 'inventory';
    document.getElementById('checklistTitle').textContent = 'Inventory Handover';
    document.getElementById('inventoryBtn').classList.add('active');
    document.getElementById('openingBtn').classList.remove('active');
    document.getElementById('closingBtn').classList.remove('active');
    document.getElementById('openingChecklist').style.display = 'none';
    document.getElementById('closingChecklist').style.display = 'none';
    document.getElementById('inventoryChecklist').style.display = 'block';
    hideShiftNotesSection();
    showFindingsSection();
});

// Submit checklist
document.getElementById('submitBtn').addEventListener('click', async () => {
    if (!userKeys) {
        alert('Not logged in');
        return;
    }
    
    let items = [];
    let contentData = {};
    
    if (currentChecklist === 'inventory') {
        // Handle inventory checklist
        const inventoryData = {
            milk: {
                milk35: parseInt(document.getElementById('inv-milk-35').value) || 0,
                milk2: parseInt(document.getElementById('inv-milk-2').value) || 0,
                oatMilk1L: parseInt(document.getElementById('inv-oat-milk-1l').value) || 0,
                soyMilk1L: parseInt(document.getElementById('inv-soy-milk-1l').value) || 0,
                halfAndHalf: parseInt(document.getElementById('inv-half-and-half').value) || 0,
                whippingCream: parseInt(document.getElementById('inv-whipping-cream').value) || 0,
                whole: parseInt(document.getElementById('inv-whole-milk').value) || 0,
                almond: parseInt(document.getElementById('inv-almond-milk').value) || 0,
                soy: parseInt(document.getElementById('inv-soy-milk').value) || 0
            },
            dairy: {
                greekYogurt3kg: parseInt(document.getElementById('inv-greek-yogurt').value) || 0
            },
            beans: {
                regular: parseInt(document.getElementById('inv-beans-regular').value) || 0,
                decaf: parseInt(document.getElementById('inv-beans-decaf').value) || 0
            },
            coffeeBags: parseInt(document.getElementById('inv-coffee-bags').value) || 0,
            pastries: {
                hamCheese: parseInt(document.getElementById('inv-ham-cheese').value) || 0,
                chocolate: parseInt(document.getElementById('inv-chocolate').value) || 0,
                plain: parseInt(document.getElementById('inv-plain').value) || 0,
                bananaBread: parseInt(document.getElementById('inv-banana-bread').value) || 0,
                lemonLoaf: parseInt(document.getElementById('inv-lemon-loaf').value) || 0,
                cinnamonBuns: parseInt(document.getElementById('inv-cinnamon-buns').value) || 0
            },
            freezer: {
                hamCheese: parseInt(document.getElementById('inv-freezer-ham-cheese').value) || 0,
                chocolate: parseInt(document.getElementById('inv-freezer-chocolate').value) || 0,
                plain: parseInt(document.getElementById('inv-freezer-plain').value) || 0,
                cinnamonBuns: parseInt(document.getElementById('inv-freezer-cinnamon').value) || 0,
                bananaBread: parseInt(document.getElementById('inv-freezer-banana').value) || 0,
                lemonLoaf: parseInt(document.getElementById('inv-freezer-lemon').value) || 0
            }
        };
        
        // Calculate variance from forecast predictions
        let varianceData = null;
        try {
          const fcRes = await fetch('data/forecast.json');
          if (fcRes.ok) {
            const fcData = await fcRes.json();
            const todayKey = getVancouverDate();
            const todayFc = fcData.forecast?.[todayKey];
            if (todayFc) {
              varianceData = {
                predictedSales: {},
                date: todayKey
              };
              const pastryMap = {
                'hamCheese': 'Ham and Cheese Croissant',
                'chocolate': 'Chocolate Croissant',
                'plain': 'Plain Croissant',
                'bananaBread': 'Banana Bread',
                'lemonLoaf': 'Lemon cake',
                'cinnamonBuns': 'Cinnamon Bun'
              };
              for (const [key, fcName] of Object.entries(pastryMap)) {
                varianceData.predictedSales[key] = todayFc.items?.[fcName]?.predicted || 0;
              }
            }
          }
        } catch (e) { /* variance is optional */ }

        contentData = {
            checklist: 'inventory',
            timestamp: new Date().toISOString(),
            inventory: inventoryData,
            variance: varianceData
        };
        
    } else {
        // Handle opening/closing checklist — new pass/fail format
        const checklistDiv = currentChecklist === 'opening'
            ? document.getElementById('openingChecklist')
            : document.getElementById('closingChecklist');

        clearAllItemErrors(checklistDiv);

        // Collect all pass/fail items
        const pfItems = checklistDiv.querySelectorAll('.checklist-item.pf-enhanced');

        if (pfItems.length === 0) {
            alert('No checklist items found. Please refresh and try again.');
            return;
        }

        // Check at least one item has been acted on (pass or fail)
        const actedCount = Array.from(pfItems).filter(i => i.dataset.status === 'pass' || i.dataset.status === 'fail').length;
        if (actedCount === 0) {
            alert('Please mark at least one task as PASS or FAIL before submitting.');
            return;
        }

        // Validate FAIL items — must have comment or photo
        let validationFailed = false;
        for (const item of pfItems) {
            if (item.dataset.status === 'fail') {
                const comment = item.querySelector('.item-comment')?.value?.trim() || '';
                const photoInput = item.querySelector('.item-photo-input');
                const hasPhoto = photoInput && photoInput.files && photoInput.files.length > 0;
                if (!comment && !hasPhoto) {
                    showItemError(item, 'FAIL items require a comment or photo');
                    if (!validationFailed) validationFailed = true;
                }
            }
        }

        if (validationFailed) {
            showStatus('error', '⚠️ Some FAIL items are missing required evidence (comment or photo). Please review.');
            document.getElementById('submitBtn').disabled = false;
            document.getElementById('submitBtn').textContent = 'Submit Checklist';
            return;
        }

        // Collect photo data async
        const itemDataPromises = Array.from(pfItems).map(async (item) => {
            const photoInput = item.querySelector('.item-photo-input');
            const file = photoInput && photoInput.files && photoInput.files[0];
            const photoData = file ? await readPhotoAsBase64(file) : null;
            return {
                taskId: item.dataset.taskId || '',
                taskLabel: item.dataset.taskLabel || '',
                status: item.dataset.status || 'skipped',
                comment: item.querySelector('.item-comment')?.value?.trim() || null,
                photoData: photoData || null
            };
        });

        items = await Promise.all(itemDataPromises);

        const passedCount = items.filter(i => i.status === 'pass').length;
        const failedCount = items.filter(i => i.status === 'fail').length;
        const total = items.length;

        contentData = {
            checklist: currentChecklist,
            timestamp: new Date().toISOString(),
            items,
            completionRate: `${passedCount + failedCount}/${total}`,
            passCount: passedCount,
            failCount: failedCount
        };

        // For closing checklist, attach pastry reconciliation data
        if (currentChecklist === 'closing') {
            const leftovers = {};
            const forecastAccuracy = {};
            for (const p of RECONCILIATION_PASTRIES) {
                const input = document.getElementById(`leftover-${p.key}`);
                const leftover = input ? (parseInt(input.value) || 0) : 0;
                const predicted = closingForecastData[p.name] ?? 0;
                leftovers[p.name] = leftover;
                forecastAccuracy[p.name] = {
                    predicted,
                    leftover,
                    delta: -leftover  // negative = leftover = less sold than if 0 leftover
                };
            }
            contentData.leftovers = leftovers;
            contentData.forecastAccuracy = forecastAccuracy;
            contentData.forecastDate = getVancouverDate();

            // Also POST leftovers to bakery API (best-effort — don't block checklist submission)
            const todayDate = getVancouverDate();
            const bakeryUrl = `${API_BASE}/api/bakery/leftovers`;
            try {
                const bakeryAuthHeader = await buildNostrAuthHeader('POST', bakeryUrl);
                fetch(bakeryUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': bakeryAuthHeader
                    },
                    body: JSON.stringify({ date: todayDate, leftovers })
                }).then(r => {
                    if (r.ok) console.log('✅ Leftovers posted to bakery API');
                    else r.json().then(e => console.warn('Bakery API leftovers error:', e));
                }).catch(e => console.warn('Bakery API unreachable:', e.message));
            } catch (e) {
                console.warn('Could not post to bakery API:', e.message);
            }
        }
    }
    
    // Collect Shift Handover Notes (closing checklist only)
    if (currentChecklist === 'closing') {
        const shiftNotesText = document.getElementById('shiftNotesText')?.value?.trim() || '';
        if (shiftNotesText) {
            contentData.shiftNotes = shiftNotesText;
        }
    }

    // Collect Findings & Suggestions (applies to all checklist types)
    const findingsText = document.getElementById('findingsText')?.value?.trim() || '';
    const findingsPhotoInput = document.getElementById('findingsPhotoInput');
    const findingsPhotoFile = findingsPhotoInput?.files?.[0];
    const findingsPhoto = findingsPhotoFile ? await readPhotoAsBase64(findingsPhotoFile) : null;
    if (findingsText || findingsPhoto) {
        contentData.findings = findingsText || null;
        contentData.findingsPhoto = findingsPhoto || null;
    }

    try {
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('submitBtn').textContent = 'Submitting...';

        // POST to local API backend with NIP-98 Nostr auth
        await submitWithFallback(contentData);

        // Clear the saved draft on successful submit
        if (currentChecklist !== 'inventory') {
            clearDraft(currentChecklist);
            stopAutosave();
        }

        // Refresh today's activity
        loadTodaysActivity();

        if (currentChecklist === 'inventory') {
            showStatus('success', '✅ Inventory handover saved!');
            setTimeout(() => {
                document.querySelectorAll('#inventoryChecklist input[type="number"]').forEach(input => input.value = 0);
            }, 2000);
        } else {
            // Show post-submit summary screen
            showSubmissionSummary(contentData);
        }

    } catch (error) {
        showStatus('error', 'Submission failed: ' + error.message);
    } finally {
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').textContent = 'Submit Checklist';
    }
});

// Note: Nostr relay publishing removed — Nostr is used for AUTH ONLY (NIP-98).
// Submissions go directly to trails-api via submitWithFallback().

// ─── Pass/Fail UX ────────────────────────────────────────────────────────────

/**
 * Compress a File image to max 1024px wide, quality 0.75.
 * Returns a data URL (base64).
 */
async function compressPhoto(file, maxWidth = 1024, quality = 0.75) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = img.width > maxWidth ? maxWidth / img.width : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

/**
 * Read a File as a base64 data URL (with compression for images).
 */
async function readPhotoAsBase64(file) {
    if (!file) return null;
    if (file.type.startsWith('image/')) {
        return compressPhoto(file);
    }
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

/**
 * Enhance all un-enhanced .checklist-item elements in a container with Pass/Fail UX.
 * Replaces checkboxes with PASS/FAIL buttons and expandable photo/comment fields.
 * @param {HTMLElement} container - the checklist div to scan
 */
function initPassFail(container) {
    if (!container) return;
    container.querySelectorAll('.checklist-item:not(.pf-enhanced)').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (!checkbox) return; // skip non-checkbox items (e.g. inventory inputs)

        const labelEl = item.querySelector('label');
        const taskId = checkbox.id || ('task-' + Math.random().toString(36).slice(2));
        const taskLabelText = labelEl ? labelEl.textContent.trim() : taskId;
        const taskLabelHtml = labelEl ? labelEl.innerHTML : taskLabelText;

        item.classList.add('pf-enhanced');
        item.dataset.taskId = taskId;
        item.dataset.taskLabel = taskLabelText;
        item.dataset.status = '';

        item.innerHTML = `
            <div class="item-main">
                <div class="item-label">${taskLabelHtml}</div>
                <div class="item-buttons">
                    <button class="btn-pass" type="button" aria-label="Pass">✅ PASS</button>
                    <button class="btn-fail" type="button" aria-label="Fail">❌ FAIL</button>
                    <button class="btn-expand" type="button" title="Add photo/comment">⋯</button>
                </div>
            </div>
            <div class="item-detail">
                <textarea class="item-comment" placeholder="💬 Comment (required if FAIL)" rows="2"></textarea>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <label class="item-photo-label">
                        📷 Photo
                        <input type="file" accept="image/*" capture="environment" class="item-photo-input">
                    </label>
                    <span class="item-photo-name"></span>
                </div>
                <img class="item-photo-preview" alt="Preview" style="display:none;max-width:120px;border-radius:6px;border:1px solid #ddd;margin-top:4px;">
                <div class="item-error"></div>
            </div>`;

        // Restore data attrs (innerHTML wiped them)
        item.dataset.taskId = taskId;
        item.dataset.taskLabel = taskLabelText;
        item.dataset.status = '';

        const passBtn = item.querySelector('.btn-pass');
        const failBtn = item.querySelector('.btn-fail');
        const expandBtn = item.querySelector('.btn-expand');
        const detail = item.querySelector('.item-detail');
        const commentEl = item.querySelector('.item-comment');
        const photoInput = item.querySelector('.item-photo-input');
        const photoName = item.querySelector('.item-photo-name');
        const photoPreview = item.querySelector('.item-photo-preview');
        const errorEl = item.querySelector('.item-error');

        function clearError() {
            if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
        }

        passBtn.addEventListener('click', () => {
            item.dataset.status = 'pass';
            passBtn.classList.add('selected');
            failBtn.classList.remove('selected');
            item.classList.add('status-pass');
            item.classList.remove('status-fail');
            detail.classList.remove('expanded');
            clearError();
        });

        failBtn.addEventListener('click', () => {
            item.dataset.status = 'fail';
            failBtn.classList.add('selected');
            passBtn.classList.remove('selected');
            item.classList.add('status-fail');
            item.classList.remove('status-pass');
            detail.classList.add('expanded');
            commentEl.focus();
            clearError();
        });

        expandBtn.addEventListener('click', () => {
            detail.classList.toggle('expanded');
        });

        photoInput.addEventListener('change', () => {
            const file = photoInput.files && photoInput.files[0];
            if (file) {
                photoName.textContent = '📎 ' + file.name;
                photoName.style.display = 'inline';
                const previewUrl = URL.createObjectURL(file);
                photoPreview.src = previewUrl;
                photoPreview.style.display = 'block';
                photoPreview.onload = () => URL.revokeObjectURL(previewUrl);
            } else {
                photoName.style.display = 'none';
                photoPreview.style.display = 'none';
            }
        });
    });
}

/**
 * Show validation error on a specific item.
 */
function showItemError(item, message) {
    const errorEl = item.querySelector('.item-error');
    const detail = item.querySelector('.item-detail');
    if (errorEl) {
        errorEl.textContent = '⚠️ ' + message;
        errorEl.style.display = 'block';
    }
    if (detail) detail.classList.add('expanded');
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Clear all item validation errors in a container.
 */
function clearAllItemErrors(container) {
    if (!container) return;
    container.querySelectorAll('.item-error').forEach(el => {
        el.style.display = 'none';
        el.textContent = '';
    });
}

/**
 * Setup the Findings section for a given checklist type.
 */
function showFindingsSection() {
    const section = document.getElementById('findingsSection');
    if (section) section.style.display = 'block';
}

function hideFindingsSection() {
    const section = document.getElementById('findingsSection');
    if (section) section.style.display = 'none';
}

function showShiftNotesSection() {
    const section = document.getElementById('shiftNotesSection');
    if (section) section.style.display = 'block';
}

function hideShiftNotesSection() {
    const section = document.getElementById('shiftNotesSection');
    if (section) section.style.display = 'none';
}

// Setup findings photo preview
(function setupFindingsPhoto() {
    const input = document.getElementById('findingsPhotoInput');
    const nameEl = document.getElementById('findingsPhotoName');
    const preview = document.getElementById('findingsPhotoPreview');
    if (!input) return;
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (file) {
            if (nameEl) { nameEl.textContent = '📎 ' + file.name; }
            if (preview) {
                const url = URL.createObjectURL(file);
                preview.src = url;
                preview.style.display = 'block';
                preview.onload = () => URL.revokeObjectURL(url);
            }
        } else {
            if (nameEl) nameEl.textContent = '';
            if (preview) preview.style.display = 'none';
        }
    });
})();

// Show status message
function showStatus(type, message) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// ─── Draft Autosave / Resume ──────────────────────────────────────────────────

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Build a draft storage key for a checklist type.
 */
export function draftKey(type) {
    return `checklist_draft_${type}`;
}

/**
 * Collect current checklist state into a draft object.
 * @param {string} type - 'opening' | 'closing' | 'inventory'
 * @returns {object|null}
 */
export function collectDraftState(type, domDocument = document) {
    if (type === 'inventory') return null; // inventory doesn't use pass/fail items

    const checklistDiv = domDocument.getElementById(`${type}Checklist`);
    if (!checklistDiv) return null;

    const pfItems = checklistDiv.querySelectorAll('.checklist-item.pf-enhanced');
    const items = Array.from(pfItems).map(item => ({
        taskId: item.dataset.taskId || '',
        status: item.dataset.status || 'skipped',
        comment: item.querySelector('.item-comment')?.value?.trim() || '',
        photoData: null // don't store photos in localStorage (too large)
    }));

    const findings = domDocument.getElementById('findingsText')?.value?.trim() || '';
    const shiftNotes = domDocument.getElementById('shiftNotesText')?.value?.trim() || '';

    // Only save if user has actually interacted
    const actedOn = items.filter(i => i.status !== 'skipped');
    if (actedOn.length === 0 && !findings && !shiftNotes) return null;

    return {
        type,
        savedAt: new Date().toISOString(),
        items,
        findings,
        shiftNotes
    };
}

/**
 * Save current checklist draft to localStorage.
 */
function saveChecklistDraft(domDocument = document, storage = localStorage) {
    const draft = collectDraftState(currentChecklist, domDocument);
    if (!draft) {
        // Even with no changes, show indicator if user clicked manually
        showAutosaveIndicator(domDocument);
        return;
    }
    storage.setItem(draftKey(currentChecklist), JSON.stringify(draft));
    showAutosaveIndicator(domDocument);
}

/**
 * Flash the "Saved ✓" indicator.
 */
function showAutosaveIndicator(domDocument = document) {
    const el = domDocument.getElementById('autosaveIndicator');
    if (!el) return;
    el.style.display = 'block';
    el.classList.remove('autosave-flash');
    // Trigger reflow to restart animation
    void el.offsetWidth;
    el.classList.add('autosave-flash');
    setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('autosave-flash');
    }, 2100);
}

/**
 * Load draft from localStorage. Returns null if not found or expired.
 */
export function loadDraft(type, storage = localStorage) {
    try {
        const raw = storage.getItem(draftKey(type));
        if (!raw) return null;
        const draft = JSON.parse(raw);
        const age = Date.now() - new Date(draft.savedAt).getTime();
        if (age > DRAFT_MAX_AGE_MS) {
            storage.removeItem(draftKey(type));
            return null;
        }
        return draft;
    } catch {
        return null;
    }
}

/**
 * Clear draft for a checklist type.
 */
export function clearDraft(type, storage = localStorage) {
    storage.removeItem(draftKey(type));
}

/**
 * Check for a saved draft and show the resume banner if found.
 */
function checkForDraftAndPrompt(type) {
    const draft = loadDraft(type);
    const banner = document.getElementById('draftResumeBanner');
    if (!banner) return;

    if (draft) {
        const savedAt = new Date(draft.savedAt);
        const timeStr = savedAt.toLocaleTimeString('en-CA', {
            hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver'
        });
        const dateStr = savedAt.toLocaleDateString('en-CA', {
            month: 'short', day: 'numeric', timeZone: 'America/Vancouver'
        });
        const isToday = savedAt.toDateString() === new Date().toDateString();
        document.getElementById('draftSavedTime').textContent = isToday ? timeStr : `${dateStr} ${timeStr}`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

/**
 * Resume a saved draft — restore all item states.
 */
function resumeDraft() {
    const draft = loadDraft(currentChecklist);
    if (!draft) return;

    const checklistDiv = document.getElementById(`${currentChecklist}Checklist`);
    if (!checklistDiv) return;

    // Restore item statuses
    for (const saved of draft.items) {
        if (!saved.taskId || saved.status === 'skipped') continue;
        const item = checklistDiv.querySelector(`[data-task-id="${saved.taskId}"]`);
        if (!item) continue;

        const passBtn = item.querySelector('.btn-pass');
        const failBtn = item.querySelector('.btn-fail');
        const detail = item.querySelector('.item-detail');
        const commentEl = item.querySelector('.item-comment');

        if (saved.status === 'pass') {
            item.dataset.status = 'pass';
            item.classList.add('status-pass');
            item.classList.remove('status-fail');
            passBtn?.classList.add('selected');
            failBtn?.classList.remove('selected');
            detail?.classList.remove('expanded');
        } else if (saved.status === 'fail') {
            item.dataset.status = 'fail';
            item.classList.add('status-fail');
            item.classList.remove('status-pass');
            failBtn?.classList.add('selected');
            passBtn?.classList.remove('selected');
            detail?.classList.add('expanded');
        }
        if (commentEl && saved.comment) commentEl.value = saved.comment;
    }

    // Restore findings and shift notes
    const findingsEl = document.getElementById('findingsText');
    if (findingsEl && draft.findings) findingsEl.value = draft.findings;
    const shiftEl = document.getElementById('shiftNotesText');
    if (shiftEl && draft.shiftNotes) shiftEl.value = draft.shiftNotes;

    // Hide the banner
    document.getElementById('draftResumeBanner').style.display = 'none';
}

/**
 * Discard the saved draft and start fresh.
 */
function startFresh() {
    clearDraft(currentChecklist);
    document.getElementById('draftResumeBanner').style.display = 'none';
}

// Autosave interval (30 seconds)
let _autosaveInterval = null;

function startAutosave() {
    stopAutosave();
    _autosaveInterval = setInterval(() => saveChecklistDraft(), 30000);
}

function stopAutosave() {
    if (_autosaveInterval) {
        clearInterval(_autosaveInterval);
        _autosaveInterval = null;
    }
}

// ─── Post-Submit Summary ──────────────────────────────────────────────────────

/**
 * Build summary data from a submitted contentData object.
 * @param {object} contentData
 * @param {string} staffName
 * @returns {object} summary
 */
export function buildSubmissionSummary(contentData, staffName) {
    const items = contentData.items || [];
    const passed = items.filter(i => i.status === 'pass').length;
    const failed = items.filter(i => i.status === 'fail').length;
    const total = items.length;
    const failedItems = items.filter(i => i.status === 'fail');

    return {
        type: contentData.checklist,
        submittedAt: contentData.timestamp || new Date().toISOString(),
        staffName: staffName || 'Staff',
        passed,
        failed,
        total,
        failedItems,
        findings: contentData.findings || '',
        findingsPhoto: contentData.findingsPhoto || null
    };
}

/**
 * Show the post-submit summary screen.
 */
function showSubmissionSummary(contentData) {
    const summary = buildSubmissionSummary(contentData, getUserName());

    const metaEl = document.getElementById('summaryMeta');
    const passRateEl = document.getElementById('summaryPassRate');
    const failedEl = document.getElementById('summaryFailedItems');
    const findingsEl = document.getElementById('summaryFindings');

    if (!metaEl) return;

    // Meta: time + staff
    const submittedTime = new Date(summary.submittedAt).toLocaleString('en-CA', {
        timeZone: 'America/Vancouver',
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
    metaEl.innerHTML = `<strong>${summary.staffName}</strong> · ${submittedTime}`;

    // Pass rate
    const actedOn = summary.passed + summary.failed;
    if (actedOn > 0) {
        passRateEl.textContent = `${summary.passed}/${actedOn} tasks passed` +
            (summary.failed > 0 ? ` · ${summary.failed} failed ❌` : ' ✅');
    } else {
        passRateEl.textContent = 'Submitted';
    }

    // Failed items
    if (summary.failedItems.length > 0) {
        let html = '<div style="font-weight:600;color:#721c24;margin-bottom:8px;">❌ Failed items:</div>';
        html += '<div style="border:1px solid #f5c6cb;border-radius:8px;overflow:hidden;">';
        html += summary.failedItems.map((item, i) => {
            const border = i < summary.failedItems.length - 1 ? 'border-bottom:1px solid #f5c6cb;' : '';
            return `<div style="padding:8px 12px;${border}background:#fff5f5;">
                <div style="font-size:13px;font-weight:600;color:#721c24;">${item.taskLabel || item.taskId}</div>
                ${item.comment ? `<div style="font-size:12px;color:#555;margin-top:3px;">💬 ${item.comment}</div>` : ''}
            </div>`;
        }).join('');
        html += '</div>';
        failedEl.innerHTML = html;
    } else {
        failedEl.innerHTML = '';
    }

    // Findings
    if (summary.findings) {
        findingsEl.innerHTML = `<div style="font-weight:600;color:#555;margin-bottom:6px;">📝 Findings:</div>
            <div style="background:#f8f9fa;border-radius:8px;padding:10px;font-size:13px;color:#333;">${summary.findings}</div>`;
    } else {
        findingsEl.innerHTML = '';
    }

    // Show summary, hide submit section
    document.getElementById('submissionSummary').style.display = 'block';
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('saveProgressBtn').style.display = 'none';
    const findingsSection = document.getElementById('findingsSection');
    if (findingsSection) findingsSection.style.display = 'none';
    const shiftSection = document.getElementById('shiftNotesSection');
    if (shiftSection) shiftSection.style.display = 'none';
    const checklistDivs = ['openingChecklist', 'closingChecklist'];
    for (const id of checklistDivs) {
        const div = document.getElementById(id);
        if (div && div.style.display !== 'none') div.style.display = 'none';
    }
}

/**
 * Reset everything and go back to empty checklist.
 */
function startNewChecklist() {
    document.getElementById('submissionSummary').style.display = 'none';
    document.getElementById('submitBtn').style.display = '';
    document.getElementById('saveProgressBtn').style.display = '';

    // Reload the current checklist type from scratch
    switchChecklist(currentChecklist);
}

/**
 * Get the current user's display name from the nsec/pubkey.
 */
function getUserName() {
    if (!userKeys) return 'Staff';
    const pubkey = userKeys.publicKey;
    // Look up name from known pubkeys
    const names = {
        'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'jP',
        '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba': 'jP',
        'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2': 'jP',
        '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
        '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911': 'Dayana',
        '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b': 'Dayana'
    };
    return names[pubkey] || (pubkey ? pubkey.slice(0, 8) + '…' : 'Staff');
}

// Logout function
function logout() {
    localStorage.removeItem('nostr_nsec');
    localStorage.removeItem('nostr_pubkey');
    userKeys = null;
    
    // Reset UI
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('quickActions').style.display = 'none';
    document.getElementById('checklistSection').style.display = 'none';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Login';
    
    // Clear checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
