// Event Cache - Persistent storage for Nostr checklist events using IndexedDB
// Events are immutable (never edited/deleted), so cache is append-only

const EVENT_CACHE = (() => {
    const DB_NAME = 'trails-coffee-events';
    const DB_VERSION = 1;
    const STORE_NAME = 'events';
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains(STORE_NAME)) {
                    const store = d.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('created_at', 'created_at', { unique: false });
                    store.createIndex('pubkey', 'pubkey', { unique: false });
                }
            };
            req.onsuccess = (e) => { db = e.target.result; resolve(db); };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // Store multiple events (deduplicates by id)
    async function storeEvents(events) {
        const d = await openDB();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            let added = 0;
            events.forEach(event => {
                try {
                    const req = store.put(event); // put = upsert
                    req.onsuccess = () => added++;
                } catch (e) { /* skip duplicates */ }
            });
            tx.oncomplete = () => resolve(added);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // Get all cached events (sorted newest first)
    async function getAllEvents() {
        const d = await openDB();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const events = req.result || [];
                events.sort((a, b) => b.created_at - a.created_at);
                resolve(events);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // Get the most recent event timestamp (for incremental fetch)
    async function getLatestTimestamp() {
        const events = await getAllEvents();
        if (events.length === 0) return null;
        return events[0].created_at;
    }

    // Get event count
    async function getCount() {
        const d = await openDB();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    return { storeEvents, getAllEvents, getLatestTimestamp, getCount, openDB };
})();

// Background relay fetcher - runs on any page load
const RELAY_FETCHER = (() => {
    const RELAYS = [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://relay.anmore.me',
        'wss://nos.lol',
        'wss://relay.nostr.band',
        'wss://nostr.mutinywallet.com'
    ];

    const STAFF_PUBKEYS = [
        'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd',
        '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f',
        'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9',
        '6b5f11f26cdabc44ed07dffbe5d56451d2330994689e2a157f2ee4801d82778f',
        '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911',
        '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b',
        '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f',
        'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93',
        '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba',
        'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2'
    ];

    let isFetching = false;
    let fetchCallbacks = [];

    async function fetchFromRelays() {
        if (isFetching) {
            // If already fetching, return a promise that resolves when done
            return new Promise(resolve => fetchCallbacks.push(resolve));
        }
        isFetching = true;

        try {
            // Get latest cached timestamp for incremental fetch
            const latestTs = await EVENT_CACHE.getLatestTimestamp();
            // If we have cached data, only fetch newer events (with 1hr overlap for safety)
            // If no cache, fetch last 90 days
            const since = latestTs 
                ? latestTs - 3600 
                : Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);

            console.log(`📡 Background fetch: since ${new Date(since * 1000).toLocaleDateString()}, cached latest: ${latestTs ? new Date(latestTs * 1000).toLocaleString() : 'none'}`);

            const SHOP_MGMT_PUBKEY = 'c1a9ea801212d71b39146d2d867f8744000cab935d062dce6756eac8ad408c72';
            const filter = {
                kinds: [4],
                authors: STAFF_PUBKEYS,
                '#p': [SHOP_MGMT_PUBKEY],
                since: since,
                limit: 200
            };

            const newEvents = [];

            for (const relayUrl of RELAYS) {
                try {
                    const events = await fetchFromRelay(relayUrl, filter);
                    events.forEach(e => {
                        if (!newEvents.find(x => x.id === e.id)) {
                            newEvents.push(e);
                        }
                    });
                } catch (e) {
                    console.warn(`⚠️ ${relayUrl} failed:`, e.message);
                }
            }

            if (newEvents.length > 0) {
                const added = await EVENT_CACHE.storeEvents(newEvents);
                console.log(`✅ Cached ${added} events (${newEvents.length} fetched from relays)`);
            } else {
                console.log('✅ No new events from relays');
            }

            // Store last fetch time
            localStorage.setItem('trails-last-fetch', Date.now().toString());

        } catch (e) {
            console.error('❌ Background fetch error:', e);
        } finally {
            isFetching = false;
            fetchCallbacks.forEach(cb => cb());
            fetchCallbacks = [];
        }
    }

    function fetchFromRelay(relayUrl, filter) {
        return new Promise((resolve) => {
            const events = [];
            try {
                const ws = new WebSocket(relayUrl);
                const timeout = setTimeout(() => { ws.close(); resolve(events); }, 8000);

                ws.onopen = () => {
                    const subId = Math.random().toString(36).substring(7);
                    ws.send(JSON.stringify(['REQ', subId, filter]));

                    ws.onmessage = (msg) => {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            events.push(data[2]);
                        } else if (data[0] === 'EOSE') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve(events);
                        }
                    };
                };

                ws.onerror = () => { clearTimeout(timeout); resolve(events); };
            } catch (e) {
                resolve(events);
            }
        });
    }

    // Start background fetch immediately
    function startBackgroundFetch() {
        // Don't wait — fire and forget
        fetchFromRelays().catch(console.error);
    }

    return { fetchFromRelays, startBackgroundFetch, STAFF_PUBKEYS };
})();

// Auto-start background fetch on ANY page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RELAY_FETCHER.startBackgroundFetch());
} else {
    RELAY_FETCHER.startBackgroundFetch();
}
