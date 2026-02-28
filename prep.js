/**
 * Prep List — Smart prep lists, supply calculator, freezer alerts.
 * Reads forecast.json + config.json to generate actionable prep guidance.
 *
 * KEY LOGIC: Freezer pulls happen at CLOSING (night before).
 * Pastries thaw overnight and are ready for the next morning.
 * - "Tonight's prep" = based on TOMORROW's forecast
 * - "Today's display" = based on TODAY's forecast (what was prepped last night)
 */
(function () {
  let forecast = null;
  let config = null;

  const $todayView = document.getElementById('todayView');
  const $weekView = document.getElementById('weekView');
  const $suppliesView = document.getElementById('suppliesView');
  const $dateLabel = document.getElementById('dateLabel');
  const $updated = document.getElementById('updated');

  function today() { return new Date().toISOString().substring(0, 10); }

  function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().substring(0, 10);
  }

  async function fetchJSON(path) {
    try { const r = await fetch(path); return r.ok ? r.json() : null; } catch { return null; }
  }

  // --- Tab switching ---
  window.showTab = function (tab) {
    ['today', 'week', 'supplies'].forEach(t => {
      document.getElementById(t + 'View').style.display = t === tab ? '' : 'none';
      document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
    });
  };

  // --- Get forecast for a specific date (fallback to first available) ---
  function getForecastForDate(dateKey) {
    if (!forecast?.forecast) return null;
    if (forecast.forecast[dateKey]) return { date: dateKey, ...forecast.forecast[dateKey] };
    return null;
  }

  // --- Get today's forecast ---
  function getTodayForecast() {
    if (!forecast?.forecast) return null;
    const todayKey = today();
    if (forecast.forecast[todayKey]) return { date: todayKey, ...forecast.forecast[todayKey] };
    const dates = Object.keys(forecast.forecast).sort();
    if (dates.length > 0) return { date: dates[0], ...forecast.forecast[dates[0]] };
    return null;
  }

  // --- Get tomorrow's forecast ---
  function getTomorrowForecast() {
    return getForecastForDate(tomorrow());
  }

  // --- Pastry prep calculations ---
  function getPastryPrep(fc) {
    if (!fc?.items || !config?.thresholds) return [];
    const items = [];
    for (const [name, thresh] of Object.entries(config.thresholds)) {
      const predicted = fc.items[name]?.predicted || 0;
      const displayTarget = Math.max(thresh.displayMin, Math.ceil(predicted * 0.4));
      const totalNeeded = predicted + thresh.displayMin;
      const pullFromFreezer = Math.max(0, Math.ceil(totalNeeded * 0.6));
      const needsBaking = ['Cinnamon Bun', 'Ham and Cheese Croissant', 'Chocolate Croissant', 'Plain Croissant', 'Spinach Feta Croissant'].includes(name);

      items.push({
        name,
        predicted,
        displayTarget,
        pullFromFreezer,
        needsBaking,
        freezerMin: thresh.freezerMin,
        displayMin: thresh.displayMin
      });
    }
    return items.sort((a, b) => b.predicted - a.predicted);
  }

  // --- Supply calculations ---
  function calcSupplies(fc) {
    if (!fc?.items || !config?.recipes) return null;
    let totalMilkMl = 0;
    let totalShots = 0;
    let totalDripBeansG = 0;
    let totalChocolateOz = 0;

    for (const [name, data] of Object.entries(fc.items)) {
      const recipe = config.recipes[name];
      if (!recipe) continue;
      const qty = data.predicted || 0;
      totalMilkMl += (recipe.milk_ml || 0) * qty;
      totalShots += (recipe.shots || 0) * qty;
      totalDripBeansG += (recipe.beans_g || 0) * qty;
      totalChocolateOz += (recipe.chocolate_oz || 0) * qty;
    }

    const beansPerShot = config.ingredients?.beans_per_shot_g || 18;
    const totalBeansG = totalShots * beansPerShot + totalDripBeansG;
    const milkLiters = totalMilkMl / 1000;
    const milkJugs = milkLiters / (config.ingredients?.milk_jug_liters || 4);
    const beansBags = totalBeansG / (config.ingredients?.beans_per_5lb_bag_g || 2268);

    return {
      milkLiters: Math.round(milkLiters * 10) / 10,
      milkJugs: Math.round(milkJugs * 10) / 10,
      totalBeansG: Math.round(totalBeansG),
      beansBags: Math.round(beansBags * 10) / 10,
      totalShots,
      chocolateOz: Math.round(totalChocolateOz * 10) / 10
    };
  }

  // --- Render today view ---
  function renderToday() {
    const todayFc = getTodayForecast();
    const tomorrowFc = getTomorrowForecast();

    if (!todayFc && !tomorrowFc) {
      $todayView.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>No forecast data available.</p></div>';
      return;
    }

    const dayName = todayFc?.dayOfWeek || '';
    $dateLabel.textContent = `${dayName} — ${todayFc?.date || today()}`;

    let html = '';

    // === SECTION 1: Today's Display (what was prepped last night) ===
    if (todayFc) {
      const todayPrep = getPastryPrep(todayFc);
      const supplies = calcSupplies(todayFc);

      // Morning display guidance
      html += '<div class="card"><h2>🌅 Today\'s Display</h2>';
      html += '<p style="font-size:12px;color:#888;margin-bottom:10px;">Based on today\'s forecast — arrange thawed pastries on display</p>';

      for (const item of todayPrep) {
        if (item.predicted === 0 && item.pullFromFreezer === 0) continue;
        html += `<div class="prep-item">
          <div>
            <div class="prep-name">${item.name}</div>
            <div class="prep-detail">Expected sales: ${item.predicted} · Display min: ${item.displayMin}+ · ${item.needsBaking ? '🔥 Bake' : '📦 Display'}</div>
          </div>
          <div class="prep-qty">
            <div class="big">${item.predicted}</div>
            <div class="unit">expected today</div>
          </div>
        </div>`;
      }

      // Mid-morning alerts
      const hotItems = todayPrep.filter(item => item.predicted >= item.freezerMin && item.predicted > 0);
      if (hotItems.length > 0) {
        html += '<h3><span class="time-badge time-mid">Mid-Morning Check</span></h3>';
        for (const item of hotItems) {
          html += `<div class="alert alert-hot">🔥 ${item.name} selling fast — predicted ${item.predicted} today, ensure ${item.displayMin}+ on display</div>`;
        }
      }
      html += '</div>';

      // Quick supply snapshot
      if (supplies) {
        html += '<div class="card"><h2>📦 Supply Snapshot</h2>';
        html += `<div class="supply-row"><span>🥛 Milk needed</span><span class="supply-val">${supplies.milkLiters}L <span class="supply-sub">(~${supplies.milkJugs} jugs)</span></span></div>`;
        html += `<div class="supply-row"><span>☕ Beans needed</span><span class="supply-val">${supplies.totalBeansG}g <span class="supply-sub">(~${supplies.beansBags} 5lb bags)</span></span></div>`;
        html += `<div class="supply-row"><span>💉 Espresso shots</span><span class="supply-val">${supplies.totalShots}</span></div>`;
        if (supplies.chocolateOz > 0) {
          html += `<div class="supply-row"><span>🍫 Chocolate</span><span class="supply-val">${supplies.chocolateOz} oz</span></div>`;
        }
        html += '</div>';
      }
    }

    // === SECTION 2: Tonight's Closing Prep (for tomorrow) ===
    if (tomorrowFc) {
      const tomorrowPrep = getPastryPrep(tomorrowFc);
      const tomorrowDay = tomorrowFc.dayOfWeek || '';

      html += '<div class="card" style="border: 2px solid #2196f3; background: #f8fbff;">';
      html += `<h2>🧊 Tonight's Closing Prep <span style="font-size:12px;font-weight:400;color:#888;">(for ${tomorrowDay} ${tomorrowFc.date})</span></h2>`;
      html += '<p style="font-size:12px;color:#1565c0;margin-bottom:10px;">Pull these from freezer tonight — they need to thaw overnight</p>';

      const freezerItems = tomorrowPrep.filter(item => item.pullFromFreezer > 0);
      if (freezerItems.length > 0) {
        for (const item of freezerItems) {
          const bakeNote = item.needsBaking ? ' · 🔥 Bake in morning' : ' · Thaw only';
          html += `<div class="alert alert-freezer">🧊 Pull <strong>${item.pullFromFreezer} ${item.name}</strong> from freezer tonight${bakeNote}</div>`;
        }
      } else {
        html += '<div class="alert alert-ok">✅ No freezer pulls needed for tomorrow</div>';
      }

      // Summary table
      if (freezerItems.length > 0) {
        html += '<div style="margin-top:10px;">';
        for (const item of freezerItems) {
          html += `<div class="prep-item">
            <div>
              <div class="prep-name">${item.name}</div>
              <div class="prep-detail">Tomorrow's predicted: ${item.predicted} · ${item.needsBaking ? '🔥 Bake' : '🧊 Thaw'}</div>
            </div>
            <div class="prep-qty">
              <div class="big">${item.pullFromFreezer}</div>
              <div class="unit">from freezer</div>
            </div>
          </div>`;
        }
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="card"><h2>🧊 Tonight\'s Closing Prep</h2>';
      html += '<div class="alert alert-warn">⚠️ No forecast available for tomorrow — check with manager for freezer pull quantities</div>';
      html += '</div>';
    }

    $todayView.innerHTML = html || '<div class="empty-state"><div class="icon">✅</div><p>No prep needed today.</p></div>';
  }

  // --- Render week view ---
  function renderWeek() {
    if (!forecast?.forecast) {
      $weekView.innerHTML = '<div class="empty-state"><p>No forecast data.</p></div>';
      return;
    }

    const dates = Object.keys(forecast.forecast).sort();
    const todayKey = today();

    // Weekly pastry overview
    let html = '<div class="card"><h2>📅 Week Pastry Needs</h2>';
    html += '<p style="font-size:11px;color:#888;margin-bottom:8px;">💡 Freezer pulls happen at closing for the NEXT day</p>';
    html += '<div style="overflow-x:auto;">';

    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr><th style="text-align:left;padding:6px 4px;">Item</th>';
    for (const date of dates) {
      const fc = forecast.forecast[date];
      const isToday = date === todayKey;
      html += `<th style="padding:6px 4px;text-align:center;${isToday ? 'background:#e8ebf7;border-radius:4px;' : ''}">${fc.dayOfWeek.substring(0, 3)}</th>`;
    }
    html += '</tr></thead><tbody>';

    if (config?.thresholds) {
      for (const [name] of Object.entries(config.thresholds)) {
        html += `<tr><td style="padding:6px 4px;font-weight:600;white-space:nowrap;">${name}</td>`;
        for (const date of dates) {
          const fc = forecast.forecast[date];
          const predicted = fc.items?.[name]?.predicted || 0;
          const isToday = date === todayKey;
          const bg = isToday ? 'background:#e8ebf7;' : '';
          const color = predicted >= 6 ? 'color:#e91e63;font-weight:700;' : predicted >= 3 ? 'color:#ff9800;font-weight:600;' : '';
          html += `<td style="padding:6px 4px;text-align:center;${bg}${color}">${predicted}</td>`;
        }
        html += '</tr>';
      }
    }

    html += '</tbody></table></div></div>';

    // Weekly revenue outlook
    html += '<div class="card"><h2>💰 Revenue Outlook</h2><div class="week-grid">';
    for (const date of dates) {
      const fc = forecast.forecast[date];
      const isToday = date === todayKey;
      html += `<div class="week-cell ${isToday ? 'today' : ''}">
        <div class="day">${fc.dayOfWeek.substring(0, 3)}</div>
        <div class="count">$${fc.totalRevenue?.predicted || 0}</div>
        <div style="font-size:10px;color:#999;">${date.substring(5)}</div>
      </div>`;
    }
    html += '</div></div>';

    $weekView.innerHTML = html;
  }

  // --- Render supplies view ---
  function renderSupplies() {
    if (!forecast?.forecast || !config?.recipes) {
      $suppliesView.innerHTML = '<div class="empty-state"><p>No data.</p></div>';
      return;
    }

    const dates = Object.keys(forecast.forecast).sort();
    let html = '';

    html += '<div class="card"><h2>🥛 Daily Milk & Beans Forecast</h2>';
    for (const date of dates) {
      const fc = forecast.forecast[date];
      const supplies = calcSupplies(fc);
      if (!supplies) continue;
      const isToday = date === today();
      html += `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;${isToday ? 'background:#f0f4ff;margin:0 -16px;padding:8px 16px;border-radius:6px;' : ''}">
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span style="font-weight:600;">${fc.dayOfWeek.substring(0, 3)} ${date.substring(5)} ${isToday ? '← today' : ''}</span>
          <span>🥛 ${supplies.milkLiters}L · ☕ ${supplies.totalBeansG}g</span>
        </div>
      </div>`;
    }
    html += '</div>';

    let weekMilk = 0, weekBeans = 0, weekShots = 0;
    for (const date of dates) {
      const fc = forecast.forecast[date];
      const s = calcSupplies(fc);
      if (s) {
        weekMilk += s.milkLiters;
        weekBeans += s.totalBeansG;
        weekShots += s.totalShots;
      }
    }

    html += '<div class="card"><h2>📊 Weekly Totals</h2>';
    html += `<div class="supply-row"><span>🥛 Total Milk</span><span class="supply-val">${Math.round(weekMilk * 10) / 10}L <span class="supply-sub">(~${Math.round(weekMilk / (config.ingredients?.milk_jug_liters || 4) * 10) / 10} jugs)</span></span></div>`;
    html += `<div class="supply-row"><span>☕ Total Beans</span><span class="supply-val">${Math.round(weekBeans)}g <span class="supply-sub">(~${Math.round(weekBeans / (config.ingredients?.beans_per_5lb_bag_g || 2268) * 10) / 10} 5lb bags)</span></span></div>`;
    html += `<div class="supply-row"><span>💉 Total Shots</span><span class="supply-val">${weekShots}</span></div>`;
    html += '</div>';

    html += '<div class="card"><h2>📦 Days of Supply</h2>';
    html += '<p style="font-size:12px;color:#999;margin-bottom:10px;">Based on closing checklist targets: 5 milk jugs, 2 five-pound bean bags</p>';
    const avgDailyMilk = weekMilk / dates.length;
    const avgDailyBeans = weekBeans / dates.length;
    const milkStock = 5 * (config.ingredients?.milk_jug_liters || 4);
    const beansStock = 2 * (config.ingredients?.beans_per_5lb_bag_g || 2268);
    const milkDays = avgDailyMilk > 0 ? Math.round(milkStock / avgDailyMilk * 10) / 10 : '∞';
    const beansDays = avgDailyBeans > 0 ? Math.round(beansStock / avgDailyBeans * 10) / 10 : '∞';

    html += `<div class="supply-row"><span>🥛 Milk (5 jugs = ${milkStock}L)</span><span class="supply-val" style="${typeof milkDays === 'number' && milkDays < 2 ? 'color:#e91e63;' : ''}">${milkDays} days</span></div>`;
    html += `<div class="supply-row"><span>☕ Beans (2 bags = ${Math.round(beansStock)}g)</span><span class="supply-val" style="${typeof beansDays === 'number' && beansDays < 2 ? 'color:#e91e63;' : ''}">${beansDays} days</span></div>`;
    html += '</div>';

    $suppliesView.innerHTML = html;
  }

  // --- Init ---
  async function init() {
    [forecast, config] = await Promise.all([
      fetchJSON('data/forecast.json'),
      fetchJSON('data/config.json')
    ]);

    renderToday();
    renderWeek();
    renderSupplies();

    if (forecast?.generated) {
      $updated.textContent = `Forecast updated: ${new Date(forecast.generated).toLocaleString()}`;
    }
  }

  init();
  setInterval(init, 5 * 60 * 1000);
})();
