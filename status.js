// Status page - Load and display checklist submissions
// Managers (JP, Charlene, Dayi) get auto-access with their own nsec
// Reads from local API backend (api.trailscoffee.com) via NIP-98 auth

const SHOP_MGMT_PUBKEY = 'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2';
const API_BASE = 'https://api.trailscoffee.com';

// NIP-98 HTTP Auth helper for status page
async function buildNostrAuthHeader(method, url) {
    if (!userPrivateKey) throw new Error('Not logged in');
    const authEvent = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['u', url], ['method', method]],
        content: ''
    };
    const signed = NostrTools.finalizeEvent(authEvent, userPrivateKey);
    return 'Nostr ' + btoa(JSON.stringify(signed));
}

// Manager pubkeys — these users can view the status page
const MANAGER_PUBKEYS = [
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9', // Charlene
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f', // Charlene
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayana
];

// Staff name mapping (for display)
const STAFF_NAMES = {
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'JP',
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba': 'JP',
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9': 'Charlene',
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f': 'Charlene',
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911': 'Dayana',
    '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f': 'Aziza',
    'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93': 'Amanda',
    'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2': 'Ruby',
    '796a1d1c5267e3c857b9e426d3b6ef3e687323ad5f7cf66aaa14edc76421048c': 'Deya',
    'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2': 'JP',
    '2205bd42b0fdfab6ab2ecba660212ead17775fd6d4b94616b2c9ff52cfd2073a': 'Itzel'
};

let userPrivateKey = null;
let userPubkey = null;
let userName = null;

window.addEventListener('DOMContentLoaded', async () => {
    const savedNsec = localStorage.getItem('nostr_nsec');
    if (savedNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedNsec);
            if (decoded.type === 'nsec') {
                userPubkey = NostrTools.getPublicKey(decoded.data);
                userPrivateKey = decoded.data;
                userName = STAFF_NAMES[userPubkey] || userPubkey.substring(0, 8);
                showManagerView();
                return;
            }
        } catch (e) {
            // Fall through
        }
    }
    showLoginRequired();
});

function showLoginRequired() {
    document.getElementById('loading').style.display = 'none';
    const container = document.getElementById('statusContent');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <div style="font-size:48px;margin-bottom:15px;">🔒</div>
            <h2 style="color:#667eea;margin-bottom:15px;">Login Required</h2>
            <p style="color:#666;margin-bottom:20px;">Please log in on the <a href="index.html" style="color:#667eea;font-weight:600;">Checklists</a> page first.</p>
        </div>
    `;
}

function showAccessDenied() {
    document.getElementById('loading').style.display = 'none';
    const container = document.getElementById('statusContent');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <div style="font-size:48px;margin-bottom:15px;">🚫</div>
            <h2 style="color:#dc3545;margin-bottom:15px;">Manager Access Only</h2>
            <p style="color:#666;">This page is only available to managers.</p>
        </div>
    `;
}

async function showManagerView() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').textContent = 'Loading submissions...';
    document.getElementById('statusContent').style.display = 'none';
    document.getElementById('statusContent').innerHTML = '';
    await loadSubmissions();
}

async function loadSubmissions() {
    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').textContent = 'Loading submissions...';

        const url = `${API_BASE}/api/v1/submissions?limit=200`;
        const authHeader = await buildNostrAuthHeader('GET', url);

        const response = await fetch(url, {
            headers: { 'Authorization': authHeader }
        });

        if (response.status === 403) {
            showAccessDenied();
            return;
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.submissions || data.submissions.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            return;
        }

        // Convert API format to grouped-by-date format for renderSubmissions()
        const grouped = {};
        for (const sub of data.submissions) {
            const dateKey = sub.submittedAt.substring(0, 10);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push({
                pubkey: sub.staffPubkey,
                created_at: Math.floor(new Date(sub.submittedAt).getTime() / 1000),
                _decryptedContent: JSON.stringify(sub.content),
                _encrypted: false,
                _staffName: sub.staffName,
                _apiId: sub.id
            });
        }

        renderSubmissions(grouped);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('statusContent').style.display = 'block';

    } catch (error) {
        console.error('Error loading submissions:', error);
        document.getElementById('loading').textContent = 'Error loading: ' + error.message;
    }
}

async function decryptEvents(events) {
    const results = [];
    for (const event of events) {
        try {
            let contentStr = event.content;
            let decrypted = false;

            if (event.kind === 4 && userPrivateKey) {
                // Try decrypting as recipient (user's privkey + sender's pubkey)
                try {
                    contentStr = await NostrTools.nip04.decrypt(
                        userPrivateKey, event.pubkey, event.content
                    );
                    decrypted = true;
                } catch (e) { /* fall through */ }

                // Try decrypting as sender (user's privkey + shop pubkey)
                if (!decrypted) {
                    try {
                        contentStr = await NostrTools.nip04.decrypt(
                            userPrivateKey, SHOP_MGMT_PUBKEY, event.content
                        );
                        decrypted = true;
                    } catch (e) { /* can't decrypt */ }
                }

                if (!decrypted) {
                    // Mark as encrypted — we'll show metadata only
                    results.push({ 
                        ...event, 
                        _decryptedContent: null, 
                        _encrypted: true 
                    });
                    continue;
                }
            }

            results.push({ ...event, _decryptedContent: contentStr, _encrypted: false });
        } catch (e) {
            // Try as plain JSON (legacy kind 30078)
            try {
                JSON.parse(event.content);
                results.push({ ...event, _decryptedContent: event.content, _encrypted: false });
            } catch (e2) {
                // skip
            }
        }
    }
    return results;
}

function showUpdateIndicator() {
    let indicator = document.getElementById('updateIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'updateIndicator';
        indicator.style.cssText = 'text-align:center;padding:8px;color:#999;font-size:12px;';
        indicator.textContent = '🔄 Checking for new submissions...';
        const container = document.getElementById('statusContent');
        if (container) container.parentElement.insertBefore(indicator, container);
    }
    indicator.style.display = 'block';
}

function hideUpdateIndicator() {
    const indicator = document.getElementById('updateIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function groupEventsByDate(events) {
    const grouped = {};
    
    events.forEach(event => {
        // Skip events we couldn't decrypt at all
        if (event._encrypted && !event._decryptedContent) {
            // Still include encrypted events — show metadata
            const date = new Date(event.created_at * 1000);
            const dateKey = date.toISOString().split('T')[0];
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(event);
            return;
        }

        try {
            const content = JSON.parse(event._decryptedContent || event.content);
            if (content.timeclock) return;
            if (!content.checklist) return;
        } catch (e) {
            return;
        }
        
        const date = new Date(event.created_at * 1000);
        const dateKey = date.toISOString().split('T')[0];
        
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(event);
    });
    
    Object.keys(grouped).forEach(dateKey => {
        grouped[dateKey].sort((a, b) => a.created_at - b.created_at);
    });
    
    return grouped;
}

function renderSubmissions(groupedByDate) {
    const container = document.getElementById('statusContent');
    container.innerHTML = '';
    
    // Top bar with user info and optional unlock
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 15px;border-bottom:1px solid #eee;';
    
    const greeting = document.createElement('span');
    greeting.style.cssText = 'font-weight:600;color:#333;font-size:14px;';
    greeting.textContent = `👋 ${userName}`;
    topBar.appendChild(greeting);
    
    const fullBadge = document.createElement('span');
    fullBadge.style.cssText = 'background:#28a745;color:white;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;';
    fullBadge.textContent = '✅ All Staff';
    topBar.appendChild(fullBadge);
    
    container.appendChild(topBar);

    const dates = Object.keys(groupedByDate).sort().reverse();
    
    if (dates.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        return;
    }
    
    dates.forEach(dateKey => {
        const events = groupedByDate[dateKey];
        
        const dateSection = document.createElement('div');
        dateSection.className = 'date-section';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = formatDate(new Date(dateKey));
        
        const entriesDiv = document.createElement('div');
        entriesDiv.className = 'checklist-entries';
        
        events.forEach(event => {
            const entry = createEntryElement(event);
            if (entry) entriesDiv.appendChild(entry);
        });
        
        dateSection.appendChild(dateHeader);
        dateSection.appendChild(entriesDiv);
        container.appendChild(dateSection);
    });
}

function createEntryElement(event) {
    const timestamp = new Date(event.created_at * 1000);
    const staffName = STAFF_NAMES[event.pubkey] || event.pubkey.substring(0, 8);

    // Encrypted event we couldn't decrypt
    if (event._encrypted && !event._decryptedContent) {
        const entry = document.createElement('div');
        entry.className = 'checklist-entry';
        entry.style.opacity = '0.6';
        
        const info = document.createElement('div');
        info.className = 'entry-info';
        
        const type = document.createElement('div');
        type.className = 'entry-type';
        type.textContent = `🔒 Submission — ${staffName}`;
        
        const time = document.createElement('div');
        time.className = 'entry-time';
        time.textContent = formatTime(timestamp) + ' (encrypted)';
        
        info.appendChild(type);
        info.appendChild(time);
        entry.appendChild(info);
        
        const badge = document.createElement('div');
        badge.className = 'entry-badge';
        badge.style.cssText = 'background:#999;color:white;padding:4px 12px;border-radius:12px;font-size:12px;';
        badge.textContent = '🔒';
        entry.appendChild(badge);
        
        return entry;
    }

    try {
        const content = JSON.parse(event._decryptedContent || event.content);
        const checklistType = content.checklist;
        
        if (!checklistType) return null;
        if (content.timeclock) return null;
        
        const entry = document.createElement('div');
        entry.className = 'checklist-entry';
        entry.onclick = () => viewDetails(event);
        
        const typeLabels = {
            'opening': '🌅 Opening',
            'closing': '🌙 Closing',
            'inventory': '📦 Inventory'
        };
        
        const info = document.createElement('div');
        info.className = 'entry-info';
        
        const type = document.createElement('div');
        type.className = 'entry-type';
        type.textContent = (typeLabels[checklistType] || checklistType) + ' — ' + staffName;
        
        const time = document.createElement('div');
        time.className = 'entry-time';
        time.textContent = formatTime(timestamp);
        
        info.appendChild(type);
        info.appendChild(time);
        
        const badge = document.createElement('div');
        badge.className = `entry-badge badge-${checklistType}`;
        
        if (checklistType === 'inventory') {
            badge.textContent = 'View →';
        } else {
            badge.textContent = content.completionRate || 'N/A';
        }
        
        entry.appendChild(info);
        entry.appendChild(badge);
        return entry;
    } catch (e) {
        return null;
    }
}

function viewDetails(event) {
    const detailEvent = { ...event };
    if (event._decryptedContent) {
        detailEvent.content = event._decryptedContent;
    }
    sessionStorage.setItem('checklistDetail', JSON.stringify(detailEvent));
    window.location.href = 'detail.html';
}

function formatDate(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return `Today - ${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday - ${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    } else {
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
}

function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${(hours % 12) || 12}:${minutes} ${ampm}`;
}
