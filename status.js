// Status page - Load and display checklist submissions
// Uses EVENT_CACHE for instant display + background relay updates

// Staff name mapping (for display)
const STAFF_NAMES = {
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'JP',
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba': 'JP',
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9': 'Charlene',
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911': 'Dayi',
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b': 'Dayi',
    '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f': 'Aziza',
    'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93': 'Amanda',
    'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2': 'Ruby'
};

window.addEventListener('DOMContentLoaded', async () => {
    await loadSubmissions();
});

async function loadSubmissions() {
    try {
        // 1. Show cached data INSTANTLY
        const cachedEvents = await EVENT_CACHE.getAllEvents();
        
        if (cachedEvents.length > 0) {
            console.log(`⚡ Showing ${cachedEvents.length} cached events instantly`);
            const grouped = groupEventsByDate(cachedEvents);
            renderSubmissions(grouped);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('statusContent').style.display = 'block';
            
            // Show a subtle "updating..." indicator
            showUpdateIndicator();
        }
        
        // 2. Wait for background fetch to complete (already started by event-cache.js)
        await RELAY_FETCHER.fetchFromRelays();
        
        // 3. Re-render with fresh data
        const allEvents = await EVENT_CACHE.getAllEvents();
        console.log(`🔄 Refreshed: ${allEvents.length} total events`);
        
        if (allEvents.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            hideUpdateIndicator();
            return;
        }
        
        const grouped = groupEventsByDate(allEvents);
        renderSubmissions(grouped);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('statusContent').style.display = 'block';
        hideUpdateIndicator();
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        // If relay fetch fails but we have cache, that's fine
        const cachedEvents = await EVENT_CACHE.getAllEvents();
        if (cachedEvents.length > 0) {
            hideUpdateIndicator();
            return; // Already showing cached data
        }
        document.getElementById('loading').textContent = 'Error loading submissions: ' + error.message;
    }
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
        const count = EVENT_CACHE.getCount().then(c => {
            indicator.textContent = `✅ ${c} submissions cached`;
            setTimeout(() => { indicator.style.display = 'none'; }, 2000);
        });
    }
}

function groupEventsByDate(events) {
    const grouped = {};
    
    events.forEach(event => {
        try {
            const content = JSON.parse(event.content);
            // Skip timeclock events — only show checklists
            if (content.timeclock) return;
            // Must have a checklist type
            if (!content.checklist) return;
        } catch (e) {
            return; // Skip invalid events
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
    
    const dates = Object.keys(groupedByDate).sort().reverse();
    
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
    try {
        const content = JSON.parse(event.content);
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
    sessionStorage.setItem('checklistDetail', JSON.stringify(event));
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
