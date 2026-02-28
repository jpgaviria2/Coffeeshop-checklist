#!/usr/bin/env node
/**
 * Square Sales Data Sync
 * Pulls orders and catalog from Square API, saves to data/ directory.
 * Run via GitHub Actions or manually with environment variables set.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const DAILY = join(DATA, 'daily');

const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const BASE_URL = 'https://connect.squareup.com/v2';

// Ensure directories exist
mkdirSync(DAILY, { recursive: true });

if (!SQUARE_TOKEN || !LOCATION_ID) {
  console.log('⚠️  SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID not set.');
  console.log('   Set these as GitHub Secrets to enable Square sync.');
  console.log('   Skipping sync.');
  process.exit(0);
}

// --- API helpers ---

async function squareGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function squarePost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Catalog sync ---

async function syncCatalog() {
  console.log('📦 Syncing catalog...');
  let items = [];
  let cursor = undefined;
  do {
    const url = `/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ''}`;
    const data = await squareGet(url);
    if (data.objects) items.push(...data.objects);
    cursor = data.cursor;
  } while (cursor);

  const catalog = items.map(item => ({
    id: item.id,
    name: item.item_data?.name,
    variations: (item.item_data?.variations || []).map(v => ({
      id: v.id,
      name: v.item_variation_data?.name,
      price: v.item_variation_data?.price_money?.amount // in cents
    }))
  }));

  writeFileSync(join(DATA, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(`   ${catalog.length} items saved.`);
}

// --- Orders sync ---

async function fetchOrders(startDate, endDate) {
  console.log(`📋 Fetching orders ${startDate} → ${endDate}...`);
  let allOrders = [];
  let cursor = undefined;
  do {
    const body = {
      location_ids: [LOCATION_ID],
      query: {
        filter: {
          date_time_filter: {
            closed_at: {
              start_at: startDate,
              end_at: endDate
            }
          },
          state_filter: { states: ['COMPLETED'] }
        },
        sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' }
      },
      ...(cursor ? { cursor } : {})
    };
    const data = await squarePost('/orders/search', body);
    if (data.orders) allOrders.push(...data.orders);
    cursor = data.cursor;
  } while (cursor);
  return allOrders;
}

function processOrdersForDay(orders, dateStr) {
  const byItem = {};
  const byHour = {};
  let totalRevenue = 0;

  for (const order of orders) {
    const closedAt = new Date(order.closed_at);
    const hour = closedAt.getHours();
    if (!byHour[hour]) byHour[hour] = { orders: 0, revenue: 0 };
    byHour[hour].orders++;

    const orderTotal = (order.total_money?.amount || 0) / 100;
    totalRevenue += orderTotal;
    byHour[hour].revenue += orderTotal;

    for (const li of (order.line_items || [])) {
      const name = li.name || 'Unknown';
      const variation = li.variation_name || '';
      const qty = parseInt(li.quantity) || 1;
      const gross = (li.gross_sales_money?.amount || 0) / 100;
      const key = name;

      if (!byItem[key]) byItem[key] = { name, variations: {}, quantity: 0, revenue: 0 };
      byItem[key].quantity += qty;
      byItem[key].revenue += gross;
      if (variation) {
        if (!byItem[key].variations[variation]) byItem[key].variations[variation] = 0;
        byItem[key].variations[variation] += qty;
      }
    }
  }

  return {
    date: dateStr,
    orderCount: orders.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    items: Object.values(byItem).sort((a, b) => b.quantity - a.quantity),
    byHour
  };
}

function saveDailyData(dateStr, data) {
  writeFileSync(join(DAILY, `${dateStr}.json`), JSON.stringify(data, null, 2));
}

// --- Main sync logic ---

async function main() {
  const lastSyncPath = join(DATA, 'last-sync.json');
  let lastSync = null;
  if (existsSync(lastSyncPath)) {
    try { lastSync = JSON.parse(readFileSync(lastSyncPath, 'utf-8')); } catch {}
  }

  // Determine sync range
  const now = new Date();
  let startDate;
  if (lastSync?.lastSyncDate) {
    // Sync from last sync date
    startDate = new Date(lastSync.lastSyncDate);
  } else {
    // First run: last 90 days
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 90);
    console.log('🆕 First run — pulling last 90 days of history...');
  }

  // Set start to beginning of day
  startDate.setHours(0, 0, 0, 0);
  const startISO = startDate.toISOString();
  const endISO = now.toISOString();

  // Sync catalog
  await syncCatalog();

  // Fetch all orders in range
  const orders = await fetchOrders(startISO, endISO);
  console.log(`   ${orders.length} orders fetched.`);

  // Group orders by date and save
  const ordersByDate = {};
  for (const order of orders) {
    const dateStr = order.closed_at.substring(0, 10);
    if (!ordersByDate[dateStr]) ordersByDate[dateStr] = [];
    ordersByDate[dateStr].push(order);
  }

  for (const [dateStr, dayOrders] of Object.entries(ordersByDate)) {
    const data = processOrdersForDay(dayOrders, dateStr);
    saveDailyData(dateStr, data);
    console.log(`   📅 ${dateStr}: ${dayOrders.length} orders, $${data.totalRevenue}`);
  }

  // Update last-sync marker
  writeFileSync(lastSyncPath, JSON.stringify({
    lastSyncDate: now.toISOString().substring(0, 10),
    lastRunAt: now.toISOString(),
    ordersProcessed: orders.length
  }, null, 2));

  console.log('✅ Square sync complete.');
}

main().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
