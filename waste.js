/**
 * Waste/Loss Tracking
 * Analyzes inventory submissions to find unaccounted items.
 * Formula: unaccounted = opening + restocked - closing - sold
 */
(function () {
  const $content = document.getElementById('content');
  const $weekLabel = document.getElementById('weekLabel');

  let weekOffset = 0;
  let allSubmissions = [];
  let allDaily = [];

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PASTRY_ITEMS = ['Cinnamon Bun', 'Banana Bread', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Lemon cake', 'Cookie', 'GF Mini Doughnut', 'GF VEGAN brownie', 'Gluten Free Cheddar Scone', 'Spinach Feta Croissant'];

  // Estimated cost per item for loss calculation
  const ITEM_COSTS = {
    'Cinnamon Bun': 1.50, 'Banana Bread': 1.20, 'Ham and Cheese Croissant': 1.80,
    'Chocolate Croissant': 1.40, 'Plain Croissant': 1.00, 'Lemon cake': 1.30,
    'Cookie': 0.80, 'GF Mini Doughnut': 1.00, 'GF VEGAN brownie': 1.50,
    'Gluten Free Cheddar Scone': 1.20, 'Spinach Feta Croissant': 1.60
  };

  async function fetchJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function dateStr(d) { return d.toISOString().substring(0, 10); }

  function getWeekBounds(offset) {
    const now = new Date();
    const dow = now.getDay();
    const mondayOff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOff + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday, end: sunday };
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function loadFromNostrCache() {
    // Try to read inventory submissions from IndexedDB (event-cache.js stored events)
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('trails-coffee-events', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('events')) { resolve([]); return; }
          const tx = db.transaction('events', 'readonly');
          const store = tx.objectStore('events');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const events = getAll.result || [];
            const inventoryEvents = events.filter(ev => {
              const tags = ev.tags || [];
              return tags.some(t => t[0] === 'type' && t[1] === 'inventory');
            });
            const submissions = inventoryEvents.map(ev => {
              try {
                const content = JSON.parse(ev.content);
                const dateTag = (ev.tags || []).find(t => t[0] === 'd');
                const dateMatch = dateTag?.[1]?.match(/\d{4}-\d{2}-\d{2}/);
                return {
                  date: dateMatch?.[0] || new Date(ev.created_at * 1000).toISOString().substring(0, 10),
                  type: content.type || 'inventory',
                  items: content.items || content.inventory || {},
                  created_at: ev.created_at
                };
              } catch { return null; }
            }).filter(Boolean);
            resolve(submissions);
          };
          getAll.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  async function loadDailyFiles() {
    const files = [];
    const end = new Date(); end.setDate(end.getDate() + 1);
    const start = new Date(end); start.setDate(start.getDate() - 60);
    const promises = []; const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = dateStr(d); dates.push(ds);
      promises.push(fetchJSON(`data/daily/${ds}.json`));
    }
    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      if (results[i]) { results[i].date = results[i].date || dates[i]; files.push(results[i]); }
    }
    return files;
  }

  function analyzeVariance(weekData) {
    // Group submissions by date, pair opening/closing
    const byDate = {};
    for (const sub of weekData.submissions) {
      if (!byDate[sub.date]) byDate[sub.date] = [];
      byDate[sub.date].push(sub);
    }

    const variance = [];
    for (const [date, subs] of Object.entries(byDate)) {
      // Look for opening and closing inventory
      const opening = subs.find(s => s.type === 'opening' || s.created_at < subs[subs.length - 1]?.created_at);
      const closing = subs.find(s => s.type === 'closing' || s === subs[subs.length - 1]);
      const daily = weekData.daily.find(d => d.date === date);

      if (!opening || !closing) continue;

      for (const item of PASTRY_ITEMS) {
        const openCount = opening.items?.[item] || 0;
        const closeCount = closing.items?.[item] || 0;
        const sold = daily?.items?.find(i => i.name === item)?.quantity || 0;

        if (openCount === 0 && closeCount === 0) continue;

        const unaccounted = openCount - closeCount - sold;
        if (unaccounted !== 0) {
          variance.push({ date, item, opening: openCount, closing: closeCount, sold, unaccounted });
        }
      }
    }
    return variance;
  }

  function render() {
    const { start, end } = getWeekBounds(weekOffset);
    const startStr = dateStr(start);
    const endStr = dateStr(end);

    $weekLabel.textContent = `${formatDate(start)} – ${formatDate(end)}`;

    const weekSubs = allSubmissions.filter(s => s.date >= startStr && s.date <= endStr);
    const weekDaily = allDaily.filter(d => d.date >= startStr && d.date <= endStr);

    if (weekSubs.length === 0) {
      $content.innerHTML = `<div class="empty-state">
        <div class="icon">📦</div>
        <p><strong>No inventory submissions this week</strong></p>
        <p style="margin-top:8px;font-size:13px;">Waste tracking requires opening and closing inventory counts from the checklist system.</p>
        <p style="margin-top:8px;font-size:12px;color:#bbb;">Submit inventory via the main checklist page to start tracking.</p>
      </div>`;
      return;
    }

    const variance = analyzeVariance({ submissions: weekSubs, daily: weekDaily });

    let html = '';

    // Summary card
    const totalUnaccounted = variance.reduce((s, v) => s + Math.max(0, v.unaccounted), 0);
    const totalCost = variance.reduce((s, v) => s + Math.max(0, v.unaccounted) * (ITEM_COSTS[v.item] || 1), 0);

    html += `<div class="card"><h2>📋 Weekly Summary</h2>`;
    html += `<div class="stat"><span>Submissions this week</span><span class="val">${weekSubs.length}</span></div>`;
    html += `<div class="stat"><span>Items unaccounted</span><span class="val" style="color:${totalUnaccounted > 0 ? '#e53935' : '#4caf50'}">${totalUnaccounted}</span></div>`;
    html += `<div class="stat"><span>Estimated loss</span><span class="val" style="color:${totalCost > 0 ? '#e53935' : '#4caf50'}">$${totalCost.toFixed(2)}</span></div>`;
    html += `</div>`;

    // Pattern alerts
    const itemCounts = {};
    for (const v of variance) {
      if (v.unaccounted > 0) {
        if (!itemCounts[v.item]) itemCounts[v.item] = { count: 0, total: 0 };
        itemCounts[v.item].count++;
        itemCounts[v.item].total += v.unaccounted;
      }
    }
    const patterns = Object.entries(itemCounts).filter(([_, d]) => d.count >= 2);
    if (patterns.length > 0) {
      html += `<div class="card"><h2>⚠️ Patterns</h2>`;
      for (const [item, data] of patterns) {
        html += `<div class="alert${data.count >= 3 ? ' danger' : ''}">${item}: ${data.total} unaccounted across ${data.count} days this week</div>`;
      }
      html += `</div>`;
    }

    // Variance table
    if (variance.length > 0) {
      html += `<div class="card"><h2>📊 Daily Variance</h2>`;
      html += `<table class="waste-table"><thead><tr><th>Date</th><th>Item</th><th>Open</th><th>Close</th><th>Sold</th><th>Var</th></tr></thead><tbody>`;
      for (const v of variance.sort((a, b) => a.date.localeCompare(b.date) || a.item.localeCompare(b.item))) {
        const cls = v.unaccounted > 0 ? 'neg' : '';
        html += `<tr><td>${v.date.substring(5)}</td><td>${v.item}</td><td>${v.opening}</td><td>${v.closing}</td><td>${v.sold}</td><td class="${cls}">${v.unaccounted > 0 ? '-' : ''}${Math.abs(v.unaccounted)}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="card"><h2>✅ No Variance Detected</h2><p style="color:#999;font-size:13px;">All items accounted for this week.</p></div>`;
    }

    $content.innerHTML = html;
  }

  window.prevWeek = function () { weekOffset--; render(); };
  window.nextWeek = function () { if (weekOffset < 0) { weekOffset++; render(); } };

  Promise.all([loadFromNostrCache(), loadDailyFiles()]).then(([subs, daily]) => {
    allSubmissions = subs;
    allDaily = daily;
    render();
  });
})();
