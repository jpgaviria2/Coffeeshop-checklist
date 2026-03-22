// ============================================================
// Trails Coffee — Staff Checklist App v2.0
// Clean rewrite: global functions, onclick attrs, no CDN deps
// ============================================================

// ── Constants ────────────────────────────────────────────────
const API_BASE = 'https://api.trailscoffee.com';

const MANAGER_PUBKEYS = new Set([
    'c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2', // JP
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f', // Charlene
    '4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911', // Dayana
]);

// ── State ────────────────────────────────────────────────────
var userKeys = null;           // { privateKey: Uint8Array, pubkey: string }
var currentChecklist = '';     // 'opening' | 'closing' | 'inventory'
var itemState = {};            // { [id]: { status: 'pass'|'fail'|null, comment, photo } }

// ── Checklist Data ───────────────────────────────────────────
var OPENING_ITEMS = [
    { id: 'op-0a',  text: '🧼 Handwash before handling any food or drinks' },
    { id: 'op-0b',  text: '📋 Check for shift notes from previous shift — check the whiteboard in the kitchen and any messages in the staff group chat' },
    { id: 'op-1',   text: 'Turn on lights, plug in coffee brewer, turn on espresso machine' },
    { id: 'op-1b',  text: 'Turn on the grinder' },
    { id: 'op-2',   text: 'Take pastries out of fridge and place on baking trays if needed — pastries may already be arranged on trays from the previous night' },
    { id: 'op-3',   text: 'Flush coffee brewer (top up 200-300ml water)' },
    { id: 'op-4',   text: 'Prepare egg wash (crack & stir, do NOT apply yet)' },
    { id: 'op-5',   text: 'Brew coffee: 70g coffee for 1.9L water (make 2 batches)' },
    { id: 'op-6',   text: 'Calibrate grinder (18-19g per 2-sec shot)' },
    { id: 'op-7',   text: 'Calibrate espresso (38-40g in 20-30 sec, tamper at 11)' },
    { id: 'op-8',   text: 'Bake pastries: apply egg, 2 trays, 10 min + rotate + 4-5 min' },
    { id: 'op-9',   text: 'Turn on POS (check customer display), turn on music' },
    { id: 'op-9b',  text: 'Check KDS tablet (blue iPad) is charging & connected — do a test print from Square: More → Settings → Hardware → select tablet → Print Test (<a href="procedure-kds-printer.html" target="_blank" style="color:#667eea">troubleshooting</a>)' },
    { id: 'op-10',  text: 'Restock concentrates. Set out cream & milk for customer table — only ¼ full (prevents expiry)' },
    { id: 'op-11',  text: 'Set out outside tables, chairs & garbage bin' },
    { id: 'op-12',  text: 'Verify dishwasher is empty and turn it on for the day' },
    { id: 'op-12b', text: 'Verify fresh coffee is ready and in the top heater' },
    { id: 'op-13',  text: 'Restock cups, lids & supplies from storage drawers (see <a href="storage.html" target="_blank" style="color:#667eea">📦 Storage Map</a>)' },
    { id: 'op-14',  text: 'Check fridge & freezer temps — record in Health Binder' },
    { id: 'op-15',  text: 'Test Quats sanitizer level with test strip — should read 200ppm. Record in Health Binder (shelf above sink). If low, prepare fresh solution.' },
    { id: 'op-15b', text: '🧴 Fill sanitizer spray bottle with cleaning vinegar solution — ready for counters and surfaces' },
    { id: 'op-14b', text: '🥛 Check milk/dairy expiry dates — discard anything expired or off-smell' },
    { id: 'op-16',  text: '🥐 Update Square inventory on hand for all pastries after baking (More → Items → search item → Available On Hand → Inventory Received → Save)' },
];

var CLOSING_ITEMS = [
    { id: 'cl-21',   text: "Pull tomorrow's pastries from freezer (based on sales forecast)" },
    { id: 'cl-1',    text: 'Put all leftover pastries into white containers, refrigerate if necessary, if not leave on top of the oven' },
    { id: 'cl-2',    text: 'Vacuum out and wipe pastries display case' },
    { id: 'cl-3',    text: 'Clean plates and put them back in the pastries case ready to be filled for the morning' },
    { id: 'cl-4',    text: 'Wipe all counters and surrounding area' },
    { id: 'cl-4b',   text: 'Wipe out the grinder and grinder tray, turn off grinder' },
    { id: 'cl-4c',   text: 'Clean out knockbox, put a clean compost bag inside' },
    { id: 'cl-5',    text: 'Clean inside the oven' },
    { id: 'cl-5b',   text: 'Wipe all covered doors and appliances' },
    { id: 'cl-6',    text: 'Wipe down point of sale' },
    { id: 'cl-7',    text: 'Espresso machine: complete the special cleaning function, wipe all sides and tops, rinse out the removable tray in the sink' },
    { id: 'cl-8',    text: 'Restock all cups and lids' },
    { id: 'cl-8b',   text: 'Restock espresso machine area and the purple cart' },
    { id: 'cl-9',    text: 'Refill all decaf and hot chocolate packages, refill water, refill sprinkle containers and dried strawberries' },
    { id: 'cl-10',   text: 'Do all the dishes and shut off the dishwasher' },
    { id: 'cl-11',   text: 'Take all cups and syrup, wipe the counter, clean the pitcher dispenser, restock all cups on the counter beside espresso and on the purple cart' },
    { id: 'cl-12',   text: 'Ensure decaf coffee is ground and brew coffee is ground — set out 70g in a filter ready for the morning' },
    { id: 'cl-13',   text: 'Drip coffee: turn off the drip coffee machine by unplugging, make sure everything is off' },
    { id: 'cl-14',   text: 'Restock homo milk, 2% milk, coffee cream, whipped cream, almond milk, oat milk, and soy milk — ensure there is enough for the next person' },
    { id: 'cl-15',   text: 'Clean milk and cream pitchers, put them through the dishwasher and leave on counter' },
    { id: 'cl-16',   text: 'Sweep and mop floors (front of house + back of house)' },
    { id: 'cl-16c',  text: 'Take out the black mats and shake them outside' },
    { id: 'cl-17',   text: 'Wipe inside and outside of door and door handle, windows, windowsills, benches, tables inside and outside, customer side of counter and front of counter bar, coffee table — with Quats sanitizer' },
    { id: 'cl-18',   text: 'Wipe down the bases of the tables and black tables, ensure legs of chairs are not wobbly' },
    { id: 'cl-20',   text: 'Take out garbage and put the recycling in the blue bin in the parking lot' },
    { id: 'cl-22',   text: 'Put La Marzocco on standby' },
    { id: 'cl-23',   text: 'Bring in all tables and chairs from outside' },
    { id: 'cl-24',   text: 'Turn off lights and shut off music' },
    { id: 'cl-25',   text: 'Lock the door' },
    { id: 'cl-26',   text: 'Clean out sinks' },
    { id: 'cl-fs1',  text: '🏷️ Label and date any prepped items going into fridge/freezer' },
    { id: 'cl-fs2',  text: '🥛 Check all dairy expiry — discard anything expiring today' },
    { id: 'cl-sec1', text: '💰 Drop cash — leave till with only float ($XXX — confirm amount with manager)' },
    { id: 'cl-sec2', text: '🔒 Lock back door and verify it is secure' },
    { id: 'cl-sec3', text: '🚨 Set alarm before leaving' },
    { id: 'cl-sh1',  text: '📝 Write shift notes — anything unusual, out of stock, or needed for tomorrow' },
];

var INVENTORY_SECTIONS = [
    {
        title: '🥛 Milk & Dairy Products',
        items: [
            { id: 'inv-milk-35',       label: '3.5% Milk (jugs)' },
            { id: 'inv-milk-2',        label: '2% Milk (jugs)' },
            { id: 'inv-oat-milk-1l',   label: 'Oat Milk (1L)' },
            { id: 'inv-soy-milk-1l',   label: 'Soy Milk (1L)' },
            { id: 'inv-half-and-half', label: 'Half & Half 10% (1L)' },
            { id: 'inv-whipping-cream',label: 'Whipping Cream 33% (1L)' },
            { id: 'inv-greek-yogurt',  label: 'Greek Yogurt (3kg jar)' },
            { id: 'inv-whole-milk',    label: 'Whole Milk (jugs)' },
            { id: 'inv-almond-milk',   label: 'Almond Milk (jugs)' },
            { id: 'inv-soy-milk',      label: 'Soy Milk (jugs)' },
        ]
    },
    {
        title: '☕ Coffee Beans',
        items: [
            { id: 'inv-beans-regular', label: 'Regular Beans (5lb bags)' },
            { id: 'inv-beans-decaf',   label: 'Decaf Beans (5lb bags)' },
            { id: 'inv-coffee-bags',   label: 'Coffee Bags for Sale (1lb)' },
        ]
    },
    {
        title: '🥐 Pastries',
        items: [
            { id: 'inv-ham-cheese',    label: 'Ham & Cheese Croissants' },
            { id: 'inv-chocolate',     label: 'Chocolate Croissants' },
            { id: 'inv-plain',         label: 'Plain Croissants' },
            { id: 'inv-banana-bread',  label: 'Banana Bread' },
            { id: 'inv-lemon-loaf',    label: 'Lemon Loaf' },
            { id: 'inv-cinnamon-buns', label: 'Cinnamon Buns' },
        ]
    },
    {
        title: '🧊 Freezer Stock (target ~30 each)',
        items: [
            { id: 'inv-freezer-ham-cheese',  label: 'Ham & Cheese (freezer)' },
            { id: 'inv-freezer-chocolate',   label: 'Chocolate Croissants (freezer)' },
            { id: 'inv-freezer-plain',       label: 'Plain Croissants (freezer)' },
            { id: 'inv-freezer-cinnamon',    label: 'Cinnamon Buns (freezer)' },
            { id: 'inv-freezer-banana',      label: 'Banana Bread (freezer)' },
            { id: 'inv-freezer-lemon',       label: 'Lemon Loaf (freezer)' },
        ]
    },
];

// ── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
    var nsec   = localStorage.getItem('nostr_nsec');
    var pubkey = localStorage.getItem('nostr_pubkey');
    if (nsec && pubkey) {
        try {
            var decoded = NostrTools.nip19.decode(nsec);
            if (decoded.type === 'nsec') {
                userKeys = { privateKey: decoded.data, pubkey: pubkey };
                showHome();
                retryQueue();
                return;
            }
        } catch(e) {}
    }
    showLogin();
    registerSW();
});

// ── Auth ─────────────────────────────────────────────────────
function handleLogin() {
    var nsecVal = document.getElementById('nsecInput').value.trim();
    setStatus('loginStatus', '');

    if (!nsecVal.startsWith('nsec1')) {
        setStatus('loginStatus', '❌ Please enter a valid nsec1... key', 'error');
        return;
    }

    try {
        var decoded = NostrTools.nip19.decode(nsecVal);
        if (decoded.type !== 'nsec') throw new Error('Not an nsec key');

        var privateKey = decoded.data;
        var pubkey = NostrTools.getPublicKey(privateKey);

        userKeys = { privateKey: privateKey, pubkey: pubkey };
        localStorage.setItem('nostr_nsec', nsecVal);
        localStorage.setItem('nostr_pubkey', pubkey);

        showHome();
        retryQueue();
    } catch(e) {
        setStatus('loginStatus', '❌ Invalid key: ' + e.message, 'error');
    }
}

function logout() {
    userKeys = null;
    localStorage.removeItem('nostr_nsec');
    localStorage.removeItem('nostr_pubkey');
    showLogin();
}

// ── Navigation ───────────────────────────────────────────────
function showLogin() {
    document.getElementById('loginView').style.display     = 'block';
    document.getElementById('homeView').style.display      = 'none';
    document.getElementById('checklistView').style.display = 'none';
}

function showHome() {
    document.getElementById('loginView').style.display     = 'none';
    document.getElementById('homeView').style.display      = 'block';
    document.getElementById('checklistView').style.display = 'none';
    document.getElementById('adminSection').style.display  = 'none';

    var pubkey = userKeys.pubkey;
    document.getElementById('userBadge').innerHTML =
        '<div class="user-info">' +
        '<strong>✅ Logged in</strong>' +
        '<span style="font-size:11px;color:#888;margin:0 8px;">' + pubkey.slice(0, 8) + '…</span>' +
        '<button class="logout-btn" onclick="logout()">Logout</button>' +
        '</div>';

    document.getElementById('adminBtn').style.display = MANAGER_PUBKEYS.has(pubkey) ? '' : 'none';
}

function showChecklist(type) {
    currentChecklist = type;
    itemState = {};

    document.getElementById('homeView').style.display      = 'none';
    document.getElementById('checklistView').style.display = 'block';
    document.getElementById('successScreen').style.display = 'none';
    document.getElementById('submitBtn').style.display     = 'block';
    setStatus('submitStatus', '');

    var titles = { opening: '🌅 Opening Checklist', closing: '🌙 Closing Checklist', inventory: '📦 Inventory Handover' };
    document.getElementById('checklistTitle').textContent = titles[type] || type;

    var shiftSection = document.getElementById('shiftNotesSection');
    if (type === 'closing') {
        shiftSection.style.display = 'block';
        document.getElementById('shiftNotesText').value = '';
    } else {
        shiftSection.style.display = 'none';
    }

    var container = document.getElementById('checklistItems');
    container.style.display = 'block';
    if (type === 'inventory') {
        container.innerHTML = renderInventoryHTML();
    } else {
        var items = (type === 'opening') ? OPENING_ITEMS : CLOSING_ITEMS;
        container.innerHTML = items.map(renderPassFailItem).join('');
        items.forEach(function(item) {
            itemState[item.id] = { status: null, comment: '', photo: null };
        });
        if (type === 'closing') {
            loadFreezerPulls();
            renderLeftoverCount();
        }
    }
}

// ── Freezer Pull List (closing checklist) ────────────────────────────────────
function loadFreezerPulls() {
    var pullEl = document.getElementById('item-cl-21');
    if (!pullEl) return;

    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowKey = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });

    fetch('data/forecast.json?v=' + Date.now())
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var fc = data.forecast && data.forecast[tomorrowKey];
            if (!fc || !fc.items) return;

            var rows = Object.entries(fc.items)
                .sort(function(a, b) { return b[1].predicted - a[1].predicted; })
                .map(function(e) {
                    var flag = e[1].flag === 'sold_out_early' ? ' ⚠️' : '';
                    return '<tr>' +
                        '<td style="padding:4px 8px;">' + e[0] + flag + '</td>' +
                        '<td style="padding:4px 8px;font-weight:700;color:#2d6a4f;">' + e[1].predicted + '</td>' +
                        '</tr>';
                }).join('');

            var weather = fc.weather || '';
            var notes   = fc.notes   || '';

            var pullHTML = '<div style="margin-top:10px;padding:12px;background:#f0f7f4;border-radius:8px;border-left:4px solid #2d6a4f;">' +
                '<div style="font-weight:700;color:#2d6a4f;margin-bottom:4px;">🌤️ ' + weather + '</div>' +
                '<div style="font-size:12px;color:#555;margin-bottom:10px;">' + notes + '</div>' +
                '<table style="width:100%;border-collapse:collapse;">' +
                '<thead><tr style="border-bottom:1px solid #ccc;">' +
                '<th style="text-align:left;padding:4px 8px;font-size:12px;color:#666;">Item</th>' +
                '<th style="text-align:left;padding:4px 8px;font-size:12px;color:#666;">Pull from freezer</th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table>' +
                '<div style="font-size:11px;color:#888;margin-top:6px;">⚠️ = sold out early today — prioritize these</div>' +
                '</div>';

            var labelEl = pullEl.querySelector('.item-label');
            if (labelEl) {
                labelEl.innerHTML = "🧊 Pull tomorrow's pastries from freezer" + pullHTML;
            }
        })
        .catch(function() {
            // Silently fail — item text still shows as fallback
        });
}

function closeChecklist() {
    document.getElementById('checklistView').style.display = 'none';
    document.getElementById('homeView').style.display      = 'block';
}

// ── Leftover Pastry Count (closing checklist bottom) ─────────
var PASTRY_ITEMS = [
    { key: 'hamCheese',    label: 'Ham & Cheese Croissant' },
    { key: 'chocolate',    label: 'Chocolate Croissant' },
    { key: 'plain',        label: 'Plain Croissant' },
    { key: 'spinachFeta',  label: 'Spinach Feta Croissant' },
    { key: 'bananaBread',  label: 'Banana Bread' },
    { key: 'lemonLoaf',    label: 'Lemon Cake / Loaf' },
    { key: 'cinnamonBun',  label: 'Cinnamon Bun' },
    { key: 'cookie',       label: 'Cookie' },
    { key: 'macaron',      label: 'Macaron' },
    { key: 'gfGranola',    label: 'GF Granola' },
];

function renderLeftoverCount() {
    var container = document.getElementById('checklistItems');
    if (!container) return;

    var rows = PASTRY_ITEMS.map(function(p) {
        return '<tr>' +
            '<td style="padding:8px 6px;font-size:14px;">' + p.label + '</td>' +
            '<td style="padding:8px 6px;text-align:center;">' +
            '<input type="number" id="leftover-' + p.key + '" min="0" max="99" value="0" ' +
            'style="width:60px;padding:6px;font-size:16px;text-align:center;border:1px solid #ccc;border-radius:6px;">' +
            '</td>' +
            '</tr>';
    }).join('');

    var html = '<div id="leftoverSection" style="margin-top:20px;padding:16px;background:#fff8e1;border-radius:12px;border:1px solid #f0c040;">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:4px;">🥐 End-of-Day Pastry Leftovers</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:12px;">Enter how many of each item are left unsold. Zero = sold out ✅</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="border-bottom:2px solid #f0c040;">' +
        '<th style="text-align:left;padding:8px 6px;font-size:13px;color:#888;">Item</th>' +
        '<th style="text-align:center;padding:8px 6px;font-size:13px;color:#888;">Left</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';

    container.insertAdjacentHTML('beforeend', html);
}

// ── Render: Pass/Fail Items ──────────────────────────────────
function renderPassFailItem(item) {
    return '<div class="checklist-item pf-enhanced" id="item-' + item.id + '">' +
        '<div class="item-main">' +
        '<div class="item-label">' + item.text + '</div>' +
        '<div class="item-buttons">' +
        '<button class="btn-pass" onclick="setItemStatus(\'' + item.id + '\', \'pass\')">✅ PASS</button>' +
        '<button class="btn-fail" onclick="setItemStatus(\'' + item.id + '\', \'fail\')">❌ FAIL</button>' +
        '</div></div>' +
        '<div class="item-detail" id="detail-' + item.id + '">' +
        '<textarea class="item-comment" id="comment-' + item.id + '" placeholder="Describe the issue…" oninput="onCommentInput(\'' + item.id + '\')"></textarea>' +
        '<label class="item-photo-label">' +
        '📷 Add photo (optional)' +
        '<input type="file" accept="image/*" capture="environment" onchange="handleItemPhoto(this, \'' + item.id + '\')">' +
        '</label>' +
        '<span class="item-photo-name" id="photo-name-' + item.id + '"></span>' +
        '<img class="item-photo-preview" id="photo-preview-' + item.id + '" alt="Photo preview">' +
        '<span class="item-error" id="error-' + item.id + '">⚠️ Comment or photo required for FAIL items</span>' +
        '</div>' +
        '</div>';
}

// ── Render: Inventory ────────────────────────────────────────
function renderInventoryHTML() {
    return INVENTORY_SECTIONS.map(function(section) {
        return '<div class="inventory-section">' +
            '<h4 style="color:#667eea;margin:15px 0 10px 0;">' + section.title + '</h4>' +
            section.items.map(function(item) {
                return '<div class="inventory-item">' +
                    '<label for="' + item.id + '">' + item.label + ':</label>' +
                    '<input type="number" id="' + item.id + '" min="0" value="0">' +
                    '</div>';
            }).join('') +
            '</div>';
    }).join('');
}

// ── Pass/Fail Interaction ────────────────────────────────────
function setItemStatus(id, status) {
    if (!itemState[id]) itemState[id] = { status: null, comment: '', photo: null };
    itemState[id].status = status;

    var card   = document.getElementById('item-' + id);
    var detail = document.getElementById('detail-' + id);
    var passBtn = card.querySelector('.btn-pass');
    var failBtn = card.querySelector('.btn-fail');

    card.classList.remove('status-pass', 'status-fail');
    passBtn.classList.remove('selected');
    failBtn.classList.remove('selected');

    if (status === 'pass') {
        card.classList.add('status-pass');
        passBtn.classList.add('selected');
        detail.style.display = 'none';
    } else {
        card.classList.add('status-fail');
        failBtn.classList.add('selected');
        detail.style.display = 'flex';
        detail.style.flexDirection = 'column';
        detail.style.gap = '8px';
        detail.style.padding = '0 14px 12px';
    }

    var errorEl = document.getElementById('error-' + id);
    if (errorEl) errorEl.style.display = 'none';
}

function onCommentInput(id) {
    if (itemState[id]) {
        itemState[id].comment = document.getElementById('comment-' + id).value;
    }
}

// ── Photo Handling ───────────────────────────────────────────
function handleItemPhoto(input, id) {
    var file = input.files && input.files[0];
    if (!file) return;

    compressPhoto(file).then(function(dataUrl) {
        if (!itemState[id]) itemState[id] = { status: 'fail', comment: '', photo: null };
        itemState[id].photo = dataUrl;

        var nameEl = document.getElementById('photo-name-' + id);
        if (nameEl) { nameEl.textContent = file.name; nameEl.style.display = 'inline'; }

        var previewEl = document.getElementById('photo-preview-' + id);
        if (previewEl) { previewEl.src = dataUrl; previewEl.style.display = 'block'; }
    });
}

function compressPhoto(file) {
    return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var MAX = 1024;
                var w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else       { w = Math.round(w * MAX / h); h = MAX; }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ── Submit ───────────────────────────────────────────────────
function submitChecklist() {
    if (!userKeys) { setStatus('submitStatus', '❌ Not logged in', 'error'); return; }

    if (currentChecklist === 'inventory') { _doSubmitInventory(); return; }

    var items = (currentChecklist === 'opening') ? OPENING_ITEMS : CLOSING_ITEMS;
    var unset  = [];
    var hasInvalidFail = false;

    items.forEach(function(item) {
        var s = itemState[item.id];
        if (!s || s.status === null) { unset.push(item.id); return; }
        if (s.status === 'fail') {
            var ok = (s.comment && s.comment.trim()) || s.photo;
            if (!ok) {
                document.getElementById('error-' + item.id).style.display = 'block';
                hasInvalidFail = true;
            }
        }
    });

    if (unset.length > 0) {
        setStatus('submitStatus', '⚠️ ' + unset.length + ' item(s) not marked yet. Please mark all items PASS or FAIL.', 'error');
        var firstEl = document.getElementById('item-' + unset[0]);
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    if (hasInvalidFail) {
        setStatus('submitStatus', '⚠️ Some FAIL items are missing a comment or photo.', 'error');
        return;
    }

    var results = items.map(function(item) {
        return {
            id:      item.id,
            text:    item.text,
            status:  itemState[item.id].status,
            comment: itemState[item.id].comment || '',
            photo:   itemState[item.id].photo || null,
        };
    });

    var passCount = results.filter(function(r) { return r.status === 'pass'; }).length;
    var failCount = results.filter(function(r) { return r.status === 'fail'; }).length;

    var payload = {
        pubkey:    userKeys.pubkey,
        checklist: currentChecklist,
        content: {
            type:        currentChecklist,
            submittedAt: new Date().toISOString(),
            results:     results,
            passCount:   passCount,
            failCount:   failCount,
            shiftNotes:  currentChecklist === 'closing'
                ? (document.getElementById('shiftNotesText').value || '')
                : undefined,
            leftovers: currentChecklist === 'closing'
                ? (function() {
                    var out = {};
                    PASTRY_ITEMS.forEach(function(p) {
                        var el = document.getElementById('leftover-' + p.key);
                        out[p.label] = el ? (parseInt(el.value) || 0) : 0;
                    });
                    return out;
                })()
                : undefined,
        }
    };

    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Submitting…';
    setStatus('submitStatus', '');

    submitWithFallback(payload).then(function() {
        showSuccess(passCount, failCount, results.filter(function(r) { return r.status === 'fail'; }));
    }).catch(function(e) {
        setStatus('submitStatus', '❌ Submit failed: ' + e.message, 'error');
    }).finally(function() {
        btn.disabled = false;
        btn.textContent = 'Submit Checklist';
    });
}

function _doSubmitInventory() {
    var counts = {};
    INVENTORY_SECTIONS.forEach(function(section) {
        section.items.forEach(function(item) {
            var el = document.getElementById(item.id);
            counts[item.id] = el ? (parseInt(el.value, 10) || 0) : 0;
        });
    });

    var payload = {
        pubkey:    userKeys.pubkey,
        checklist: 'inventory',
        content: {
            type:        'inventory',
            submittedAt: new Date().toISOString(),
            counts:      counts,
        }
    };

    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Submitting…';

    submitWithFallback(payload).then(function() {
        showSuccess(null, null, [], true);
    }).catch(function(e) {
        setStatus('submitStatus', '❌ Submit failed: ' + e.message, 'error');
    }).finally(function() {
        btn.disabled = false;
        btn.textContent = 'Submit Checklist';
    });
}

function showSuccess(passCount, failCount, failedItems, isInventory) {
    document.getElementById('checklistItems').style.display   = 'none';
    document.getElementById('shiftNotesSection').style.display = 'none';
    document.getElementById('submitBtn').style.display         = 'none';
    setStatus('submitStatus', '');

    var html = '<div style="font-size:22px;font-weight:800;color:#155724;margin-bottom:8px;">✅ Submitted!</div>';

    if (!isInventory) {
        var total = (passCount || 0) + (failCount || 0);
        var pct   = total > 0 ? Math.round(passCount / total * 100) : 100;
        html += '<div style="background:#d4edda;border-radius:8px;padding:10px;margin-bottom:12px;font-weight:700;color:#155724;">' +
                '✅ ' + passCount + ' pass / ❌ ' + failCount + ' fail — ' + pct + '% pass rate</div>';

        if (failedItems && failedItems.length > 0) {
            html += '<div style="margin-bottom:12px;"><strong>Issues flagged:</strong><ul style="margin:8px 0 0 18px;">';
            failedItems.forEach(function(f) {
                html += '<li style="margin-bottom:4px;font-size:13px;">' + f.text + (f.comment ? ': ' + f.comment : '') + '</li>';
            });
            html += '</ul></div>';
        }
    } else {
        html += '<div style="color:#555;margin-bottom:12px;">Inventory counts recorded successfully.</div>';
    }

    html += '<button onclick="startNewChecklist()" style="background:#667eea;color:white;border:none;border-radius:10px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer;width:100%;">📋 Start New Checklist</button>';

    var screen = document.getElementById('successScreen');
    screen.innerHTML = html;
    screen.style.display = 'block';
    screen.scrollIntoView({ behavior: 'smooth' });
}

function startNewChecklist() {
    closeChecklist();
}

// ── API ──────────────────────────────────────────────────────
function buildNostrAuthHeader(method, url) {
    var authEvent = {
        kind:       27235,
        created_at: Math.floor(Date.now() / 1000),
        tags:       [['u', url], ['method', method]],
        content:    '',
    };
    var signed = NostrTools.finalizeEvent(authEvent, userKeys.privateKey);
    return Promise.resolve('Nostr ' + btoa(JSON.stringify(signed)));
}

function submitToAPI(payload) {
    var url = API_BASE + '/api/v1/submissions';
    return buildNostrAuthHeader('POST', url).then(function(auth) {
        return fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': auth },
            body:    JSON.stringify(payload),
        });
    }).then(function(res) {
        if (!res.ok) return res.json().catch(function() { return {}; }).then(function(err) {
            throw new Error(err.error || 'HTTP ' + res.status);
        });
        return res.json();
    });
}

function submitWithFallback(payload) {
    return submitToAPI(payload).catch(function(err) {
        console.warn('[offline] Queuing submission:', err.message);
        var queue = JSON.parse(localStorage.getItem('submission_queue') || '[]');
        queue.push({ data: payload, queuedAt: new Date().toISOString(), retryCount: 0 });
        localStorage.setItem('submission_queue', JSON.stringify(queue));
        // Don't re-throw — offline-first, treat as success
    });
}

function retryQueue() {
    var queue = JSON.parse(localStorage.getItem('submission_queue') || '[]');
    if (queue.length === 0) return;
    var remaining = [];

    queue.reduce(function(chain, item) {
        return chain.then(function() {
            return submitToAPI(item.data).catch(function(e) {
                item.retryCount = (item.retryCount || 0) + 1;
                if (item.retryCount < 10) remaining.push(item);
            });
        });
    }, Promise.resolve()).then(function() {
        localStorage.setItem('submission_queue', JSON.stringify(remaining));
        if (remaining.length < queue.length) console.log('[queue] Flushed ' + (queue.length - remaining.length) + ' queued submission(s)');
    });
}

// ── Admin View ───────────────────────────────────────────────
function toggleAdminView() {
    var section = document.getElementById('adminSection');
    if (section.style.display === 'none' || section.style.display === '') {
        section.style.display = 'block';
        loadAdminView();
    } else {
        section.style.display = 'none';
    }
}

function closeAdminView() {
    document.getElementById('adminSection').style.display = 'none';
}

function loadAdminView() {
    var container = document.getElementById('adminTableContainer');
    container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Loading…</p>';

    var url = API_BASE + '/api/v1/submissions?limit=20';
    buildNostrAuthHeader('GET', url).then(function(auth) {
        return fetch(url, { headers: { 'Authorization': auth } });
    }).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }).then(function(data) {
        // API returns { submissions: [...], total: N } or a plain array
        var subs = Array.isArray(data) ? data : (data.submissions || data.data || []);
        if (!subs || subs.length === 0) {
            container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">No submissions yet.</p>';
            return;
        }

        var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr style="background:#e8ebf7;">' +
            '<th style="padding:8px;text-align:left;">Time</th>' +
            '<th style="padding:8px;text-align:left;">Type</th>' +
            '<th style="padding:8px;text-align:left;">Staff</th>' +
            '<th style="padding:8px;text-align:left;">Result</th>' +
            '</tr></thead><tbody>';

        subs.forEach(function(sub) {
            var d = new Date(sub.created_at || sub.submittedAt || (sub.content && sub.content.submittedAt));
            var timeStr = isNaN(d.getTime()) ? '—' : d.toLocaleString('en-CA', {
                timeZone: 'America/Vancouver', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            var type      = (sub.checklist || (sub.content && sub.content.type) || '—');
            type = type.charAt(0).toUpperCase() + type.slice(1);
            var pubkey    = ((sub.pubkey || '').slice(0, 8)) + '…';
            var failCount = (sub.content && sub.content.failCount) || 0;
            var passCount = (sub.content && sub.content.passCount) || 0;
            var result = sub.checklist === 'inventory'
                ? '<span style="color:#667eea;">📦 Counts</span>'
                : failCount > 0
                    ? '<span style="color:#dc3545;">❌ ' + failCount + ' fail</span>'
                    : '<span style="color:#28a745;">✅ All pass</span>';

            html += '<tr style="border-bottom:1px solid #f0f0f0;">' +
                '<td style="padding:8px;">' + timeStr + '</td>' +
                '<td style="padding:8px;">' + type + '</td>' +
                '<td style="padding:8px;font-family:monospace;">' + pubkey + '</td>' +
                '<td style="padding:8px;">' + result + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }).catch(function(e) {
        container.innerHTML = '<p style="color:#dc3545;text-align:center;padding:20px;">Error: ' + e.message + '</p>';
    });
}

// ── Settings / Cache Clear ───────────────────────────────────
function toggleSettings() {
    var panel = document.getElementById('settingsPanel');
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}

function clearCache() {
    var nsec   = localStorage.getItem('nostr_nsec');
    var pubkey = localStorage.getItem('nostr_pubkey');

    var doReload = function() {
        if (nsec)   localStorage.setItem('nostr_nsec', nsec);
        if (pubkey) localStorage.setItem('nostr_pubkey', pubkey);
        window.location.reload(true);
    };

    var cleanup = Promise.resolve();
    if ('serviceWorker' in navigator) {
        cleanup = navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(r) { return r.unregister(); }));
        });
    }
    cleanup.then(function() {
        return caches.keys();
    }).then(function(keys) {
        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(doReload).catch(doReload);
}

// ── Helpers ──────────────────────────────────────────────────
function setStatus(elementId, msg, type) {
    var el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.className   = 'status' + (type ? ' ' + type : '');
    el.style.display = msg ? 'block' : 'none';
}

// ── Service Worker ───────────────────────────────────────────
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(function() { console.log('[SW] Registered'); })
            .catch(function(e) { console.warn('[SW] Failed:', e); });
    }
}
