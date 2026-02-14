#!/usr/bin/env node
// Publish Nostr kind:0 (profile) and kind:10002 (relay list) events for Trails Coffee staff
// Usage: node publish-staff-profiles.js <name> <nsec>
// Example: node publish-staff-profiles.js "JP" nsec1...

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { decode } from 'nostr-tools/nip19';
import WebSocket from 'ws';

const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.anmore.me',
    'wss://nos.lol',
    'wss://relay.nostr.band'
];

const KNOWN_PUBKEYS = {
    'JP': 'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd',
    'JP alt': '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba',
    'Charlene': '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f',
    'Dayi': '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911',
    'Dayi alt': '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b',
    'Aziza': '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f',
    'Amanda': 'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93',
    'Ruby': 'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2'
};

function publishToRelay(relayUrl, event) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(relayUrl);
        const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 8000);
        ws.on('open', () => ws.send(JSON.stringify(['EVENT', event])));
        ws.on('message', (msg) => {
            const data = JSON.parse(msg.toString());
            if (data[0] === 'OK') {
                clearTimeout(timeout); ws.close();
                data[2] ? resolve() : reject(new Error(data[3] || 'rejected'));
            }
        });
        ws.on('error', () => { clearTimeout(timeout); reject(new Error('connection failed')); });
    });
}

async function main() {
    const [,, name, nsec] = process.argv;
    if (!name || !nsec) {
        console.log('Usage: node publish-staff-profiles.js <name> <nsec>');
        console.log('Example: node publish-staff-profiles.js "JP" nsec1...');
        console.log('\nKnown staff:', Object.keys(KNOWN_PUBKEYS).join(', '));
        process.exit(1);
    }

    const { data: sk } = decode(nsec);
    const pk = getPublicKey(sk);
    console.log(`Publishing profile for ${name} (${pk.substring(0, 16)}...)`);

    // Verify pubkey matches if known
    const expected = KNOWN_PUBKEYS[name];
    if (expected && expected !== pk) {
        console.warn(`⚠️  Warning: derived pubkey doesn't match known pubkey for ${name}`);
        console.warn(`   Expected: ${expected}`);
        console.warn(`   Got:      ${pk}`);
    }

    // Kind 0: Profile metadata
    const profileEvent = finalizeEvent({
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({
            name: name,
            display_name: name,
            about: `Staff at Trails Coffee ☕`
        })
    }, sk);

    // Kind 10002: Relay list
    const relayListEvent = finalizeEvent({
        kind: 10002,
        created_at: Math.floor(Date.now() / 1000),
        tags: RELAYS.map(r => ['r', r]),
        content: ''
    }, sk);

    // Publish both events
    for (const event of [profileEvent, relayListEvent]) {
        const kindLabel = event.kind === 0 ? 'profile (kind:0)' : 'relay list (kind:10002)';
        let ok = 0;
        for (const relay of RELAYS) {
            try {
                await publishToRelay(relay, event);
                ok++;
                console.log(`  ✅ ${kindLabel} → ${relay}`);
            } catch (e) {
                console.log(`  ❌ ${kindLabel} → ${relay}: ${e.message}`);
            }
        }
        console.log(`📡 ${kindLabel}: ${ok}/${RELAYS.length} relays\n`);
    }

    console.log('Done!');
}

main().catch(console.error);
