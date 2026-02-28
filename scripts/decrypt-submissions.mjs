#!/usr/bin/env node
// Decrypt NIP-04 DM submissions from Nostr relays and save as JSON
// Runs via GitHub Actions on a schedule

import { nip04, nip19, getPublicKey } from 'nostr-tools';
import { WebSocket } from 'websocket-polyfill';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'submissions');

const RELAYS = [
    'wss://relay.anmore.me',
    'wss://relay.damus.io',
    'wss://nos.lol'
];

const STAFF_PUBKEYS = [
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd',
    '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba',
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f',
    'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9',
    '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f',
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911',
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b',
    '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f',
    'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93',
    'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2'
];

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

async function main() {
    const mgmtNsec = process.env.SHOP_MGMT_NSEC;
    if (!mgmtNsec) {
        console.error('SHOP_MGMT_NSEC environment variable not set');
        process.exit(1);
    }

    const decoded = nip19.decode(mgmtNsec);
    const mgmtPrivKey = decoded.data;
    const mgmtPubKey = getPublicKey(mgmtPrivKey);

    console.log(`Shop management pubkey: ${mgmtPubKey}`);

    // Fetch last 30 days
    const since = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const filter = {
        kinds: [4],
        authors: STAFF_PUBKEYS,
        '#p': [mgmtPubKey],
        since,
        limit: 500
    };

    const allEvents = new Map();

    for (const relayUrl of RELAYS) {
        console.log(`Fetching from ${relayUrl}...`);
        try {
            const events = await fetchFromRelay(relayUrl, filter);
            events.forEach(e => allEvents.set(e.id, e));
            console.log(`  Got ${events.length} events`);
        } catch (e) {
            console.warn(`  Failed: ${e.message}`);
        }
    }

    console.log(`Total unique events: ${allEvents.size}`);

    // Decrypt and group by date
    const byDate = {};
    
    for (const event of allEvents.values()) {
        try {
            const plaintext = await nip04.decrypt(mgmtPrivKey, event.pubkey, event.content);
            const content = JSON.parse(plaintext);
            const date = new Date(event.created_at * 1000);
            const dateKey = date.toISOString().split('T')[0];

            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push({
                id: event.id,
                pubkey: event.pubkey,
                staff: STAFF_NAMES[event.pubkey] || event.pubkey.substring(0, 8),
                created_at: event.created_at,
                timestamp: date.toISOString(),
                ...content
            });
        } catch (e) {
            console.warn(`Failed to decrypt event ${event.id}: ${e.message}`);
        }
    }

    // Write files
    mkdirSync(DATA_DIR, { recursive: true });
    let filesWritten = 0;

    for (const [dateKey, submissions] of Object.entries(byDate)) {
        submissions.sort((a, b) => a.created_at - b.created_at);
        const filePath = join(DATA_DIR, `${dateKey}.json`);
        writeFileSync(filePath, JSON.stringify(submissions, null, 2));
        console.log(`Wrote ${filePath} (${submissions.length} submissions)`);
        filesWritten++;
    }

    console.log(`Done. ${filesWritten} files written.`);
}

function fetchFromRelay(relayUrl, filter) {
    return new Promise((resolve, reject) => {
        const events = [];
        const ws = new WebSocket(relayUrl);
        const timeout = setTimeout(() => { ws.close(); resolve(events); }, 15000);

        ws.onopen = () => {
            const subId = Math.random().toString(36).substring(7);
            ws.send(JSON.stringify(['REQ', subId, filter]));
        };

        ws.onmessage = (msg) => {
            const data = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
            if (data[0] === 'EVENT') {
                events.push(data[2]);
            } else if (data[0] === 'EOSE') {
                clearTimeout(timeout);
                ws.close();
                resolve(events);
            }
        };

        ws.onerror = (err) => {
            clearTimeout(timeout);
            reject(new Error(`WebSocket error: ${err.message || 'unknown'}`));
        };
    });
}

main().catch(e => { console.error(e); process.exit(1); });
