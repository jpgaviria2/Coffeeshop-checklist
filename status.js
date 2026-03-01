// Status page - Load and display checklist submissions
// Auto-authenticates if user is already logged in as a manager (JP/Charlene)
// Falls back to shop management nsec prompt if needed
// Uses EVENT_CACHE for instant display + background relay updates

const SHOP_MGMT_PUBKEY = 'c1a9ea801212d71b39146d2d867f8744000cab935d062dce6756eac8ad408c72';

// Manager pubkeys — only these users can view submissions
const MANAGER_PUBKEYS = [
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9', // Charlene
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f', // Charlene
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

let mgmtPrivateKey = null;

window.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for saved management key first
    const savedMgmtNsec = localStorage.getItem('nostr_mgmt_nsec');
    if (savedMgmtNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedMgmtNsec);
            if (decoded.type === 'nsec') {
                const pubkey = NostrTools.getPublicKey(decoded.data);
                if (pubkey === SHOP_MGMT_PUBKEY) {
                    mgmtPrivateKey = decoded.data;
                    showManagerView();
                    return;
                }
            }
        } catch (e) {
            localStorage.removeItem('nostr_mgmt_nsec');
        }
    }

    // 2. Check if the user is already logged in on the main page
    const savedNsec = localStorage.getItem('nostr_nsec');
    if (savedNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedNsec);
            if (decoded.type === 'nsec') {
                const pubkey = NostrTools.getPublicKey(decoded.data);
                
                // If their staff key IS the management key, auto-unlock
                if (pubkey === SHOP_MGMT_PUBKEY) {
                    mgmtPrivateKey = decoded.data;
                    localStorage.setItem('nostr_mgmt_nsec', savedNsec);
                    showManagerView();
                    return;
                }
                
                // If they're a known manager, show simplified unlock
                if (MANAGER_PUBKEYS.includes(pubkey)) {
                    const staffName = STAFF_NAMES[pubkey] || 'Manager';
                    showManagerUnlock(staffName);
                    return;
                }
                
                // Regular staff — no access
                showAccessDenied();
                return;
            }
        } catch (e) {
            // Fall through to login
        }
    }

    // 3. Not logged in at all
    showLoginRequired();
});

function showLoginRequired() {
    document.getElementById('loading').style.display = 'none';
    const container = document.getElementById('statusContent');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <h2 style="color:#667eea;margin-bottom:15px;">🔒 Login Required</h2>
            <p style="color:#666;margin-bottom:20px;">Please log in on the <a href="index.html" style="color:#667eea;">Checklists</a> page first, then come back here.</p>
        </div>
    `;
}

function showAccessDenied() {
    document.getElementById('loading').style.display = 'none';
    const container = document.getElementById('statusContent');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <h2 style="color:#dc3545;margin-bottom:15px;">🚫 Manager Access Only</h2>
            <p style="color:#666;">This page is only available to managers.</p>
        </div>
    `;
}

function showManagerUnlock(staffName) {
    document.getElementById('loading').style.display = 'none';
    const container = document.getElementById('statusContent');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
            <h2 style="color:#667eea;margin-bottom:10px;">👋 Hey ${staffName}</h2>
            <p style="color:#666;margin-bottom:20px;">Enter the shop management key to view all submissions</p>
            <div style="max-width:400px;margin:0 auto;">
                <input type="password" id="mgmtNsecInput" placeholder="nsec1..." 
                    style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:monospace;margin-bottom:15px;">
                <button onclick="managerLogin()" 
                    style="width:100%;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">
                    🔓 Unlock Submissions
                </button>
                <p id="mgmtLoginError" style="color:#dc3545;margin-top:10px;display:none;"></p>
            </div>
        </div>
    `;
}

function managerLogin() {
    const nsecInput = document.getElementById('mgmtNsecInput').value.trim();
    const errorEl = document.getElementById('mgmtLoginError');
    try {
        const decoded = NostrTools.nip19.decode(nsecInput);
        if (decoded.type !== 'nsec') throw new Error('Not an nsec');
        const pubkey = NostrTools.getPublicKey(decoded.data);
        if (pubkey !== SHOP_MGMT_PUBKEY) {
            errorEl.textContent = 'This is not the shop management key.';
            errorEl.style.display = 'block';
            return;
        }
        mgmtPrivateKey = decoded.data;
        localStorage.setItem('nostr_mgmt_nsec', nsecInput);
        showManagerView();
    } catch (e) {
        errorEl.textContent = 'Invalid nsec key.';
        errorEl.style.display = 'block';
    }
}

async function showManagerView() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').textContent = 'Decrypting submissions...';
    document.getElementById('statusContent').style.display = 'none';
    document.getElementById('statusContent').innerHTML = '';
    await loadSubmissions();
}

async function loadSubmissions() {
    try {
        const cachedEvents = await EVENT_CACHE.getAllEvents();
        
        if (cachedEvents.length > 0) {
            const decrypted = await decryptEvents(cachedEvents);
            const grouped = groupEventsByDate(decrypted);
            renderSubmissions(grouped);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('statusContent').style.display = 'block';
            showUpdateIndicator();
        }
        
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
        document.getElementById('loading').textContent = 'Error loading submissions: ' + error.message;
    }
}

async function decryptEvents(events) {
    const results = [];
    for (const event of events) {
        try {
            let contentStr = event.content;
            if (event.kind === 4 && mgmtPrivateKey) {
                contentStr = await NostrTools.nip04.decrypt(
                    mgmtPrivateKey, event.pubkey, event.content
                );
            }
            results.push({ ...event, _decryptedContent: contentStr });
        } catch (e) {
            // Try parsing as plain JSON (legacy kind 30078 events)
            try {
                JSON.parse(event.content);
                results.push({ ...event, _decryptedContent: event.content });
            } catch (e2) {
                // truly unreadable, skip
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
    
    // Add lock button at top
    const lockBar = document.createElement('div');
    lockBar.style.cssText = 'text-align:right;padding:10px;';
    lockBar.innerHTML = '<button onclick="managerLogout()" style="background:#dc3545;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;">🔒 Lock</button>';
    container.appendChild(lockBar);
    
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

function managerLogout() {
    localStorage.removeItem('nostr_mgmt_nsec');
    mgmtPrivateKey = null;
    location.reload();
}

function createEntryElement(event) {
    try {
        const content = JSON.parse(event._decryptedContent || event.content);
        const checklistType = content.checklist;
        const timestamp = new Date(event.created_at * 1000);
        const staffName = STAFF_NAMES[event.pubkey] || event.pubkey.substring(0, 8);
        
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
