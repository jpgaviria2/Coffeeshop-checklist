/**
 * Weekly Performance Report
 * Reads data/daily/*.json files to build weekly business intelligence.
 */
(function () {
  const BASE = '';
  const $content = document.getElementById('content');
  const $dateRange = document.getElementById('dateRange');
  const $weekLabel = document.getElementById('weekLabel');

  let weekOffset = 0; // 0 = this week, -1 = last week, etc.
  let allDaily = [];

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async function fetchJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function getWeekBounds(offset) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday, end: sunday };
  }

  function dateStr(d) {
    return d.toISOString().substring(0, 10);
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getWeekData(offset) {
    const { start, end } = getWeekBounds(offset);
    const startStr = dateStr(start);
    const endStr = dateStr(end);
    return allDaily.filter(d => d.date >= startStr && d.date <= endStr);
  }

  function renderRevenue(thisWeek, lastWeek) {
    const thisTotal = thisWeek.reduce((s, d) => s + (d.totalRevenue || 0), 0);
    const lastTotal = lastWeek.reduce((s, d) => s + (d.totalRevenue || 0), 0);
    const change = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal * 100) : 0;
    const thisOrders = thisWeek.reduce((s, d) => s + (d.orderCount || 0), 0);
    const lastOrders = lastWeek.reduce((s, d) => s + (d.orderCount || 0), 0);

    let trendClass = change > 0 ? 'trend-up' : change < 0 ? 'trend-down' : 'trend-flat';
    let arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';

    let html = `<div class="card"><h2>💰 Revenue</h2>`;
    html += `<div class="stat"><span>This week</span><span class="val">$${thisTotal.toFixed(0)}</span></div>`;
    html += `<div class="stat"><span>Last week</span><span class="val">$${lastTotal.toFixed(0)}</span></div>`;
    html += `<div class="stat"><span>Change</span><span class="val ${trendClass}">${arrow} ${Math.abs(change).toFixed(1)}%</span></div>`;
    html += `<div class="stat"><span>Orders</span><span class="val">${thisOrders} <span style="color:#999;font-weight:400">(last: ${lastOrders})</span></span></div>`;
    html += `</div>`;
    return html;
  }

  function renderTopSellers(thisWeek, lastWeek) {
    const aggregate = (data) => {
      const items = {};
      for (const day of data) {
        for (const item of (day.items || [])) {
          if (!items[item.name]) items[item.name] = { qty: 0, rev: 0 };
          items[item.name].qty += item.quantity || 0;
          items[item.name].rev += item.revenue || 0;
        }
      }
      return items;
    };

    const thisItems = aggregate(thisWeek);
    const lastItems = aggregate(lastWeek);

    const sorted = Object.entries(thisItems).sort((a, b) => b[1].qty - a[1].qty);

    let html = `<div class="card"><h2>🏆 Top Sellers</h2>`;
    if (sorted.length === 0) {
      html += `<p style="color:#999;font-size:13px;">No sales data for this week.</p>`;
    }
    for (const [name, data] of sorted.slice(0, 10)) {
      const lastQty = lastItems[name]?.qty || 0;
      let trend = '', trendClass = 'trend-flat';
      if (lastQty > 0) {
        if (data.qty > lastQty) { trend = '↑'; trendClass = 'trend-up'; }
        else if (data.qty < lastQty) { trend = '↓'; trendClass = 'trend-down'; }
        else { trend = '→'; }
      }
      html += `<div class="stat"><span>${name}</span><span class="val">${data.qty} <span class="${trendClass}" style="font-size:12px;">${trend} ${lastQty > 0 ? '(' + lastQty + ')' : ''}</span></span></div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderSlowMovers(thisWeek, lastWeek) {
    const aggregate = (data) => {
      const items = {};
      for (const day of data) {
        for (const item of (day.items || [])) {
          if (!items[item.name]) items[item.name] = { qty: 0 };
          items[item.name].qty += item.quantity || 0;
        }
      }
      return items;
    };

    const thisItems = aggregate(thisWeek);
    const lastItems = aggregate(lastWeek);

    // Items that declined significantly or sold very little
    const slow = [];
    for (const [name, data] of Object.entries(thisItems)) {
      const lastQty = lastItems[name]?.qty || 0;
      if (lastQty > 2 && data.qty < lastQty * 0.5) {
        slow.push({ name, qty: data.qty, lastQty, pctChange: ((data.qty - lastQty) / lastQty * 100) });
      } else if (data.qty <= 1 && lastQty > 3) {
        slow.push({ name, qty: data.qty, lastQty, pctChange: lastQty > 0 ? ((data.qty - lastQty) / lastQty * 100) : -100 });
      }
    }

    if (slow.length === 0) return '';

    slow.sort((a, b) => a.pctChange - b.pctChange);
    let html = `<div class="card"><h2>🐌 Slow Movers</h2>`;
    for (const item of slow.slice(0, 8)) {
      html += `<div class="stat"><span>${item.name}</span><span class="val trend-down">${item.qty} ↓ (was ${item.lastQty})</span></div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderDailyBreakdown(thisWeek) {
    const { start } = getWeekBounds(weekOffset);
    const maxRev = Math.max(...thisWeek.map(d => d.totalRevenue || 0), 1);

    let html = `<div class="card"><h2>📅 Daily Breakdown</h2>`;
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const ds = dateStr(date);
      const day = thisWeek.find(d => d.date === ds);
      const rev = day?.totalRevenue || 0;
      const orders = day?.orderCount || 0;
      const pct = (rev / maxRev * 100).toFixed(0);

      html += `<div class="daily-row">
        <span class="day">${DAYS[date.getDay()]}</span>
        <div class="daily-bar"><div class="daily-bar-fill" style="width:${pct}%"></div></div>
        <span class="rev">$${rev.toFixed(0)}</span>
        <span class="orders" style="width:50px;text-align:right;">${orders} ord</span>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderHeatmap(thisWeek) {
    // Build hour x day grid
    const grid = {};
    for (const day of thisWeek) {
      const date = new Date(day.date + 'T12:00:00');
      const dow = date.getDay();
      if (day.byHour) {
        for (const [h, data] of Object.entries(day.byHour)) {
          const key = `${h}-${dow}`;
          grid[key] = (grid[key] || 0) + (data.orders || 0);
        }
      }
    }

    if (Object.keys(grid).length === 0) return '';

    const maxOrders = Math.max(...Object.values(grid), 1);

    function cellColor(val) {
      if (val === 0) return '#f8f9fa';
      const intensity = Math.min(val / maxOrders, 1);
      const r = Math.round(102 + (255 - 102) * (1 - intensity));
      const g = Math.round(126 + (255 - 126) * (1 - intensity));
      const b = Math.round(234);
      return `rgb(${r},${g},${b})`;
    }

    let html = `<div class="card"><h2>🔥 Busiest Times</h2><div class="heatmap">`;
    html += `<div class="header"></div>`;
    for (const d of DAYS) html += `<div class="header">${d}</div>`;

    for (let h = 6; h <= 20; h++) {
      html += `<div class="hour-label">${h}:00</div>`;
      for (let dow = 0; dow < 7; dow++) {
        const val = grid[`${h}-${dow}`] || 0;
        const bg = cellColor(val);
        const textColor = val > maxOrders * 0.5 ? 'white' : '#666';
        html += `<div class="cell" style="background:${bg};color:${textColor};">${val || ''}</div>`;
      }
    }
    html += `</div></div>`;
    return html;
  }

  function renderPastryPerformance(thisWeek) {
    // Compare actual sales vs what forecast predicted
    const pastryNames = ['Cinnamon Bun', 'Banana Bread', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Lemon cake', 'Cookie', 'GF Mini Doughnut', 'Spinach Feta Croissant'];

    const actual = {};
    for (const day of thisWeek) {
      for (const item of (day.items || [])) {
        if (pastryNames.includes(item.name)) {
          if (!actual[item.name]) actual[item.name] = { qty: 0, days: 0 };
          actual[item.name].qty += item.quantity || 0;
          actual[item.name].days++;
        }
      }
    }

    if (Object.keys(actual).length === 0) return '';

    const sorted = Object.entries(actual).sort((a, b) => b[1].qty - a[1].qty);

    let html = `<div class="card"><h2>🥐 Pastry Performance</h2>`;
    for (const [name, data] of sorted) {
      const avgPerDay = data.days > 0 ? (data.qty / data.days).toFixed(1) : 0;
      html += `<div class="pastry-row">
        <span>${name}</span>
        <span><strong>${data.qty}</strong> sold <span style="color:#999;font-size:12px;">(${avgPerDay}/day)</span></span>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  async function loadAllDaily() {
    // Try to discover daily files by fetching an index, or brute-force recent dates
    const files = [];
    const end = new Date();
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 120); // Look back ~4 months

    const promises = [];
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = dateStr(d);
      dates.push(ds);
      promises.push(fetchJSON(`data/daily/${ds}.json`));
    }

    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        results[i].date = results[i].date || dates[i];
        files.push(results[i]);
      }
    }
    return files;
  }

  function render() {
    const thisWeek = getWeekData(weekOffset);
    const lastWeek = getWeekData(weekOffset - 1);
    const { start, end } = getWeekBounds(weekOffset);

    $dateRange.textContent = `${formatDate(start)} – ${formatDate(end)}`;
    $weekLabel.textContent = weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} weeks ago`;

    if (thisWeek.length === 0 && lastWeek.length === 0) {
      $content.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p><strong>No sales data for this week</strong></p><p style="margin-top:8px;font-size:13px;">Try navigating to a week with Square data.</p></div>`;
      return;
    }

    let html = '';
    html += renderRevenue(thisWeek, lastWeek);
    html += renderDailyBreakdown(thisWeek);
    html += renderTopSellers(thisWeek, lastWeek);
    html += renderSlowMovers(thisWeek, lastWeek);
    html += renderHeatmap(thisWeek);
    html += renderPastryPerformance(thisWeek);
    $content.innerHTML = html;
  }

  window.prevWeek = function () { weekOffset--; render(); };
  window.nextWeek = function () { if (weekOffset < 0) { weekOffset++; render(); } };

  loadAllDaily().then(data => {
    allDaily = data;
    render();
  });
})();
