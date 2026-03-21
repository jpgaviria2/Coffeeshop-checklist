# 🔬 Engineering Brief: Coffeeshop Checklist — Reliability & Tracking Overhaul

**Requested by:** jP  
**Date:** March 21, 2026  
**Priority:** High  
**Status:** Queued

---

## The Problem

The current checklist app (https://github.com/jpgaviria2/Coffeeshop-checklist) has reliability issues — submissions fail and fall back to "saved locally." The data architecture relies on Nostr relays which is over-engineered and fragile for this use case.

## What jP Wants

**Checklist must work every single time.** No failed submissions. No "saved locally" fallbacks that never sync.

Proper tracking of:
- Who submitted (which staff member)
- What tasks were completed / skipped
- What comments were added
- What photos/evidence were attached
- Timestamp, location, shift type

---

## Architecture Direction

### Keep (don't change)
- **Nostr for AUTH ONLY** — staff still sign in with their nsec. This identifies who submitted. That's all Nostr needs to do.

### Remove
- **Relay publishing** — do NOT publish checklist submissions as Nostr events to any relay. This is the fragility point and unnecessary.

### Add / Change
- **Direct POST to trails-api** — when staff submit a checklist, it POSTs directly to `https://api.trailscoffee.com` (already running on Mac mini, already has a `submissions` table in SQLite)
- **SQLite as source of truth** — all submissions stored in trails-api DB, queryable
- **Google Drive sync** — submissions auto-written to a Google Sheets spreadsheet for easy admin review (one row per submission, columns: date, staff name, location, tasks completed, comments, photo links)
- **Admin view in app** — managers can see recent submission history from the app's admin menu

---

## Deliverables

1. **Full repo audit** — what's broken, what's over-engineered, what's missing, what's good
   - Repo: https://github.com/jpgaviria2/Coffeeshop-checklist
   - Local: `/Users/trails/.openclaw/workspace/agents/engineering-rd/repos/Coffeeshop-checklist`

2. **Proposed architecture doc** — clear diagram/description of new flow

3. **Implementation plan** — broken into phases with effort estimates

4. **Build it** — implement the changes, test, deploy

---

## Key Context

- **trails-api** lives at `/Users/trails/trails-api/` (Node/Fastify + SQLite)
- **Public URL:** `https://api.trailscoffee.com`
- **Existing submissions table** already in the DB
- **Staff Nostr pubkeys** are in `/Users/trails/trails-api/staff.js`
- **NIP-98 HTTP auth** already implemented in trails-api — use this for authenticating checklist POSTs
- **Maton API key** available at `/Users/trails/.openclaw/workspace/config/maton.json` for Google Sheets writes
- **Google Sheets (Inventory Master)** shows how we write to Sheets via Maton — same pattern for submissions sheet

---

---

## Additional Requirement: Employee Directory in Google Drive

**Create a Google Drive spreadsheet — "Trails Coffee Employee Directory"** — as the single source of truth for all staff identity info. All agents must reference this sheet.

### Columns
| Name | Phone | Email | Nostr npub | Square Employee ID | Schedule (from Square) |
|---|---|---|---|---|---|

### Data Sources to Pull From
- **Nostr pubkeys (hex + npub):** Already in `/Users/trails/trails-api/staff.js` — convert hex → npub format
- **Staff info (name, phone, email):** Already in MEMORY.md staff directory — seed the sheet from there
- **Schedule:** Pull from Square Staff API if available, otherwise leave as manual field
- **nsec:** ⚠️ See security note below — collect from staff individually, do NOT generate or guess

### Security Decision (confirmed by jP, Mar 21 2026)
✅ **npub only in the directory — no nsec.** Each staff member holds their own nsec on their device. The directory is for operational identity (who is who, how to reach them, what their Nostr public key is). nsec is never stored anywhere centrally.

### Sync Requirements
- Phone + email should be **kept in sync with Square** (either push to Square employee records, or pull from Square as source)
- trails-api should be able to read this sheet to resolve npub → name for checklist submissions
- All 14 specialist agents should reference this sheet for staff identity — not their individual memory files

### Current Staff (seed data — from MEMORY.md)
| Name | Role | Pubkey (hex) |
|---|---|---|
| JP | Owner/Manager | d4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd |
| Charlene Thue | Lead/Manager | 18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f |
| Dayana Cardenas | Lead/Manager | 4287e0cdcccb4789f0c1d4c27caae092f19f0c266c0d0638b571558d09317911 |
| Aziza Glatt | Barista | 5936809a3a97e3efec0ca57d1c5b755f1fd91700952ee4394d0ca9cf1a40498f |
| Amanda Wellman | Barista | c7a2da3b05233ffe91a511399fa96b1e6141d1bb2a2bb48a3becde8d2f43da93 |
| Ruby Jones | Barista | e94223ab25f9a156eb402d6e7627c8118f38285b74687a53b656d9481d3672b2 |
| Itzel | Staff | 2205bd42b0fdfab6ab2ecba660212ead17775fd6d4b94616b2c9ff52cfd2073a |
| Deya Kovats | Barista | 876fde9a5fccd9bb3206ac8a788fd6c42cabcc3911bc08246d8c04007147c5ce |

Phone/email contacts are in MEMORY.md — use those to seed the sheet.

---

## Notes

- The app is a GitHub Pages static site — any server-side logic stays in trails-api
- Keep the UX simple for staff — they shouldn't notice any change except it working reliably
- The admin menu already exists in the app — extend it, don't rebuild it
- Employee Directory sheet should be shared with jP, Charlene, and Dayana (managers only)

---

## Phase 2: World-Class Checklist UX (requested Mar 21, 2026)

### Per-Item UX Overhaul
Every checklist item must have:
- **Pass / Fail** buttons (replace the simple checkbox)
  - ✅ PASS = task completed correctly
  - ❌ FAIL = task was not done or found incorrect
- **📷 Photo button** — tap to open camera or file picker, attach image as evidence
- **💬 Comment field** — optional text note per item
- **If FAIL is selected**: photo + comment become REQUIRED before moving on (enforce this)
- Keep it clean — collapsed by default, expand on tap or on Fail

### Bottom of Checklist — Findings & Suggestions
A dedicated section at the end of every checklist:
- Free-text field: "Any findings, issues, or suggestions for improving this checklist?"
- Optional photo attachment for findings
- This data is saved with the submission and visible to admins

### Checklist Content — World-Class Standard Evaluation
Do a comprehensive audit: for an independent coffee shop (Anmore, BC), what does a world-class opening AND closing checklist look like? Reference hospitality/food service standards. Identify gaps in the current checklist and propose additions. The checklist should cover EVERYTHING — nothing should be done from memory.

Categories to ensure are covered:
- Food safety (temps, labels, dates)
- Equipment (espresso machine, grinder, oven, dishwasher, fridge)
- Prep (pastries, concentrates, milk, coffee)
- Station setup (POS, display, cups, lids, condiments)
- Cleanliness (counters, floors, washrooms, waste)
- Opening communications (music, Square, inventory update)
- Closing: safe shutdown, cleaning, restocking, waste, locking up

### Admin View Enhancements
- Show FAIL items prominently (red) with attached photos and comments
- Filter submissions by: pass rate, staff member, date, location
- Export to CSV/Google Sheets on demand

### Technical Notes
- Photos: use the browser's `capture="environment"` input (camera on mobile, file picker on desktop)
- Store photos: base64 in localStorage for offline queue, upload as multipart to trails-api on submit
- trails-api: update `/submissions` schema to store per-item `{status: "pass"|"fail", comment: string, photoUrl: string}` + findings section
