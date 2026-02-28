#!/usr/bin/env node
/**
 * Forecasting Engine
 * Reads daily sales data and generates weighted day-of-week forecasts.
 * Phase 3: Weather-based demand adjustment + reorder alerts.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const DAILY = join(DATA, 'daily');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

// Anmore, BC coordinates
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=49.31&longitude=-122.86&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=America/Vancouver';

// Weather code descriptions
const WEATHER_CODES = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Light snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail'
};

// Iced drink items
const ICED_ITEMS = ['Iced Latte', 'Iced Americano', 'Iced Coffee', 'Iced Vanilla Matcha', 'Iced Pure Matcha'];
const HOT_ITEMS = ['Latte', 'Cappuccino', 'Flat White', 'Americano', 'Mocha', 'Cortado', 'Macchiato', 'Espresso', 'Hot Chocolate', 'Chai Latte', 'London Fog Latte', 'Drip Coffee', 'Vanilla Matcha', 'Hot Pure Matcha'];

// Reorder thresholds (days of supply before reorder)
const REORDER_THRESHOLDS = {
  'Oat Milk 1L': { dailyUsage: 3, minDays: 2, unit: 'cartons' },
  'Regular Beans 5lb': { dailyUsage: 0.7, minDays: 3, unit: 'bags' },
  'Decaf Beans 5lb': { dailyUsage: 0.2, minDays: 5, unit: 'bags' },
  '3.5% Milk': { dailyUsage: 4, minDays: 2, unit: 'jugs' },
  '2% Milk': { dailyUsage: 3, minDays: 2, unit: 'jugs' },
  'Whipping Cream': { dailyUsage: 0.5, minDays: 3, unit: 'cartons' },
  'Greek Yogurt 3kg': { dailyUsage: 0.3, minDays: 3, unit: 'tubs' }
};

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

async function fetchWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) { console.log('⚠️ Weather API returned', res.status); return null; }
    const data = await res.json();
    const weather = {};
    const daily = data.daily;
    if (!daily?.time) return null;

    for (let i = 0; i < daily.time.length; i++) {
      const code = daily.weathercode[i];
      weather[daily.time[i]] = {
        tempMax: daily.temperature_2m_max[i],
        tempMin: daily.temperature_2m_min?.[i] ?? null,
        precipitation: daily.precipitation_sum[i],
        weatherCode: code,
        condition: WEATHER_CODES[code] || 'Unknown',
        isRainy: daily.precipitation_sum[i] > 1,
        isCold: daily.temperature_2m_max[i] < 5,
        isVeryCold: daily.temperature_2m_max[i] < 0,
        isWarm: daily.temperature_2m_max[i] > 18,
        emoji: code <= 1 ? '☀️' : code <= 3 ? '⛅' : code >= 61 && code <= 67 ? '🌧️' : code >= 71 && code <= 77 ? '❄️' : code >= 80 ? '🌦️' : '☁️'
      };
    }
    return weather;
  } catch (err) {
    console.log('⚠️ Weather fetch failed:', err.message);
    return null;
  }
}

function applyWeatherAdjustment(items, weatherDay, dateStr) {
  if (!weatherDay) return items;

  const adjusted = { ...items };
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  const isWeekend = dow === 0 || dow === 6;

  for (const [name, data] of Object.entries(adjusted)) {
    let multiplier = 1.0;
    const isIced = ICED_ITEMS.includes(name);
    const isHot = HOT_ITEMS.includes(name);

    if (weatherDay.isRainy || weatherDay.isCold) {
      if (isHot) multiplier *= 1.15;
      if (isIced) multiplier *= 0.80;
    }

    if (weatherDay.isVeryCold) {
      if (isHot) multiplier *= 1.25 / 1.15; // additional on top
    }

    if (weatherDay.isWarm && !weatherDay.isRainy) {
      if (isIced) multiplier *= 1.20;
      if (isWeekend) multiplier *= 1.10;
    }

    adjusted[name] = {
      ...data,
      predicted: Math.round(data.predicted * multiplier),
      weatherAdjusted: multiplier !== 1.0
    };
  }
  return adjusted;
}

function generateForecast(dailyData, weather) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const byDow = {};
  for (let d = 0; d < 7; d++) byDow[d] = [];
  for (const day of dailyData) {
    const date = new Date(day.date + 'T12:00:00');
    byDow[date.getDay()].push(day);
  }

  const forecast = {};
  for (let offset = 0; offset < 7; offset++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr = targetDate.toISOString().substring(0, 10);
    const dow = targetDate.getDay();
    const dayName = DAY_NAMES[dow];

    const recent = byDow[dow].slice(-4).reverse();
    if (recent.length === 0) {
      forecast[dateStr] = { dayOfWeek: dayName, items: {}, totalRevenue: { predicted: 0 }, noData: true };
      continue;
    }

    const availWeights = WEIGHTS.slice(0, recent.length);
    const wSum = availWeights.reduce((a, b) => a + b, 0);
    const normWeights = availWeights.map(w => w / wSum);

    const allItems = new Set();
    for (const day of recent) {
      for (const item of (day.items || [])) allItems.add(item.name);
    }

    let items = {};
    for (const itemName of allItems) {
      let weightedQty = 0, totalQty = 0, count = 0;
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

    // Apply weather adjustment
    const weatherDay = weather?.[dateStr];
    if (weatherDay) {
      items = applyWeatherAdjustment(items, weatherDay, dateStr);
    }

    let weightedRev = 0;
    for (let i = 0; i < recent.length; i++) {
      weightedRev += (recent[i].totalRevenue || 0) * normWeights[i];
    }

    // Adjust revenue for weather too (rough: warm weekend = +10%)
    let revMultiplier = 1.0;
    if (weatherDay?.isWarm && !weatherDay?.isRainy && (dow === 0 || dow === 6)) revMultiplier = 1.10;

    forecast[dateStr] = {
      dayOfWeek: dayName,
      items,
      totalRevenue: { predicted: Math.round(weightedRev * revMultiplier) },
      weather: weatherDay ? {
        emoji: weatherDay.emoji,
        temp: weatherDay.tempMax,
        condition: weatherDay.condition,
        precipitation: weatherDay.precipitation
      } : null
    };
  }

  return { generated: now.toISOString(), forecast };
}

function generateAlerts(forecast, weather) {
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().substring(0, 10);

  // Reorder alerts based on estimated consumption
  const reorder = [];
  for (const [item, config] of Object.entries(REORDER_THRESHOLDS)) {
    const daysOfSupply = config.minDays; // Placeholder — real data would come from inventory counts
    const urgency = daysOfSupply <= 1.5 ? 'high' : daysOfSupply <= 3 ? 'medium' : 'low';
    const daysUntilReorder = Math.max(0, Math.floor(daysOfSupply - config.minDays));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const orderByDate = new Date(now);
    orderByDate.setDate(orderByDate.getDate() + daysUntilReorder);
    const orderBy = daysUntilReorder === 0 ? 'today' : daysUntilReorder === 1 ? 'tomorrow' : dayNames[orderByDate.getDay()];

    if (urgency !== 'low') {
      reorder.push({ item, daysOfSupply, orderBy, urgency, unit: config.unit });
    }
  }

  // Weather summary for tomorrow
  const tomorrowWeather = weather?.[tomorrowStr];
  let weatherSummary = null;
  if (tomorrowWeather) {
    const adjustments = [];
    if (tomorrowWeather.isRainy || tomorrowWeather.isCold) adjustments.push('+15% hot drinks');
    if (tomorrowWeather.isRainy) adjustments.push('-20% iced drinks');
    if (tomorrowWeather.isVeryCold) adjustments.push('+25% hot drinks');
    if (tomorrowWeather.isWarm) adjustments.push('+20% iced drinks');
    weatherSummary = {
      tomorrow: {
        temp: tomorrowWeather.tempMax,
        condition: tomorrowWeather.condition,
        emoji: tomorrowWeather.emoji,
        adjustment: adjustments.join(', ') || 'Normal demand expected'
      }
    };
  }

  return {
    generated: now.toISOString(),
    reorder,
    weather: weatherSummary
  };
}

// --- Main ---
async function main() {
  const dailyData = loadDailyFiles();
  if (dailyData.length === 0) {
    console.log('📊 No daily sales data yet. Generating empty forecast.');
  }

  // Fetch weather
  console.log('🌤️ Fetching weather forecast...');
  const weather = await fetchWeather();
  if (weather) {
    writeFileSync(join(DATA, 'weather.json'), JSON.stringify({ generated: new Date().toISOString(), forecast: weather }, null, 2));
    console.log(`✅ Weather data saved for ${Object.keys(weather).length} days.`);
  }

  // Generate forecast with weather adjustments
  const forecast = generateForecast(dailyData, weather);
  writeFileSync(join(DATA, 'forecast.json'), JSON.stringify(forecast, null, 2));
  console.log(`✅ Forecast generated for ${Object.keys(forecast.forecast).length} days (based on ${dailyData.length} daily files).`);

  // Generate alerts
  const alerts = generateAlerts(forecast, weather);
  writeFileSync(join(DATA, 'alerts.json'), JSON.stringify(alerts, null, 2));
  console.log(`✅ Alerts generated: ${alerts.reorder.length} reorder alerts.`);
}

main().catch(err => {
  console.error('❌ Forecast generation failed:', err);
  process.exit(1);
});
