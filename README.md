# yt-feed-bridge

A simple Discord bot that monitors YouTube channels via RSS and posts new uploads and livestreams to Discord.

---

## ✨ Features

- 📺 Track multiple YouTube channels
- 🔴 Detect livestreams
- 📹 Post new uploads automatically
- ⚡ First sync instantly posts latest video
- 🔗 Supports:
  - Channel ID (`UC...`)
  - @handle
  - YouTube channel URLs
- 🧠 Smart channel resolving
- 💾 Persistent storage (JSON-based)
- 🧩 Simple and lightweight setup

---

## 📦 Installation

```bash
git clone https://github.com/Tanny2011/YouTube-Discord-bridge.git
cd yt-feed-bridge
npm install
```

## ⚙️ Setup
1. Create a .env file
```bash
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_application_id
YOUTUBE_API_KEY=your_youtube_api_key
```

3. Register slash commands
```bash
npm run register
```
⚠️ Global commands may take up to 1 hour to appear

3. Start the bot
```bash
npm start
```

## 💬 Commands
/follow
Add or update a YouTube channel
Usage:
```bash
/follow input:@mkbhd discord_channel:#youtube
```
Supported input:
- UCxxxxxxxx
- @handle
- https://youtube.com/@handle
- https://youtube.com/channel/UC...

/unfollow
Remove a followed channel
```bash
/unfollow input:@mkbhd
```
/listfollows
Show all followed channels

/resetlastvideo
Reset stored video (forces next post)
```bash
/resetlastvideo input:@mkbhd
```
/forcecheck
Forces a re-sync (same as reset)
```bash
/forcecheck input:@mkbhd
```

## 🧠 How it works
Uses YouTube RSS feeds to detect new uploads
Uses YouTube API to:
resolve channel names
detect livestreams
Stores state in:
channels.json → channel links
ytchannels.json → last video tracking
Prevents duplicate posts
First sync posts the latest video immediately

## 📁 Project Structure
```bash
yt-feed-bridge/
├─ Opslag/
│  ├─ channels.json
│  └─ ytchannels.json
├─ commands.js
├─ register-commands.js
├─ unregister-commands.js
├─ bot.js
├─ .env.example
├─ package.json
└─ README.md
```

## ⚠️ Notes
- Slash commands are registered globally
- Updates to commands require:
```bash
npm run register
```
- Discord may cache commands (delay up to ~1 hour)

## 🚀 Why this bot?
This project is intentionally kept:
- small
- simple
- easy to understand
- easy to extend
No database, no overengineering — just a clean YouTube → Discord bridge.
