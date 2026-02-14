// Time Clock - Check In / Check Out system
// Events stored as Nostr kind:30078 with type: 'checkin' or 'checkout'

const timeClock = (() => {
    const RELAYS = [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://relay.anmore.me',
        'wss://nos.lol',
        'wss://relay.nostr.band'
    ];

    // Admin pubkeys (hex) - only these can see Time Clock tab
    const ADMIN_PUBKEYS = [
        'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
        '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP alt
        '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene (old)
        'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9', // Charlene (new)
        '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayi
        '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b'  // Dayi alt
    ];

    const STAFF_NAMES = {
        'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'JP',
        '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba': 'JP',
        '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
        'a41881ea72c89d552bd6435593afc7dd58c8d2203f18d674a2306e73dfbaf7c9': 'Charlene',
        '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911': 'Dayi',
        '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b': 'Dayi',
        '5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f': 'Aziza',
        'c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93': 'Amanda',
        'e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2': 'Ruby'
    };

    function isAdmin(pubkey) {
        return ADMIN_PUBKEYS.includes(pubkey);
    }

    function getStaffName(pubkey) {
        return STAFF_NAMES[pubkey] || pubkey.substring(0, 8);
    }

    // Get current clock state from localStorage
    function getClockState() {
        const state = localStorage.getItem('trails-clock-state');
        return state ? JSON.parse(state) : null;
    }

    function setClockState(state) {
        localStorage.setItem('trails-clock-state', JSON.stringify(state));
    }

    function clearClockState() {
        localStorage.removeItem('trails-clock-state');
    }

    // Initialize UI based on current state
    function initUI() {
        const section = document.getElementById('timeClockSection');
        if (!section) return;

        const nsec = localStorage.getItem('nostr_nsec');
        if (!nsec) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const state = getClockState();
        
        if (state && state.type === 'checkin') {
            // Currently checked in
            showCheckedInView(state.time);
        } else {
            showCheckedOutView();
        }

        // Show admin nav link if admin
        try {
            const sk = NostrTools.nip19.decode(nsec).data;
            const pk = NostrTools.getPublicKey(sk);
            if (isAdmin(pk)) {
                addAdminNavLink();
            }
        } catch (e) {}
    }

    function showCheckedInView(checkInTime) {
        const checkedOut = document.getElementById('clockedOutView');
        const checkedIn = document.getElementById('clockedInView');
        const timeSpan = document.getElementById('checkInTime');
        
        if (checkedOut) checkedOut.style.display = 'none';
        if (checkedIn) checkedIn.style.display = 'block';
        if (timeSpan) {
            const t = new Date(checkInTime);
            timeSpan.textContent = formatTimeShort(t);
        }
    }

    function showCheckedOutView() {
        const checkedOut = document.getElementById('clockedOutView');
        const checkedIn = document.getElementById('clockedInView');
        
        if (checkedOut) checkedOut.style.display = 'block';
        if (checkedIn) checkedIn.style.display = 'none';
    }

    function addAdminNavLink() {
        const navBar = document.querySelector('.nav-bar');
        if (!navBar || document.getElementById('timeClockNavLink')) return;
        
        const link = document.createElement('a');
        link.id = 'timeClockNavLink';
        link.href = 'timeclock.html';
        link.style.cssText = 'flex:1;padding:15px;text-align:center;text-decoration:none;color:#666;font-weight:600;font-size:0.85em;';
        link.textContent = '⏱️ Time Clock';
        navBar.appendChild(link);
    }

    // Check In
    async function checkIn() {
        const state = getClockState();
        
        // Validation: if just checked out in last 5 minutes, confirm
        const lastCheckout = localStorage.getItem('trails-last-checkout');
        if (lastCheckout) {
            const minsSince = (Date.now() - parseInt(lastCheckout)) / 60000;
            if (minsSince < 5) {
                if (!confirm('You just checked out ' + Math.round(minsSince) + ' minute(s) ago. Did you mean to check back in?')) {
                    return;
                }
            }
        }

        const now = new Date();
        const btn = document.getElementById('checkInBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Checking in...';

        try {
            await publishTimeEvent('checkin', now);
            setClockState({ type: 'checkin', time: now.toISOString() });
            showCheckedInView(now.toISOString());
            console.log('✅ Checked in at', formatTimeShort(now));
        } catch (e) {
            alert('Error checking in: ' + e.message);
            btn.disabled = false;
            btn.textContent = '☀️ Check In';
        }
    }

    // Check Out
    async function checkOut() {
        const now = new Date();
        const btn = document.getElementById('checkOutBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Checking out...';

        try {
            await publishTimeEvent('checkout', now);
            const state = getClockState();
            if (state && state.time) {
                const checkInTime = new Date(state.time);
                const hours = ((now - checkInTime) / 3600000).toFixed(1);
                alert(`✅ Checked out!\nShift: ${formatTimeShort(checkInTime)} → ${formatTimeShort(now)}\nHours: ${hours}h`);
            }
            clearClockState();
            localStorage.setItem('trails-last-checkout', Date.now().toString());
            showCheckedOutView();
            console.log('✅ Checked out at', formatTimeShort(now));
        } catch (e) {
            alert('Error checking out: ' + e.message);
            btn.disabled = false;
            btn.textContent = '👋 Check Out';
        }
    }

    // Publish time event to Nostr
    async function publishTimeEvent(type, timestamp) {
        const nsec = localStorage.getItem('nostr_nsec');
        if (!nsec) throw new Error('Not logged in');

        const sk = NostrTools.nip19.decode(nsec).data;
        const pk = NostrTools.getPublicKey(sk);

        const content = JSON.stringify({
            timeclock: type,
            timestamp: timestamp.toISOString(),
            localTime: formatTimeShort(timestamp),
            date: timestamp.toISOString().split('T')[0]
        });

        const event = {
            kind: 30078,
            pubkey: pk,
            created_at: Math.floor(timestamp.getTime() / 1000),
            tags: [
                ['d', `timeclock-${type}-${timestamp.getTime()}`],
                ['t', 'shop:trails-coffee'],
                ['t', `type:${type}`],
                ['t', 'timeclock']
            ],
            content: content
        };

        const signedEvent = NostrTools.finalizeEvent(event, sk);

        // Publish to relays
        let published = 0;
        for (const relayUrl of RELAYS) {
            try {
                await publishToRelay(relayUrl, signedEvent);
                published++;
            } catch (e) {
                console.warn(`⚠️ Failed to publish to ${relayUrl}:`, e.message);
            }
        }

        if (published === 0) throw new Error('Could not publish to any relay');
        console.log(`📡 Published ${type} to ${published} relays`);

        // Also cache it locally
        if (typeof EVENT_CACHE !== 'undefined') {
            await EVENT_CACHE.storeEvents([signedEvent]);
        }
    }

    function publishToRelay(relayUrl, event) {
        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket(relayUrl);
                const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);

                ws.onopen = () => {
                    ws.send(JSON.stringify(['EVENT', event]));
                };

                ws.onmessage = (msg) => {
                    const data = JSON.parse(msg.data);
                    if (data[0] === 'OK') {
                        clearTimeout(timeout);
                        ws.close();
                        if (data[2]) resolve();
                        else reject(new Error(data[3] || 'rejected'));
                    }
                };

                ws.onerror = () => { clearTimeout(timeout); reject(new Error('connection failed')); };
            } catch (e) {
                reject(e);
            }
        });
    }

    function formatTimeShort(date) {
        const h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${(h % 12) || 12}:${m} ${ampm}`;
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        // Small delay to let app.js login flow complete first
        setTimeout(initUI, 100);
    }

    return { checkIn, checkOut, initUI, isAdmin, getStaffName, ADMIN_PUBKEYS, STAFF_NAMES, formatTimeShort };
})();
