// Nostr Checklist App - Mobile-friendly with direct nsec login + Schedule viewer
// Using global NostrTools from CDN

let userKeys = null;
let currentChecklist = 'opening';
let currentWeekOffset = 0; // 0 = this week, 1 = next week, -1 = last week

// Nostr relay configuration
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.mutinywallet.com'
];

// Load schedule on page load
window.addEventListener('DOMContentLoaded', () => {
    // Load schedule
    loadSchedule(0);
    
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
            showLoggedInState();
        } catch (error) {
            localStorage.removeItem('nostr_nsec');
        }
    }
});

// Schedule functions
function changeWeek(direction) {
    currentWeekOffset += direction;
    loadSchedule(currentWeekOffset);
}

function loadSchedule(weekOffset) {
    // Parse start date properly (YYYY-MM-DD format)
    const [year, month, day] = SCHEDULE_DATA.startDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day); // month is 0-indexed
    startDate.setDate(startDate.getDate() + (weekOffset * 7));
    
    // Calculate which week pattern (A or B)
    const baseDate = new Date(year, month - 1, day);
    const weeksFromStart = Math.floor((startDate - baseDate) / (7 * 24 * 60 * 60 * 1000));
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
        const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
        
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

// Show logged in state
function showLoggedInState() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('quickActions').style.display = 'flex';
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
    } else if (type === 'closing') {
        document.getElementById('checklistTitle').textContent = 'Closing Checklist';
        document.getElementById('closingBtn').classList.add('active');
        document.getElementById('closingChecklist').style.display = 'block';
    } else if (type === 'inventory') {
        document.getElementById('checklistTitle').textContent = 'Inventory Handover';
        document.getElementById('inventoryBtn').classList.add('active');
        document.getElementById('inventoryChecklist').style.display = 'block';
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
            }
        };
        
        contentData = {
            checklist: 'inventory',
            timestamp: new Date().toISOString(),
            inventory: inventoryData
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
            ],
            content: JSON.stringify(contentData)
        };
        
        if (currentChecklist !== 'inventory') {
            eventTemplate.tags.push(['completed', items.filter(i => i.completed).length.toString()]);
            eventTemplate.tags.push(['total', items.length.toString()]);
        }
        
        // Sign event with private key
        const signedEvent = NostrTools.finalizeEvent(eventTemplate, userKeys.privateKey);
        
        // Publish to relays
        await publishToRelays(signedEvent);
        
        const successMsg = currentChecklist === 'inventory' 
            ? `✅ Inventory handover submitted!`
            : `✅ ${currentChecklist.charAt(0).toUpperCase() + currentChecklist.slice(1)} checklist submitted! (${contentData.completionRate} tasks completed)`;
        
        showStatus('success', successMsg);
        
        // Reset after successful submission
        setTimeout(() => {
            if (currentChecklist === 'inventory') {
                // Reset inventory inputs
                document.querySelectorAll('#inventoryChecklist input[type="number"]').forEach(input => input.value = 0);
            } else {
                // Reset checkboxes
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
        throw new Error(`Failed to publish to any relay. Errors: ${errors.join('; ')}`);
    }
    
    if (errors.length > 0) {
        console.warn('⚠️  Some relays failed:', errors);
    }
    
    return successCount;
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
