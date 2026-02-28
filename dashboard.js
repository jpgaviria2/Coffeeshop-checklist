/**
 * Dashboard — fetches forecast + daily sales data and renders.
 * Pure vanilla JS, no dependencies.
 *
 * KEY LOGIC: Freezer pulls happen at CLOSING (night before).
 * - Tonight's alerts = based on TOMORROW's forecast
 * - Morning alerts = arrange thawed pastries, check display counts
 */
(function () {
  const BASE = '';
  const $content = document.getElementById('content');
  const $updated = document.getElementById('updated');

  async function fetchJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().substring(0, 10);
  }

  function today() {
    return new Date().toISOString().substring(0, 10);
  }

  function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().substring(0, 10);
  }

  function renderEmpty() {
    $content.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔌</div>
        <p><strong>Connect Square to see sales data</strong></p>
        <p style="margin-top:8px;font-size:13px;">Once Square is connected, you'll see daily sales, forecasts, and inventory alerts here.</p>
      </div>`;
  }

  function renderAlerts(forecast, config) {
    if (!forecast || !config?.thresholds) return '';

    const todayFc = forecast.forecast?.[today()];
    const tomorrowFc = forecast.forecast?.[tomorrow()];
    const tomorrowDay = tomorrowFc?.dayOfWeek || 'tomorrow';

    const bakeable = ['Cinnamon Bun', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Spinach Feta Croissant'];
    let morningAlerts = '';
    let freezerAlerts = '';
    let hotAlerts = '';

    // Morning alerts: arrange thawed pastries based on TODAY's forecast
    if (todayFc && !todayFc.noData) {
      const todayItems = [];
      for (const [item, thresh] of Object.entries(config.thresholds)) {
        const predicted = todayFc.items?.[item]?.predicted || 0;
        if (predicted > 0) {
          todayItems.push({ name: item, predicted, displayMin: thresh.displayMin });
        }
      }
      if (todayItems.length > 0) {
        morningAlerts += `<div class="alert" style="background:#e8f5e9;border-left:4px solid #4caf50;">🌅 <strong>Morning:</strong> Arrange thawed pastries on display</div>`;
        for (const item of todayItems.sort((a, b) => b.predicted - a.predicted).slice(0, 5)) {
          morningAlerts += `<div class="alert" style="background:#f1f8e9;">📦 <strong>${item.name}</strong> — expected ${item.predicted} today, display ${item.displayMin}+</div>`;
        }
      }

      // Hot sellers today
      for (const [item, thresh] of Object.entries(config.thresholds)) {
        const predicted = todayFc.items?.[item]?.predicted || 0;
        if (predicted >= thresh.freezerMin) {
          hotAlerts += `<div class="alert danger">🔥 <strong>${item}</strong> selling fast — predicted ${predicted} today, ensure ${thresh.displayMin}+ on display</div>`;
        }
      }
    }

    // Tonight's freezer alerts: based on TOMORROW's forecast
    if (tomorrowFc && !tomorrowFc.noData) {
      for (const [item, thresh] of Object.entries(config.thresholds)) {
        const predicted = tomorrowFc.items?.[item]?.predicted || 0;
        if (predicted === 0) continue;

        const totalNeeded = predicted + thresh.displayMin;
        const pullFromFreezer = Math.max(0, Math.ceil(totalNeeded * 0.6));

        if (pullFromFreezer > 0) {
          const action = bakeable.includes(item) ? '🧊→🍞' : '🧊';
          freezerAlerts += `<div class="alert">${action} Tonight: Pull <strong>${pullFromFreezer} ${item}</strong> from freezer for ${tomorrowDay}</div>`;
        }
      }
    }

    let html = '';
    if (morningAlerts || freezerAlerts || hotAlerts) {
      html = `<div class="card"><h2>🚨 Prep Alerts</h2>`;
      if (morningAlerts) html += morningAlerts;
      if (hotAlerts) html += hotAlerts;
      if (freezerAlerts) {
        html += `<div style="margin-top:8px;padding-top:8px;border-top:2px solid #e3f2fd;">`;
        html += `<div style="font-weight:600;color:#1565c0;font-size:13px;margin-bottom:6px;">🧊 Tonight's Closing Prep (for ${tomorrowDay})</div>`;
        html += freezerAlerts;
        html += `</div>`;
      }
      html += `<div style="text-align:center;margin-top:8px;"><a href="prep.html" style="color:#667eea;font-weight:600;font-size:13px;">📝 Open Full Prep List →</a></div>`;
      html += '</div>';
    }
    return html;
  }

  function renderForecastToday(forecast) {
    const fc = forecast?.forecast?.[today()];
    if (!fc || fc.noData) return '<div class="card"><h2>📊 Today\'s Forecast</h2><p style="color:#999;font-size:13px;">No forecast data yet.</p></div>';

    let items = Object.entries(fc.items).sort((a, b) => b[1].predicted - a[1].predicted);
    let html = `<div class="card"><h2>📊 Today's Forecast — ${fc.dayOfWeek}</h2>`;
    html += `<div class="stat"><span>Predicted Revenue</span><span class="val">$${fc.totalRevenue.predicted}</span></div>`;
    html += '<h3>Top Items</h3>';
    for (const [name, data] of items.slice(0, 10)) {
      if (data.predicted === 0) continue;
      html += `<div class="stat"><span>${name}</span><span class="val">${data.predicted} <span style="color:#999;font-weight:400;">(avg ${data.avgLastMonth})</span></span></div>`;
    }
    html += '</div>';
    return html;
  }

  function renderYesterday(daily) {
    if (!daily) return '';
    let html = `<div class="card"><h2>📋 Yesterday — ${daily.date}</h2>`;
    html += `<div class="stat"><span>Orders</span><span class="val">${daily.orderCount}</span></div>`;
    html += `<div class="stat"><span>Revenue</span><span class="val">$${daily.totalRevenue}</span></div>`;

    html += '<h3>Sales by Item</h3>';
    for (const item of (daily.items || []).slice(0, 12)) {
      html += `<div class="stat"><span>${item.name}</span><span class="val">${item.quantity} — $${item.revenue.toFixed(0)}</span></div>`;
    }

    if (daily.byHour && Object.keys(daily.byHour).length > 0) {
      html += '<h3>Sales by Hour</h3>';
      const maxOrders = Math.max(...Object.values(daily.byHour).map(h => h.orders));
      for (let h = 6; h <= 20; h++) {
        const data = daily.byHour[h];
        if (!data) continue;
        const pct = maxOrders > 0 ? (data.orders / maxOrders) * 100 : 0;
        html += `<div class="bar-row">
          <span class="bar-label">${h}:00</span>
          <div class="bar" style="width:${pct}%"></div>
          <span class="bar-val">${data.orders} ($${data.revenue.toFixed(0)})</span>
        </div>`;
      }
    }

    html += '</div>';
    return html;
  }

  function renderWeekOutlook(forecast) {
    if (!forecast?.forecast) return '';
    const dates = Object.keys(forecast.forecast).sort();
    if (dates.length === 0) return '';

    let html = '<div class="card"><h2>📅 Week Ahead</h2><div class="week-card">';
    for (const date of dates) {
      const fc = forecast.forecast[date];
      const shortDate = date.substring(5);
      html += `<div class="week-day">
        <div class="day-name">${fc.dayOfWeek.substring(0, 3)}</div>
        <div style="color:#999;">${shortDate}</div>
        <div class="day-rev">$${fc.totalRevenue?.predicted || 0}</div>
      </div>`;
    }
    html += '</div></div>';
    return html;
  }

  async function render() {
    const [forecast, dailyYesterday, config] = await Promise.all([
      fetchJSON('data/forecast.json'),
      fetchJSON(`data/daily/${yesterday()}.json`),
      fetchJSON('data/config.json')
    ]);

    if (!forecast && !dailyYesterday) {
      renderEmpty();
      return;
    }

    let html = '';
    html += renderAlerts(forecast, config);
    html += renderForecastToday(forecast);
    html += renderYesterday(dailyYesterday);
    html += renderWeekOutlook(forecast);

    $content.innerHTML = html || '<div class="empty-state"><div class="icon">📊</div><p>No data available yet.</p></div>';

    if (forecast?.generated) {
      const d = new Date(forecast.generated);
      $updated.textContent = `Last updated: ${d.toLocaleString()}`;
    }
  }

  render();
  setInterval(render, 5 * 60 * 1000);
})();
