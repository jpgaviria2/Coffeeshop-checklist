#!/usr/bin/env node
/**
 * Forecasting Engine
 * Reads daily sales data and generates weighted day-of-week forecasts.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const DAILY = join(DATA, 'daily');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Weights: most recent week = 0.4, then 0.3, 0.2, 0.1
const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

function loadDailyFiles() {
  if (!existsSync(DAILY)) return [];
  return readdirSync(DAILY)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try { return JSON.parse(readFileSync(join(DAILY, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

function generateForecast(dailyData) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Group daily data by day of week
  const byDow = {};
  for (let d = 0; d < 7; d++) byDow[d] = [];

  for (const day of dailyData) {
    const date = new Date(day.date + 'T12:00:00');
    const dow = date.getDay();
    byDow[dow].push(day);
  }

  // For each day of week, get last 4 occurrences and compute weighted average
  const forecast = {};

  for (let offset = 0; offset < 7; offset++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr = targetDate.toISOString().substring(0, 10);
    const dow = targetDate.getDay();
    const dayName = DAY_NAMES[dow];

    // Get recent entries for this day of week (most recent first)
    const recent = byDow[dow].slice(-4).reverse();

    if (recent.length === 0) {
      forecast[dateStr] = { dayOfWeek: dayName, items: {}, totalRevenue: { predicted: 0 }, noData: true };
      continue;
    }

    // Normalize weights based on available data
    const availWeights = WEIGHTS.slice(0, recent.length);
    const wSum = availWeights.reduce((a, b) => a + b, 0);
    const normWeights = availWeights.map(w => w / wSum);

    // Aggregate items across weeks
    const allItems = new Set();
    for (const day of recent) {
      for (const item of (day.items || [])) allItems.add(item.name);
    }

    const items = {};
    let totalRevPredicted = 0;

    for (const itemName of allItems) {
      let weightedQty = 0;
      let totalQty = 0;
      let count = 0;

      for (let i = 0; i < recent.length; i++) {
        const match = (recent[i].items || []).find(it => it.name === itemName);
        const qty = match?.quantity || 0;
        weightedQty += qty * normWeights[i];
        totalQty += qty;
        count++;
      }

      items[itemName] = {
        predicted: Math.round(weightedQty),
        avgLastMonth: count > 0 ? Math.round((totalQty / count) * 10) / 10 : 0
      };
    }

    // Revenue forecast
    let weightedRev = 0;
    for (let i = 0; i < recent.length; i++) {
      weightedRev += (recent[i].totalRevenue || 0) * normWeights[i];
    }
    totalRevPredicted = Math.round(weightedRev);

    forecast[dateStr] = {
      dayOfWeek: dayName,
      items,
      totalRevenue: { predicted: totalRevPredicted }
    };
  }

  return {
    generated: now.toISOString(),
    forecast
  };
}

// --- Main ---
const dailyData = loadDailyFiles();
if (dailyData.length === 0) {
  console.log('📊 No daily sales data yet. Generating empty forecast.');
}

const forecast = generateForecast(dailyData);
writeFileSync(join(DATA, 'forecast.json'), JSON.stringify(forecast, null, 2));
console.log(`✅ Forecast generated for ${Object.keys(forecast.forecast).length} days (based on ${dailyData.length} daily files).`);
