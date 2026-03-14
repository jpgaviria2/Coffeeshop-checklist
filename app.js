// Nostr Checklist App - Mobile-friendly with direct nsec login + Schedule viewer
// Using global NostrTools from CDN

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

// Legacy Nostr relay configuration (kept for compatibility — no longer used for submissions)
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.mutinywallet.com'
];

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
            localStorage.removeItem('nostr_nsec');
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
    document.getElementById('quickActions').style.display = 'flex';
    // Show Square Team app notice
    const squareNotice = document.getElementById('squareNotice');
    if (squareNotice) squareNotice.style.display = 'block';
    // Load today's activity
    loadTodaysActivity();
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
// This section renders at the TOP of the closing checklist — the most important close task
async function loadClosingFreezerPulls() {
    const container = document.getElementById('closingFreezerPulls');
    if (!container) return;
    try {
        const fcRes = await fetch('data/forecast.json');
        if (!fcRes.ok) return;
        const fcData = await fcRes.json();
        const tomorrowKey = getVancouverDate(1);
        const tomorrowFc = fcData.forecast?.[tomorrowKey];

        if (!tomorrowFc) {
            container.innerHTML = `<div style="background:linear-gradient(135deg,#FFF3E0,#FFE0B2);border:3px solid #FF8C00;border-radius:14px;padding:18px;margin-bottom:20px;box-shadow:0 4px 16px rgba(255,140,0,0.2);">
                <div style="font-weight:800;color:#7B3F00;font-size:19px;margin-bottom:8px;">🧊 Freezer Pull</div>
                <strong style="color:#8D4600;">⚠️ No forecast for tomorrow</strong> — check with manager for quantities.
            </div>`;
            return;
        }

        const tomorrowDay = tomorrowFc.dayOfWeek || '';
        const weather = tomorrowFc.weather;

        // Format date label: "Thursday, Mar 12"
        const [year, month, day] = tomorrowKey.split('-').map(Number);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dateLabel = `${tomorrowDay}, ${monthNames[month-1]} ${day}`;

        // Pastry items to pull — ordered by priority
        const PASTRY_ITEMS = [
            'Chocolate Croissant',
            'Plain Croissant',
            'Ham and Cheese Croissant',
            'Spinach Feta Croissant',
            'Cinnamon Bun',
            'Banana Bread',
            'Lemon cake',
            'Cookie',
            'GF Mini Doughnut',
            'Gluten Free Cheddar Scone'
        ];
        const bakeable = new Set(['Cinnamon Bun', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Spinach Feta Croissant']);

        let pulls = [];
        for (const name of PASTRY_ITEMS) {
            const predicted = tomorrowFc.items?.[name]?.predicted || 0;
            if (predicted > 0) {
                pulls.push({ name, qty: predicted, needsBaking: bakeable.has(name) });
            }
        }

        // Weather banner
        let weatherBanner = '';
        if (weather) {
            weatherBanner = `<div style="display:inline-block;background:rgba(255,255,255,0.55);border-radius:8px;padding:5px 12px;font-size:13px;color:#6D3400;font-weight:600;margin-bottom:14px;">
                ${weather.emoji} ${weather.condition} · ${weather.temp}°C — quantities reflect tomorrow's forecast
            </div>`;
        }

        // Build card
        let html = `<div style="background:linear-gradient(135deg,#FFF3E0 0%,#FFE0B2 100%);border:3px solid #FF8C00;border-radius:14px;padding:18px 18px 14px;margin-bottom:20px;box-shadow:0 4px 20px rgba(255,140,0,0.28);">`;
        html += `<div style="font-weight:800;color:#7B3F00;font-size:20px;margin-bottom:4px;letter-spacing:-0.2px;">🧊 Freezer Pull — ${dateLabel}</div>`;
        html += `<div style="font-size:12px;color:#8D4600;font-weight:500;margin-bottom:10px;">Pull tonight → thaw on rack overnight → bake in AM</div>`;
        html += weatherBanner;

        if (pulls.length === 0) {
            html += `<div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:10px;color:#555;">✅ No freezer pulls needed for tomorrow.</div>`;
        } else {
            html += `<div style="display:flex;flex-direction:column;gap:6px;">`;
            for (const p of pulls) {
                const id = `freezer-pull-${p.name.replace(/\s+/g,'-')}`;
                const bakeNote = p.needsBaking
                    ? `<span style="font-size:11px;background:#FF6B35;color:white;padding:2px 7px;border-radius:10px;margin-left:8px;font-weight:700;vertical-align:middle;">🔥 bake AM</span>`
                    : '';
                html += `<div class="checklist-item" style="background:rgba(255,255,255,0.72);border:1.5px solid rgba(255,140,0,0.35);margin-bottom:0;">
                    <input type="checkbox" id="${id}">
                    <label for="${id}" style="font-size:15px;font-weight:500;">Pull <strong style="font-size:16px;color:#5D2E00;">${p.qty}</strong> × ${p.name}${bakeNote}</label>
                </div>`;
            }
            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    } catch (e) { console.error('Error loading freezer pulls:', e); }
}

// Load dynamic opening pastry info — Today's Pastry Forecast
async function loadOpeningPastryInfo() {
    const container = document.getElementById('openingPastryInfo');
    if (!container) return;
    try {
        const fcRes = await fetch('data/forecast.json');
        if (!fcRes.ok) return;
        const fcData = await fcRes.json();
        const todayKey = getVancouverDate();
        const todayFc = fcData.forecast?.[todayKey];
        if (!todayFc) {
            container.innerHTML = `<div style="background:#fff3e0;border:2px solid #ff9800;border-radius:10px;padding:12px;margin-bottom:15px;"><strong>⚠️ No forecast available for today</strong> — contact manager for guidance.</div>`;
            return;
        }

        // Pastry items we track (the ones we bake and sell)
        const PASTRY_ITEMS = [
            'Ham and Cheese Croissant',
            'Chocolate Croissant',
            'Plain Croissant',
            'Banana Bread',
            'Lemon cake',
            'Cinnamon Bun',
            'Cookie',
            'Spinach Feta Croissant'
        ];

        const weather = todayFc.weather;
        const weatherStr = weather ? ` · ${weather.emoji} ${weather.temp}°C ${weather.condition}` : '';

        let html = `<div style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border:2px solid #4caf50;border-radius:12px;padding:14px;margin-bottom:18px;">`;
        html += `<div style="font-weight:700;color:#1b5e20;font-size:15px;margin-bottom:4px;">📊 Today's Pastry Forecast</div>`;
        html += `<div style="font-size:12px;color:#2e7d32;margin-bottom:10px;font-style:italic;">Predicted sales for today — use this to confirm opening stock${weatherStr}</div>`;
        html += `<div style="display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;">`;

        let hasAny = false;
        for (const name of PASTRY_ITEMS) {
            const predicted = todayFc.items?.[name]?.predicted;
            if (!predicted && predicted !== 0) continue;
            hasAny = true;
            const bar = '█'.repeat(Math.min(predicted, 12));
            const barColor = predicted >= 8 ? '#1b5e20' : predicted >= 5 ? '#388e3c' : '#66bb6a';
            html += `<div style="font-size:13px;color:#333;padding:3px 0;">${name}</div>`;
            html += `<div style="font-size:13px;font-weight:700;color:#1b5e20;text-align:right;padding:3px 0;">×${predicted} <span style="font-size:10px;color:${barColor};">${bar}</span></div>`;
        }

        if (!hasAny) {
            html += `<div style="grid-column:1/-1;color:#666;font-size:13px;">No pastry forecast data for today.</div>`;
        }

        html += `</div>`;

        html += `</div>`;
        container.innerHTML = html;
    } catch (e) { console.error('Error loading opening pastry forecast:', e); }
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
    } else if (type === 'closing') {
        document.getElementById('checklistTitle').textContent = 'Closing Checklist';
        document.getElementById('closingBtn').classList.add('active');
        document.getElementById('closingChecklist').style.display = 'block';
        loadClosingFreezerPulls();
        loadClosingReconciliation();
    } else if (type === 'inventory') {
        document.getElementById('checklistTitle').textContent = 'Inventory Handover';
        document.getElementById('inventoryBtn').classList.add('active');
        document.getElementById('inventoryChecklist').style.display = 'block';
        // Show predicted usage hints
        loadInventoryPredictions();
    }
    
    // Scroll to checklist
    document.getElementById('checklistSection').scrollIntoView({ behavior: 'smooth' });
}

// Close checklist
function closeChecklist() {
    document.getElementById('checklistSection').style.display = 'none';
    document.getElementById('quickActions').style.display = 'flex';
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

// Login with nsec
document.getElementById('loginBtn').addEventListener('click', async () => {
    const nsecInput = document.getElementById('nsecInput').value.trim();
    
    if (!nsecInput) {
        alert('Please enter your nsec key');
        return;
    }
    
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginBtn').textContent = 'Logging in...';
    
    // Small delay to show loading state
    setTimeout(() => {
        try {
            // Decode nsec to get private key
            const decoded = NostrTools.nip19.decode(nsecInput);
            
            if (decoded.type !== 'nsec') {
                throw new Error('Invalid nsec key');
            }
            
            const privateKey = decoded.data;
            const publicKey = NostrTools.getPublicKey(privateKey);
            
            userKeys = { privateKey, publicKey };
            
            // Save to localStorage for persistence across sessions
            localStorage.setItem('nostr_nsec', nsecInput);
            localStorage.setItem('nostr_pubkey', publicKey);
            
            // Show logged in state
            showLoggedInState();
            
            // Clear input
            document.getElementById('nsecInput').value = '';
            
        } catch (error) {
            alert('Invalid nsec key. Please check and try again.');
            document.getElementById('loginBtn').disabled = false;
            document.getElementById('loginBtn').textContent = 'Login';
        }
    }, 500);
});

// Allow Enter key to login
document.getElementById('nsecInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('loginBtn').click();
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
        // Handle opening/closing checklist
        const checklistDiv = currentChecklist === 'opening' ? 
            document.getElementById('openingChecklist') : 
            document.getElementById('closingChecklist');
        
        const checkboxes = checklistDiv.querySelectorAll('input[type="checkbox"]');
        let completedCount = 0;
        
        checkboxes.forEach(checkbox => {
            const label = checkbox.nextElementSibling.textContent;
            const checked = checkbox.checked;
            items.push({ task: label, completed: checked });
            if (checked) completedCount++;
        });
        
        if (completedCount === 0) {
            alert('Please complete at least one task before submitting.');
            return;
        }
        
        contentData = {
            checklist: currentChecklist,
            timestamp: new Date().toISOString(),
            items: items,
            completionRate: `${completedCount}/${items.length}`
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
        }
    }
    
    try {
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('submitBtn').textContent = 'Submitting...';

        // POST to local API backend with NIP-98 Nostr auth
        await submitWithFallback(contentData);

        const successMsg = currentChecklist === 'inventory'
            ? '✅ Inventory handover saved!'
            : `✅ ${currentChecklist.charAt(0).toUpperCase() + currentChecklist.slice(1)} checklist saved! (${contentData.completionRate} tasks completed)`;

        showStatus('success', successMsg);

        // Refresh today's activity
        loadTodaysActivity();

        // Reset after successful submission
        setTimeout(() => {
            if (currentChecklist === 'inventory') {
                document.querySelectorAll('#inventoryChecklist input[type="number"]').forEach(input => input.value = 0);
            } else {
                document.querySelectorAll(`#${currentChecklist}Checklist input[type="checkbox"]`).forEach(cb => cb.checked = false);
            }
        }, 2000);

    } catch (error) {
        showStatus('error', 'Submission failed: ' + error.message);
    } finally {
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').textContent = 'Submit Checklist';
    }
});

// Publish event to Nostr relays
async function publishToRelays(event) {
    let successCount = 0;
    let errors = [];
    
    const promises = RELAYS.map(relay => {
        return new Promise((resolve) => {
            const ws = new WebSocket(relay);
            
            const timeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.CLOSED) {
                    ws.close();
                    errors.push(`${relay}: Timeout`);
                    resolve(false);
                }
            }, 5000);
            
            ws.onopen = () => {
                ws.send(JSON.stringify(['EVENT', event]));
            };
            
            ws.onmessage = (msg) => {
                const response = JSON.parse(msg.data);
                if (response[0] === 'OK') {
                    const [, eventId, success, message] = response;
                    clearTimeout(timeout);
                    ws.close();
                    
                    if (success) {
                        console.log(`✅ Published to ${relay}`);
                        successCount++;
                        resolve(true);
                    } else {
                        console.error(`❌ Rejected by ${relay}: ${message}`);
                        errors.push(`${relay}: ${message}`);
                        resolve(false);
                    }
                } else if (response[0] === 'NOTICE') {
                    clearTimeout(timeout);
                    ws.close();
                    console.error(`⚠️ Notice from ${relay}: ${response[1]}`);
                    errors.push(`${relay}: ${response[1]}`);
                    resolve(false);
                }
            };
            
            ws.onerror = (error) => {
                clearTimeout(timeout);
                console.error(`⚠️ Connection error: ${relay}`, error);
                errors.push(`${relay}: Connection failed`);
                resolve(false);
            };
        });
    });
    
    // Wait for all relays to respond
    await Promise.all(promises);
    
    console.log(`\n📊 Results: ${successCount}/${RELAYS.length} relays succeeded`);
    
    if (successCount === 0) {
        console.error('❌ All relays failed:', errors);
        showStatus('error', `❌ Failed to publish to any relay! Please check your connection and try again.`);
        // Add retry button
        const statusEl = document.getElementById('statusMessage');
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 Retry';
        retryBtn.style.cssText = 'margin-top:10px;padding:8px 20px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
        retryBtn.onclick = () => document.getElementById('submitBtn').click();
        statusEl.appendChild(retryBtn);
        throw new Error(`Failed to publish to any relay`);
    }
    
    if (errors.length > 0) {
        console.warn('⚠️  Some relays failed:', errors);
    }
    
    return successCount;
}

// Verify event was stored on at least one relay
async function verifyEventOnRelay(eventId) {
    const statusEl = document.getElementById('statusMessage');
    for (const relay of RELAYS) {
        try {
            const verified = await new Promise((resolve) => {
                const ws = new WebSocket(relay);
                const timeout = setTimeout(() => { ws.close(); resolve(false); }, 5000);
                ws.onopen = () => {
                    const subId = 'verify-' + Math.random().toString(36).substring(7);
                    ws.send(JSON.stringify(['REQ', subId, { ids: [eventId], limit: 1 }]));
                };
                ws.onmessage = (msg) => {
                    const data = JSON.parse(msg.data);
                    if (data[0] === 'EVENT' && data[2] && data[2].id === eventId) {
                        clearTimeout(timeout); ws.close(); resolve(true);
                    } else if (data[0] === 'EOSE') {
                        clearTimeout(timeout); ws.close(); resolve(false);
                    }
                };
                ws.onerror = () => { clearTimeout(timeout); resolve(false); };
            });
            if (verified) {
                if (statusEl && statusEl.style.display !== 'none') {
                    statusEl.textContent += ' — ✅ Verified on relay';
                }
                console.log(`✅ Event verified on ${relay}`);
                return true;
            }
        } catch (e) {}
    }
    if (statusEl && statusEl.style.display !== 'none') {
        statusEl.textContent += ' — ⚠️ Could not verify on relays';
    }
    return false;
}

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
