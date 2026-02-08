// Status page - Load and display checklist submissions
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.mutinywallet.com'
];

// Load submissions on page load
window.addEventListener('DOMContentLoaded', async () => {
    if (typeof NostrTools === 'undefined') {
        document.getElementById('loading').textContent = 'Error: NostrTools not loaded';
        return;
    }
    
    await loadSubmissions();
});

async function loadSubmissions() {
    try {
        // Fetch last 30 days of submissions
        const since = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
        
        // Try multiple filter strategies
        console.log('🔍 Strategy 1: Filter by shop tag');
        let filter = {
            kinds: [30078],
            '#shop': ['trails-coffee'],
            since: since,
            limit: 100
        };
        
        let events = await fetchEventsFromRelays(filter);
        
        // If no results, try without the shop tag filter
        if (events.length === 0) {
            console.log('🔍 Strategy 2: All kind 30078 events');
            filter = {
                kinds: [30078],
                since: since,
                limit: 100
            };
            events = await fetchEventsFromRelays(filter);
            
            // Filter manually for trails-coffee
            events = events.filter(e => {
                const shopTag = e.tags.find(t => t[0] === 'shop');
                return shopTag && shopTag[1] === 'trails-coffee';
            });
        }
        
        console.log(`📊 Final result: ${events.length} events`);
        
        if (events.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            return;
        }
        
        // Group by date
        const groupedByDate = groupEventsByDate(events);
        
        // Render
        renderSubmissions(groupedByDate);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('statusContent').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        document.getElementById('loading').textContent = 'Error loading submissions: ' + error.message;
    }
}

async function fetchEventsFromRelays(filter) {
    const allEvents = [];
    
    console.log('🔍 Fetching with filter:', filter);
    
    for (const relayUrl of RELAYS) {
        try {
            console.log(`Connecting to ${relayUrl}...`);
            const ws = new WebSocket(relayUrl);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn(`⏱️  Timeout for ${relayUrl}`);
                    ws.close();
                    resolve();
                }, 8000); // Increased timeout to 8 seconds
                
                ws.onopen = () => {
                    const subId = Math.random().toString(36).substring(7);
                    const req = ['REQ', subId, filter];
                    console.log(`📤 Sending to ${relayUrl}:`, req);
                    ws.send(JSON.stringify(req));
                    
                    ws.onmessage = (msg) => {
                        const [type, subscriptionId, event] = JSON.parse(msg.data);
                        if (type === 'EVENT') {
                            console.log(`📨 Received event from ${relayUrl}:`, event.id);
                            // Check if we already have this event
                            if (!allEvents.find(e => e.id === event.id)) {
                                allEvents.push(event);
                            }
                        } else if (type === 'EOSE') {
                            console.log(`✅ EOSE from ${relayUrl}, total events: ${allEvents.length}`);
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        } else if (type === 'NOTICE') {
                            console.warn(`⚠️  Notice from ${relayUrl}:`, event);
                        }
                    };
                };
                
                ws.onerror = (error) => {
                    console.error(`❌ Error connecting to ${relayUrl}:`, error);
                    clearTimeout(timeout);
                    resolve();
                };
            });
        } catch (error) {
            console.warn(`⚠️  Relay ${relayUrl} failed:`, error);
            continue;
        }
    }
    
    console.log(`\n📊 Total unique events found: ${allEvents.length}`);
    return allEvents;
}

function groupEventsByDate(events) {
    const grouped = {};
    
    events.forEach(event => {
        const date = new Date(event.created_at * 1000);
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        
        grouped[dateKey].push(event);
    });
    
    // Sort each day's events by time
    Object.keys(grouped).forEach(dateKey => {
        grouped[dateKey].sort((a, b) => a.created_at - b.created_at);
    });
    
    return grouped;
}

function renderSubmissions(groupedByDate) {
    const container = document.getElementById('statusContent');
    container.innerHTML = '';
    
    // Get dates sorted (newest first)
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
            entriesDiv.appendChild(entry);
        });
        
        dateSection.appendChild(dateHeader);
        dateSection.appendChild(entriesDiv);
        container.appendChild(dateSection);
    });
}

function createEntryElement(event) {
    const entry = document.createElement('div');
    entry.className = 'checklist-entry';
    entry.onclick = () => viewDetails(event);
    
    const content = JSON.parse(event.content);
    const checklistType = content.checklist;
    const timestamp = new Date(event.created_at * 1000);
    
    const typeLabels = {
        'opening': '🌅 Opening Checklist',
        'closing': '🌙 Closing Checklist',
        'inventory': '📦 Inventory Handover'
    };
    
    const info = document.createElement('div');
    info.className = 'entry-info';
    
    const type = document.createElement('div');
    type.className = 'entry-type';
    type.textContent = typeLabels[checklistType] || checklistType;
    
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
        const completionRate = content.completionRate || 'N/A';
        badge.textContent = completionRate;
    }
    
    entry.appendChild(info);
    entry.appendChild(badge);
    
    return entry;
}

function viewDetails(event) {
    // Store event in sessionStorage and navigate to detail page
    sessionStorage.setItem('checklistDetail', JSON.stringify(event));
    window.location.href = 'detail.html';
}

function formatDate(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return `Today - ${dayName}, ${month} ${day}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday - ${dayName}, ${month} ${day}`;
    } else {
        return `${dayName}, ${month} ${day}, ${year}`;
    }
}

function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes} ${ampm}`;
}
