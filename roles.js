// Role-based access control for Trails Coffee Staff Portal
// Admin users can see all pages; regular staff see restricted set

const STAFF_ROLES = {
    // Admin pubkeys — full access to status, reports, dashboard
    admins: [
        'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd', // JP
        '81bc1ef836cfa819bd589c613bdbcb6e4bdb34af4797e5edb3ccf318841a48ba', // JP alt
        'c1a9ea801212d71b39146d2d867f8744000cab935d062dce6756eac8ad408c72', // JP (shop mgmt)
        '4123fb4c449d8a48a954fe25ce6b171bda595ff83fecdd8e2588f8ea00634e05', // JP (manager key)
        'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2', // JP (Trails Coffee Shop)
        '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
        '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayi
        '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b', // Dayi alt
    ],

    // Pages restricted to admins only
    restrictedPages: ['status', 'reports', 'dashboard'],

    // Get pubkey from stored nsec (works even before NostrTools loads by using cached pubkey)
    _getCachedPubkey() {
        return localStorage.getItem('nostr_pubkey');
    },

    isAdmin() {
        // First try cached pubkey (available immediately)
        const cached = this._getCachedPubkey();
        if (cached) return this.admins.includes(cached);

        // Fallback: derive from nsec if NostrTools available
        const nsec = localStorage.getItem('nostr_nsec');
        if (!nsec || typeof NostrTools === 'undefined') return false;
        try {
            const decoded = NostrTools.nip19.decode(nsec);
            const pubkey = NostrTools.getPublicKey(decoded.data);
            // Cache for instant checks next time
            localStorage.setItem('nostr_pubkey', pubkey);
            return this.admins.includes(pubkey);
        } catch (e) {
            return false;
        }
    },

    isLoggedIn() {
        return !!localStorage.getItem('nostr_nsec');
    },

    // Check if current user can access a page
    canAccess(pageId) {
        if (!this.restrictedPages.includes(pageId)) return true;
        return this.isAdmin();
    },

    // Redirect if user can't access current page (deferred until NostrTools loads)
    enforceAccess(pageId) {
        if (!this.restrictedPages.includes(pageId)) return;

        // If cached pubkey exists, check immediately
        const cached = this._getCachedPubkey();
        if (cached) {
            if (!this.admins.includes(cached)) {
                window.location.href = 'index.html';
            }
            return;
        }

        // Otherwise wait for NostrTools to load and check
        const self = this;
        window.addEventListener('DOMContentLoaded', function() {
            // Give NostrTools time to load from CDN
            const check = function() {
                if (typeof NostrTools === 'undefined') {
                    setTimeout(check, 100);
                    return;
                }
                const nsec = localStorage.getItem('nostr_nsec');
                if (!nsec) {
                    window.location.href = 'index.html';
                    return;
                }
                try {
                    const decoded = NostrTools.nip19.decode(nsec);
                    const pubkey = NostrTools.getPublicKey(decoded.data);
                    localStorage.setItem('nostr_pubkey', pubkey);
                    if (!self.admins.includes(pubkey)) {
                        window.location.href = 'index.html';
                    }
                } catch (e) {
                    window.location.href = 'index.html';
                }
            };
            check();
        });
    }
};
