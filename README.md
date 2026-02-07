# Trails Coffee - Staff Checklist System

A decentralized checklist system for coffeeshop staff using Nostr protocol.

## Features

- 🔐 **Secure Authentication** via Nostr (decentralized identity)
- ✅ **Opening & Closing Checklists** with task tracking
- 📊 **Automatic submission** to Nostr relays
- 👤 **Staff accountability** - submissions linked to Nostr identity
- 🌐 **No backend required** - fully client-side, hosted on GitHub Pages

## How It Works

1. Staff visit the checklist page
2. Connect using their Nostr browser extension (Alby or nos2x)
3. Complete opening or closing checklist
4. Submit - signed and published to Nostr network
5. Managers can track completions via Nostr clients

## Setup for Staff

### Step 1: Install a Nostr Extension
- **Alby**: [getalby.com](https://getalby.com) (Recommended - full wallet + identity)
- **nos2x**: [Chrome Store](https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp)

### Step 2: Create Your Nostr Identity
- Follow the extension's setup wizard
- **Save your private key safely!** (Like a password - don't lose it)
- Your identity is yours forever

### Step 3: Access the Checklist
Visit: `https://jpgaviria2.github.io/coffeeshop-checklist/`

## For Managers

### Viewing Submissions

Use any Nostr client to monitor checklist submissions:

**Recommended Clients:**
- **nostr.band** - Web-based explorer
- **Nostrudel** - Feature-rich web client
- **Damus** (iOS) or **Amethyst** (Android) - Mobile apps

**Search for events:**
- Kind: `30078`
- Tag: `shop:trails-coffee`
- Tag: `type:opening` or `type:closing`

### Integration with OpenClaw

The Manager bot can be configured to:
- Subscribe to checklist events
- Send daily summaries
- Alert if checklists aren't completed
- Track staff performance over time

## Technical Details

- **Protocol**: Nostr (Notes and Other Stuff Transmitted by Relays)
- **Event Kind**: 30078 (Application-specific replaceable event)
- **Relays Used**:
  - wss://relay.damus.io
  - wss://nos.lol
  - wss://relay.nostr.band

## Deployment

This is a static site ready for GitHub Pages:

```bash
# Commit and push
git add .
git commit -m "Initial commit: Nostr checklist system"
git branch -M main
git remote add origin https://github.com/jpgaviria2/coffeeshop-checklist.git
git push -u origin main

# Enable GitHub Pages in repo settings (Settings → Pages → Source: main branch)
```

## Privacy & Security

- ✅ **Decentralized** - No central database
- ✅ **Staff own their identity** - Nostr keys are portable
- ✅ **Cryptographically signed** - Can't be forged
- ✅ **Public by default** - Transparency for accountability
- ⚠️ **Submissions are public** on Nostr - don't include sensitive data

## Customization

Edit `index.html` to:
- Add/remove checklist items
- Change branding/colors
- Add custom fields (notes, photos, etc.)

Edit `app.js` to:
- Change relay list
- Modify event structure
- Add additional features

---

Built with ❤️ for Trails Coffee ☕
