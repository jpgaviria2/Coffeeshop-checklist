// Manual inventory submission for Diana - Feb 8, 2026
// This will be submitted to Nostr relays

const NostrTools = window.NostrTools;

// Diana's nsec key
const nsecKey = 'nsec1dghy0nxmz5l8xm0nfq3qlhk8xew54gvhvvjq3e6r5k9m8ps7x4sq8w2e9h';

// Decode nsec to get private key
const { data: privKey } = NostrTools.nip19.decode(nsecKey);

// Get public key
const pubKey = NostrTools.getPublicKey(privKey);

// Today's inventory data from Diana
const inventoryData = {
    inventory: {
        milk: {
            milk35: 0,
            milk2: 0,
            oatMilk1L: 8,  // 3 existing + 5 new
            soyMilk1L: 1,
            halfAndHalf: 1,
            whole: 0,
            almond: 0,
            soy: 0
        },
        dairy: {
            greekYogurt3kg: 0
        },
        beans: {
            regular: 0,
            decaf: 0
        },
        coffeeBags: 0,
        pastries: {
            hamCheese: 0,
            chocolate: 0,
            plain: 0,
            bananaBread: 0,
            lemonLoaf: 0,
            cinnamonBuns: 0
        }
    }
};

// Create Nostr event
const event = {
    kind: 30078,
    pubkey: pubKey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
        ['d', `inventory-${Date.now()}`],
        ['shop', 'trails-coffee'],
        ['type', 'inventory']
    ],
    content: JSON.stringify(inventoryData)
};

// Sign event
const signedEvent = NostrTools.finalizeEvent(event, privKey);

// Relay list
const relays = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol'
];

// Publish to relays
console.log('Publishing inventory submission...');
console.log('Event:', signedEvent);

let successCount = 0;

relays.forEach(relayUrl => {
    const relay = NostrTools.SimplePool.prototype.ensureRelay(relayUrl);
    relay.publish(signedEvent).then(() => {
        successCount++;
        console.log(`✅ Published to ${relayUrl}`);
        if (successCount === relays.length) {
            console.log(`\n✅ Successfully published to all ${successCount} relays!`);
        }
    }).catch(err => {
        console.log(`❌ Failed to publish to ${relayUrl}:`, err);
    });
});
