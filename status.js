// Status page - Load and display checklist submissions
// Managers (JP, Charlene, Dayi) get auto-access with their own nsec
// Own submissions decrypt with own key; shop mgmt key unlocks ALL submissions

const SHOP_MGMT_PUBKEY = 'c1a9ea801212d71b39146d2d867f8744000cab935d062dce6756eac8ad408c72';

// Manager pubkeys — these users can view the status page
const MANAGER_PUBKEYS = [
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9', // Charlene
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f', // Charlene
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayi
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b', // Dayi
];

// Staff name mapping (for display)
const STAFF_NAMES = {
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'JP',
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba': 'JP',
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9': 'Charlene',
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f': 'Charlene',
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911': 'Dayi',
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b': 'Dayi',
    '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f': 'Aziza',
    'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93': 'Amanda',
    'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2': 'Ruby'
};

let mgmtPrivateKey = null;  // Shop management key (decrypts ALL submissions)
let userPrivateKey = null;   // Logged-in user's key (decrypts OWN submissions)
let userPubkey = null;
let userName = null;

window.addEventListener('DOMContentLoaded', async () => {
    // 1. Try to get mgmt key from localStorage (previously saved)
    const savedMgmtNsec = localStorage.getItem('nostr_mgmt_nsec');
    if (savedMgmtNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedMgmtNsec);
            if (decoded.type === 'nsec') {
                const pubkey = NostrTools.getPublicKey(decoded.data);
                if (pubkey === SHOP_MGMT_PUBKEY) {
                    mgmtPrivateKey = decoded.data;
                }
            }
        } catch (e) {
            localStorage.removeItem('nostr_mgmt_nsec');
        }
    }

    // 2. Check user's staff login
    const savedNsec = localStorage.getItem('nostr_nsec');
    if (savedNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedNsec);
            if (decoded.type === 'nsec') {
                userPubkey = NostrTools.getPublicKey(decoded.data);
                userPrivateKey = decoded.data;
                userName = STAFF_NAMES[userPubkey] || userPubkey.substring(0, 8);

                // If user's key IS the management key
                if (userPubkey === SHOP_MGMT_PUBKEY) {
                    mgmtPrivateKey = decoded.data;
                }

                // Any logged-in user can view status
                // NIP-04 encryption handles access control — you only see what your key decrypts
                showManagerView();
                return;
            }
        } catch (e) {
            // Fall through
        }
    }

    // 3. Not logged in
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
        // Show cached data first
        const cachedEvents = await EVENT_CACHE.getAllEvents();
        
        if (cachedEvents.length > 0) {
            const decrypted = await decryptEvents(cachedEvents);
            const grouped = groupEventsByDate(decrypted);
            renderSubmissions(grouped);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('statusContent').style.display = 'block';
            showUpdateIndicator();
        }
        
        // Then fetch fresh from relay
        await RELAY_FETCHER.fetchFromRelays();
        
        const allEvents = await EVENT_CACHE.getAllEvents();
        
        if (allEvents.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            hideUpdateIndicator();
            return;
        }
        
        const decrypted = await decryptEvents(allEvents);
        const grouped = groupEventsByDate(decrypted);
        renderSubmissions(grouped);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('statusContent').style.display = 'block';
        hideUpdateIndicator();
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        const cachedEvents = await EVENT_CACHE.getAllEvents();
        if (cachedEvents.length > 0) {
            hideUpdateIndicator();
            return;
        }
        document.getElementById('loading').textContent = 'Error: ' + error.message;
    }
}

async function decryptEvents(events) {
    const results = [];
    for (const event of events) {
        try {
            let contentStr = event.content;
            let decrypted = false;

            if (event.kind === 4) {
                // Try 1: Use shop management key (decrypts everything)
                if (mgmtPrivateKey) {
                    try {
                        contentStr = await NostrTools.nip04.decrypt(
                            mgmtPrivateKey, event.pubkey, event.content
                        );
                        decrypted = true;
                    } catch (e) { /* fall through */ }
                }

                // Try 2: Use logged-in user's key to decrypt
                // Works for own submissions AND if the user IS the mgmt key holder
                if (!decrypted && userPrivateKey) {
                    // Try decrypting as recipient (user's privkey + sender's pubkey)
                    try {
                        contentStr = await NostrTools.nip04.decrypt(
                            userPrivateKey, event.pubkey, event.content
                        );
                        decrypted = true;
                    } catch (e) { /* fall through */ }

                    // Try decrypting as sender (user's privkey + mgmt pubkey)
                    if (!decrypted) {
                        try {
                            contentStr = await NostrTools.nip04.decrypt(
                                userPrivateKey, SHOP_MGMT_PUBKEY, event.content
                            );
                            decrypted = true;
                        } catch (e) { /* can't decrypt */ }
                    }
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
        EVENT_CACHE.getCount().then(c => {
            indicator.textContent = `✅ ${c} submissions cached`;
            setTimeout(() => { indicator.style.display = 'none'; }, 2000);
        });
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
    
    if (!mgmtPrivateKey) {
        // Show unlock button for full access
        const unlockBtn = document.createElement('button');
        unlockBtn.style.cssText = 'background:#667eea;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;';
        unlockBtn.textContent = '🔑 Unlock All Staff';
        unlockBtn.onclick = showUnlockModal;
        topBar.appendChild(unlockBtn);
    } else {
        const fullBadge = document.createElement('span');
        fullBadge.style.cssText = 'background:#28a745;color:white;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;';
        fullBadge.textContent = '✅ Full Access';
        topBar.appendChild(fullBadge);
    }
    
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

function showUnlockModal() {
    const modal = document.createElement('div');
    modal.id = 'unlockModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:12px;padding:25px;max-width:400px;width:100%;">
            <h3 style="color:#667eea;margin-bottom:10px;">🔑 Unlock All Submissions</h3>
            <p style="color:#666;font-size:14px;margin-bottom:15px;">Enter the shop management key to see submissions from all staff.</p>
            <input type="password" id="unlockNsecInput" placeholder="nsec1..." 
                style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:monospace;margin-bottom:10px;">
            <p id="unlockError" style="color:#dc3545;font-size:13px;display:none;margin-bottom:10px;"></p>
            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('unlockModal').remove()" 
                    style="flex:1;padding:10px;background:#e0e0e0;color:#333;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Cancel</button>
                <button onclick="doUnlock()" 
                    style="flex:1;padding:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Unlock</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('unlockNsecInput').focus();
}

function doUnlock() {
    const nsecInput = document.getElementById('unlockNsecInput').value.trim();
    const errorEl = document.getElementById('unlockError');
    try {
        const decoded = NostrTools.nip19.decode(nsecInput);
        if (decoded.type !== 'nsec') throw new Error('Not an nsec');
        const pubkey = NostrTools.getPublicKey(decoded.data);
        if (pubkey !== SHOP_MGMT_PUBKEY) {
            errorEl.textContent = 'Not the shop management key.';
            errorEl.style.display = 'block';
            return;
        }
        mgmtPrivateKey = decoded.data;
        localStorage.setItem('nostr_mgmt_nsec', nsecInput);
        document.getElementById('unlockModal').remove();
        // Reload with full access
        showManagerView();
    } catch (e) {
        errorEl.textContent = 'Invalid nsec key.';
        errorEl.style.display = 'block';
    }
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
