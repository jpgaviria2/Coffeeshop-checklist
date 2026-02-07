// Nostr Checklist App
let userPubkey = null;
let currentChecklist = 'opening';

// Nostr relay configuration
const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
];

// Check for existing session on load
window.addEventListener('DOMContentLoaded', () => {
    const savedPubkey = sessionStorage.getItem('nostr_pubkey');
    if (savedPubkey) {
        // Restore session
        userPubkey = savedPubkey;
        showChecklistSection();
    }
});

// Check for Nostr extension
async function checkNostrExtension() {
    if (!window.nostr) {
        showStatus('error', 'Nostr extension not found. Please install Alby or nos2x.');
        return false;
    }
    return true;
}

// Show checklist section (shared function)
function showChecklistSection() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('checklistSection').style.display = 'block';
    
    // Display shortened pubkey
    const shortPubkey = userPubkey.substring(0, 8) + '...' + userPubkey.substring(userPubkey.length - 8);
    document.getElementById('userPubkey').textContent = shortPubkey;
}

// Login with Nostr
document.getElementById('loginBtn').addEventListener('click', async () => {
    if (!await checkNostrExtension()) return;
    
    try {
        document.getElementById('loginBtn').disabled = true;
        document.getElementById('loginBtn').textContent = 'Connecting...';
        
        // Get public key from extension
        const pubkey = await window.nostr.getPublicKey();
        userPubkey = pubkey;
        
        // Save to session storage (persists for browser session)
        sessionStorage.setItem('nostr_pubkey', pubkey);
        
        // Show checklist section
        showChecklistSection();
        
    } catch (error) {
        showStatus('error', 'Login failed: ' + error.message);
        document.getElementById('loginBtn').disabled = false;
        document.getElementById('loginBtn').textContent = 'Connect with Nostr';
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
    if (!await checkNostrExtension()) return;
    
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
        const event = {
            kind: 30078, // Application-specific data (replaceable)
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
        
        // Sign with Nostr extension
        const signedEvent = await window.nostr.signEvent(event);
        
        // Publish to relays
        await publishToRelays(signedEvent);
        
        showStatus('success', `✅ ${currentChecklist.charAt(0).toUpperCase() + currentChecklist.slice(1)} checklist submitted successfully! (${completedCount}/${items.length} tasks completed)`);
        
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
    sessionStorage.removeItem('nostr_pubkey');
    userPubkey = null;
    
    // Reset UI
    document.getElementById('checklistSection').style.display = 'none';
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Connect with Nostr';
    
    // Clear checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
}
