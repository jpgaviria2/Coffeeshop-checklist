// Nostr Checklist App - Mobile-friendly with direct nsec login + Schedule viewer
// Using global NostrTools from CDN

let userKeys = null;
let currentChecklist = 'opening';
let currentWeekOffset = 0; // 0 = this week, 1 = next week, -1 = last week

// Nostr relay configuration
const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
];

// Load schedule on page load
window.addEventListener('DOMContentLoaded', () => {
    // Load schedule
    loadSchedule(0);
    
    // Check for saved login
    if (typeof NostrTools === 'undefined') {
        console.error('NostrTools not loaded');
        showStatus('error', 'Error loading app. Please refresh the page.');
        return;
    }
    
    const savedNsec = sessionStorage.getItem('nostr_nsec');
    if (savedNsec) {
        try {
            const decoded = NostrTools.nip19.decode(savedNsec);
            userKeys = {
                privateKey: decoded.data,
                publicKey: NostrTools.getPublicKey(decoded.data)
            };
            showChecklistSection();
        } catch (error) {
            sessionStorage.removeItem('nostr_nsec');
        }
    }
});

// Schedule functions
function changeWeek(direction) {
    currentWeekOffset += direction;
    loadSchedule(currentWeekOffset);
}

function loadSchedule(weekOffset) {
    const startDate = new Date(SCHEDULE_DATA.startDate);
    startDate.setDate(startDate.getDate() + (weekOffset * 7));
    
    // Calculate which week pattern (A or B)
    const weeksFromStart = Math.floor((startDate - new Date(SCHEDULE_DATA.startDate)) / (7 * 24 * 60 * 60 * 1000));
    const weekPattern = weeksFromStart % 2 === 0 ? 'weekA' : 'weekB';
    const weekData = SCHEDULE_DATA.rotation[weekPattern];
    
    // Update week label
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    
    document.getElementById('weekLabel').textContent = weekData.label;
    document.getElementById('dateRange').textContent = formatDateRange(startDate, endDate);
    
    // Generate schedule grid
    const scheduleGrid = document.getElementById('scheduleGrid');
    scheduleGrid.innerHTML = '';
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    days.forEach((day, index) => {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + index);
        const dateStr = dayDate.toISOString().split('T')[0];
        
        const shift = weekData.pattern[day];
        const exception = SCHEDULE_DATA.exceptions[dateStr];
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'schedule-day';
        
        let helpersHtml = '';
        if (shift.helpers && shift.helpers.length > 0) {
            helpersHtml = '<br>' + shift.helpers.map(h => 
                `<span class="helper-shift">+ ${h}</span>`
            ).join('<br>');
        }
        
        let exceptionHtml = '';
        if (exception) {
            exceptionHtml = `<br><span style="color: #dc3545; font-size: 12px;">⚠️ ${exception.note}</span>`;
        }
        
        dayDiv.innerHTML = `
            <div class="day-header">
                <span class="day-name">${dayNames[index]}</span>
                <span class="day-date">${formatDate(dayDate)}</span>
            </div>
            <div class="day-shifts">
                <span class="lead-shift">${shift.lead}</span>
                <span class="hours-badge">${SCHEDULE_DATA.shopHours}</span>
                ${helpersHtml}
                ${exceptionHtml}
            </div>
        `;
        
        scheduleGrid.appendChild(dayDiv);
    });
}

function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDateRange(start, end) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`;
}

// Show checklist section
function showChecklistSection() {
    document.getElementById('checklistSection').style.display = 'block';
}

// Login with nsec
document.getElementById('loginBtn').addEventListener('click', async () => {
    const nsecInput = document.getElementById('nsecInput').value.trim();
    
    if (!nsecInput) {
        showStatus('error', 'Please enter your nsec key');
        return;
    }
    
    try {
        document.getElementById('loginBtn').disabled = true;
        document.getElementById('loginBtn').textContent = 'Logging in...';
        
        // Decode nsec to get private key
        const decoded = NostrTools.nip19.decode(nsecInput);
        
        if (decoded.type !== 'nsec') {
            throw new Error('Invalid nsec key');
        }
        
        const privateKey = decoded.data;
        const publicKey = NostrTools.getPublicKey(privateKey);
        
        userKeys = { privateKey, publicKey };
        
        // Save to session storage
        sessionStorage.setItem('nostr_nsec', nsecInput);
        
        // Show checklist section
        showChecklistSection();
        
        // Clear input
        document.getElementById('nsecInput').value = '';
        
    } catch (error) {
        showStatus('error', 'Invalid nsec key. Please check and try again.');
        document.getElementById('loginBtn').disabled = false;
        document.getElementById('loginBtn').textContent = 'Login';
    }
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
    document.getElementById('openingBtn').classList.add('active');
    document.getElementById('closingBtn').classList.remove('active');
    document.getElementById('openingChecklist').style.display = 'block';
    document.getElementById('closingChecklist').style.display = 'none';
});

document.getElementById('closingBtn').addEventListener('click', () => {
    currentChecklist = 'closing';
    document.getElementById('closingBtn').classList.add('active');
    document.getElementById('openingBtn').classList.remove('active');
    document.getElementById('openingChecklist').style.display = 'none';
    document.getElementById('closingChecklist').style.display = 'block';
});

// Submit checklist
document.getElementById('submitBtn').addEventListener('click', async () => {
    if (!userKeys) {
        showStatus('error', 'Not logged in');
        return;
    }
    
    const checklistDiv = currentChecklist === 'opening' ? 
        document.getElementById('openingChecklist') : 
        document.getElementById('closingChecklist');
    
    const checkboxes = checklistDiv.querySelectorAll('input[type="checkbox"]');
    const items = [];
    let completedCount = 0;
    
    checkboxes.forEach(checkbox => {
        const label = checkbox.nextElementSibling.textContent;
        const checked = checkbox.checked;
        items.push({ task: label, completed: checked });
        if (checked) completedCount++;
    });
    
    if (completedCount === 0) {
        showStatus('error', 'Please complete at least one task before submitting.');
        return;
    }
    
    try {
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('submitBtn').textContent = 'Submitting...';
        
        // Create Nostr event
        const eventTemplate = {
            kind: 30078,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', `checklist-${currentChecklist}-${new Date().toISOString().split('T')[0]}`],
                ['type', currentChecklist],
                ['shop', 'trails-coffee'],
                ['completed', completedCount.toString()],
                ['total', items.length.toString()]
            ],
            content: JSON.stringify({
                checklist: currentChecklist,
                timestamp: new Date().toISOString(),
                items: items,
                completionRate: `${completedCount}/${items.length}`
            })
        };
        
        // Sign event with private key
        const signedEvent = NostrTools.finalizeEvent(eventTemplate, userKeys.privateKey);
        
        // Publish to relays
        await publishToRelays(signedEvent);
        
        showStatus('success', `✅ ${currentChecklist.charAt(0).toUpperCase() + currentChecklist.slice(1)} checklist submitted! (${completedCount}/${items.length} tasks completed)`);
        
        // Reset checkboxes after successful submission
        setTimeout(() => {
            checkboxes.forEach(cb => cb.checked = false);
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
    const promises = RELAYS.map(relay => {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(relay);
            
            ws.onopen = () => {
                ws.send(JSON.stringify(['EVENT', event]));
            };
            
            ws.onmessage = (msg) => {
                const response = JSON.parse(msg.data);
                if (response[0] === 'OK' && response[1] === event.id) {
                    ws.close();
                    resolve(relay);
                } else if (response[0] === 'NOTICE') {
                    ws.close();
                    reject(new Error(response[1]));
                }
            };
            
            ws.onerror = (error) => {
                reject(error);
            };
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (ws.readyState !== WebSocket.CLOSED) {
                    ws.close();
                    reject(new Error('Timeout'));
                }
            }, 5000);
        });
    });
    
    // Wait for at least one relay to succeed
    try {
        await Promise.any(promises);
    } catch (error) {
        throw new Error('Failed to publish to any relay');
    }
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
    sessionStorage.removeItem('nostr_nsec');
    userKeys = null;
    
    // Reset UI
    document.getElementById('checklistSection').style.display = 'none';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Login';
    
    // Clear checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
}
