// Test Nostr publishing and relay connections
import * as NostrTools from 'nostr-tools';

const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://nostr.mutinywallet.com'
];

const nsec = 'nsec1sx7pa7pke75pn02cn3snhk7tde9akd90g7t7tmdnene33pq6fzaqyxa8pd';

async function testNostrSetup() {
    console.log('🔍 Testing Nostr setup...\n');
    
    // Decode nsec
    const decoded = NostrTools.nip19.decode(nsec);
    const privateKey = decoded.data;
    const publicKey = NostrTools.getPublicKey(privateKey);
    
    console.log(`Public Key: ${publicKey}\n`);
    
    // Step 1: Check if profile exists
    console.log('📋 Step 1: Checking for existing profile...');
    const hasProfile = await checkProfile(publicKey);
    
    if (!hasProfile) {
        console.log('⚠️  No profile found. Publishing profile...');
        await publishProfile(privateKey);
    } else {
        console.log('✅ Profile exists\n');
    }
    
    // Step 2: Test publishing a checklist event
    console.log('📋 Step 2: Testing checklist event...');
    await testChecklistEvent(privateKey);
    
    // Step 3: Try to fetch recent events
    console.log('\n📋 Step 3: Fetching recent events...');
    await fetchRecentEvents(publicKey);
}

async function checkProfile(pubkey) {
    for (const relayUrl of RELAYS) {
        try {
            const ws = new WebSocket(relayUrl);
            
            const found = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 3000);
                
                ws.onopen = () => {
                    const subId = 'profile-check';
                    ws.send(JSON.stringify(['REQ', subId, { kinds: [0], authors: [pubkey], limit: 1 }]));
                    
                    ws.onmessage = (msg) => {
                        const [type] = JSON.parse(msg.data);
                        if (type === 'EVENT') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve(true);
                        } else if (type === 'EOSE') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve(false);
                        }
                    };
                };
                
                ws.onerror = () => {
                    clearTimeout(timeout);
                    resolve(false);
                };
            });
            
            if (found) {
                console.log(`  ✅ Found profile on ${relayUrl}`);
                return true;
            }
        } catch (error) {
            console.log(`  ⚠️  Error checking ${relayUrl}`);
        }
    }
    
    return false;
}

async function publishProfile(privateKey) {
    const profileEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({
            name: 'Trails Coffee Staff',
            about: 'Staff member at Trails Coffee',
            picture: ''
        })
    };
    
    const signedEvent = NostrTools.finalizeEvent(profileEvent, privateKey);
    
    let successCount = 0;
    
    for (const relayUrl of RELAYS) {
        try {
            const ws = new WebSocket(relayUrl);
            
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, 5000);
                
                ws.onopen = () => {
                    ws.send(JSON.stringify(['EVENT', signedEvent]));
                    
                    ws.onmessage = (msg) => {
                        const [type, , success] = JSON.parse(msg.data);
                        if (type === 'OK') {
                            if (success) {
                                console.log(`  ✅ Profile published to ${relayUrl}`);
                                successCount++;
                            } else {
                                console.log(`  ❌ Rejected by ${relayUrl}`);
                            }
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    };
                };
                
                ws.onerror = () => {
                    console.log(`  ⚠️  Connection failed: ${relayUrl}`);
                    clearTimeout(timeout);
                    resolve();
                };
            });
        } catch (error) {
            console.log(`  ⚠️  Error with ${relayUrl}: ${error.message}`);
        }
    }
    
    console.log(`\n  📊 Published to ${successCount}/${RELAYS.length} relays\n`);
}

async function testChecklistEvent(privateKey) {
    const testEvent = {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['d', `test-${Date.now()}`],
            ['type', 'opening'],
            ['shop', 'trails-coffee']
        ],
        content: JSON.stringify({
            checklist: 'opening',
            timestamp: new Date().toISOString(),
            test: true
        })
    };
    
    const signedEvent = NostrTools.finalizeEvent(testEvent, privateKey);
    
    let successCount = 0;
    
    for (const relayUrl of RELAYS) {
        try {
            const ws = new WebSocket(relayUrl);
            
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, 5000);
                
                ws.onopen = () => {
                    ws.send(JSON.stringify(['EVENT', signedEvent]));
                    
                    ws.onmessage = (msg) => {
                        const [type, , success, message] = JSON.parse(msg.data);
                        if (type === 'OK') {
                            if (success) {
                                console.log(`  ✅ Event published to ${relayUrl}`);
                                successCount++;
                            } else {
                                console.log(`  ❌ Rejected by ${relayUrl}: ${message}`);
                            }
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    };
                };
                
                ws.onerror = () => {
                    console.log(`  ⚠️  Connection failed: ${relayUrl}`);
                    clearTimeout(timeout);
                    resolve();
                };
            });
        } catch (error) {
            console.log(`  ⚠️  Error with ${relayUrl}: ${error.message}`);
        }
    }
    
    console.log(`\n  📊 Published to ${successCount}/${RELAYS.length} relays`);
}

async function fetchRecentEvents(pubkey) {
    const filter = {
        kinds: [30078],
        authors: [pubkey],
        '#shop': ['trails-coffee'],
        limit: 10
    };
    
    for (const relayUrl of RELAYS) {
        try {
            const ws = new WebSocket(relayUrl);
            
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, 3000);
                
                let eventCount = 0;
                
                ws.onopen = () => {
                    const subId = 'fetch-test';
                    ws.send(JSON.stringify(['REQ', subId, filter]));
                    
                    ws.onmessage = (msg) => {
                        const [type] = JSON.parse(msg.data);
                        if (type === 'EVENT') {
                            eventCount++;
                        } else if (type === 'EOSE') {
                            console.log(`  ${eventCount > 0 ? '✅' : '⚠️ '} ${relayUrl}: ${eventCount} events`);
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    };
                };
                
                ws.onerror = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            });
        } catch (error) {
            console.log(`  ⚠️  Error with ${relayUrl}`);
        }
    }
}

// Run the test
testNostrSetup().then(() => {
    console.log('\n✅ Test complete!');
}).catch(error => {
    console.error('\n❌ Test failed:', error);
});
