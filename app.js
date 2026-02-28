// Nostr Checklist App - Mobile-friendly with direct nsec login + Schedule viewer
// Using global NostrTools from CDN

let userKeys = null;
let currentChecklist = 'opening';
let currentWeekOffset = 0;

// Shop management pubkey — all submissions are encrypted to this key
const SHOP_MGMT_PUBKEY = 'c1a9ea801212d71b39146d2d867f8744000cab935d062dce6756eac8ad408c72';

// Nostr relay configuration
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
            showLoggedInState();
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
        const allEvents = await EVENT_CACHE.getAllEvents();
        const todayStr = new Date().toISOString().split('T')[0];
        const todayStart = Math.floor(new Date(todayStr).getTime() / 1000);
        const todayEnd = todayStart + 86400;

        const myTodayEvents = allEvents.filter(e => 
            e.pubkey === userKeys.publicKey && 
            e.created_at >= todayStart && 
            e.created_at < todayEnd
        );

        if (myTodayEvents.length === 0) {
            container.innerHTML = '<div style="padding:12px;color:#999;text-align:center;font-size:13px;">No submissions yet today</div>';
            container.style.display = 'block';
            return;
        }

        let html = '';
        const icons = { opening: '🌅', closing: '🌙', inventory: '📦' };
        
        for (const e of myTodayEvents) {
            try {
                // Decrypt own DMs (staff can decrypt their own sent messages)
                let contentStr = e.content;
                if (e.kind === 4) {
                    try {
                        contentStr = await NostrTools.nip04.decrypt(
                            userKeys.privateKey, SHOP_MGMT_PUBKEY, e.content
                        );
                    } catch (decErr) {
                        // If stored already decrypted (from cache), try parsing directly
                    }
                }
                const content = JSON.parse(contentStr);
                const time = new Date(e.created_at * 1000);
                const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                
                if (content.checklist) {
                    const type = content.checklist;
                    const label = type.charAt(0).toUpperCase() + type.slice(1);
                    const rate = content.completionRate ? ` (${content.completionRate})` : '';
                    html += `<div style="padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;">
                        <span>${icons[type] || '📋'} ${label}${rate}</span>
                        <span style="color:#28a745;font-size:13px;">${timeStr} ✅</span>
                    </div>`;
                }
            } catch (err) {}
        }

        container.innerHTML = html || '<div style="padding:12px;color:#999;text-align:center;font-size:13px;">No submissions yet today</div>';
        container.style.display = 'block';
    } catch (err) {
        console.error('Error loading today\'s activity:', err);
    }
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
        const todayKey = new Date().toISOString().substring(0, 10);
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
                hint.textContent = `📊 ~${predicted} predicted today`;
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
            const todayKey = new Date().toISOString().substring(0, 10);
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
    }
    
    try {
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('submitBtn').textContent = 'Submitting...';
        
        // Encrypt content as NIP-04 DM to shop management key
        const plaintext = JSON.stringify(contentData);
        const encryptedContent = await NostrTools.nip04.encrypt(
            userKeys.privateKey, SHOP_MGMT_PUBKEY, plaintext
        );
        
        const eventTemplate = {
            kind: 4,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', SHOP_MGMT_PUBKEY]
            ],
            content: encryptedContent
        };
        
        // Sign event with private key
        const signedEvent = NostrTools.finalizeEvent(eventTemplate, userKeys.privateKey);
        
        // Publish to relays
        const relayCount = await publishToRelays(signedEvent);
        
        // Cache locally immediately
        if (typeof EVENT_CACHE !== 'undefined') {
            await EVENT_CACHE.storeEvents([signedEvent]);
        }
        
        const successMsg = currentChecklist === 'inventory' 
            ? `✅ Inventory handover published to ${relayCount}/${RELAYS.length} relays!`
            : `✅ ${currentChecklist.charAt(0).toUpperCase() + currentChecklist.slice(1)} checklist published to ${relayCount}/${RELAYS.length} relays! (${contentData.completionRate} tasks completed)`;
        
        showStatus('success', successMsg);
        
        // Refresh today's activity
        loadTodaysActivity();
        
        // Verify event on relay in background
        verifyEventOnRelay(signedEvent.id);
        
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
