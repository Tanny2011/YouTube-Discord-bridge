require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");
const RSSParser = require("rss-parser");
const { handleCommand } = require("./commands");

const parser = new RSSParser();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const POLL_INTERVAL = 60_000; // 1 minute

const STORAGE_DIR = path.join(__dirname, "Opslag");
const CHANNELS_FILE = path.join(STORAGE_DIR, "channels.json");
const YTCHANNELS_FILE = path.join(STORAGE_DIR, "ytchannels.json");

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  if (!fs.existsSync(CHANNELS_FILE)) {
    fs.writeFileSync(CHANNELS_FILE, "[]", "utf8");
  }

  if (!fs.existsSync(YTCHANNELS_FILE)) {
    fs.writeFileSync(YTCHANNELS_FILE, "{}", "utf8");
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read ${filePath}:`, err.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`❌ Failed to write to ${filePath}:`, err.message);
  }
}

function loadChannelLinks() {
  ensureStorage();

  const data = readJson(CHANNELS_FILE, []);
  if (!Array.isArray(data)) {
    throw new Error("channels.json must be an array.");
  }

  return data;
}

function loadRuntimeData() {
  ensureStorage();

  const data = readJson(YTCHANNELS_FILE, {});
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("ytchannels.json must be an object.");
  }

  return data;
}

function saveRuntimeData(data) {
  writeJson(YTCHANNELS_FILE, data);
}

function getRuntimeEntry(runtimeData, youtubeChannelId) {
  if (!runtimeData[youtubeChannelId]) {
    runtimeData[youtubeChannelId] = {
      lastVideoId: null,
    };
  }

  return runtimeData[youtubeChannelId];
}

async function checkIfLive(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is missing in .env");
  }

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,liveStreamingDetails` +
    `&id=${encodeURIComponent(videoId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const item = data.items?.[0];

  if (!item) {
    return {
      isLive: false,
      broadcastStatus: "none",
      raw: null,
    };
  }

  const broadcastStatus = item.snippet?.liveBroadcastContent || "none";
  const liveDetails = item.liveStreamingDetails || {};

  const isLive =
    broadcastStatus === "live" ||
    !!liveDetails.actualStartTime ||
    !!liveDetails.activeLiveChatId;

  return {
    isLive,
    broadcastStatus,
    raw: item,
  };
}

async function checkFeedForLink(link, runtimeData) {
  const { youtubeChannelId, discordChannelId, name } = link;

  if (!youtubeChannelId || !discordChannelId) {
    console.log("⚠️ Skipping entry: youtubeChannelId or discordChannelId is missing");
    return;
  }

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;

  try {
    const feed = await parser.parseURL(url);

    if (!feed.items || feed.items.length === 0) {
      console.log(`❌ No items found for ${name || youtubeChannelId}`);
      return;
    }

    const latest = feed.items[0];
    const videoId = latest.id?.split(":").pop();

    console.log("\n==============================");
    console.log(`📡 Checking ${name || youtubeChannelId}`);
    console.log({
      title: latest.title,
      link: latest.link,
      videoId,
      author: latest.author,
      pubDate: latest.pubDate,
      discordChannelId,
    });

    if (!videoId) {
      console.log(`⚠️ No videoId found for ${name || youtubeChannelId}`);
      return;
    }

    const runtimeEntry = getRuntimeEntry(runtimeData, youtubeChannelId);

    if (runtimeEntry.lastVideoId === videoId) {
      console.log(`⏭️ No new item for ${name || youtubeChannelId}`);
      return;
    }

    if (!runtimeEntry.lastVideoId) {
      runtimeEntry.lastVideoId = videoId;
      saveRuntimeData(runtimeData);
      console.log(`📝 First sync for ${name || youtubeChannelId}, sending latest item.`);
    } else {
      runtimeEntry.lastVideoId = videoId;
      saveRuntimeData(runtimeData);
    }

    const channel = await client.channels.fetch(discordChannelId);

    if (!channel || !channel.isTextBased()) {
      console.log(`❌ Discord channel ${discordChannelId} was not found or is not text-based`);
      return;
    }

    const liveCheck = await checkIfLive(videoId);

    console.log("\n🎥 LIVE CHECK:");
    console.log({
      isLive: liveCheck.isLive,
      broadcastStatus: liveCheck.broadcastStatus,
      actualStartTime: liveCheck.raw?.liveStreamingDetails?.actualStartTime,
      activeLiveChatId: liveCheck.raw?.liveStreamingDetails?.activeLiveChatId,
    });

    if (liveCheck.isLive) {
      const embed = new EmbedBuilder()
        .setTitle("🔴 YouTube livestream detected")
        .setDescription(`**${latest.title}**`)
        .setURL(latest.link)
        .addFields(
          {
            name: "Channel",
            value: latest.author || name || "Unknown",
            inline: true,
          },
          {
            name: "Status",
            value: liveCheck.broadcastStatus || "live",
            inline: true,
          }
        )
        .setColor(0xff0000)
        .setTimestamp(new Date())
        .setFooter({ text: `YouTube Channel ID: ${youtubeChannelId}` });

      await channel.send({
        content: `🔴 **${latest.author || name || "A channel"}** is now live!`,
        embeds: [embed],
      });

      console.log(`🔴 Live embed sent for: ${latest.title}`);
    } else {
      await channel.send(
        `📹 New upload from **${latest.author || name || "Unknown"}**\n**${latest.title}**\n${latest.link}`
      );

      console.log(`📨 Upload message sent for: ${latest.title}`);
    }
  } catch (err) {
    console.error(`🔥 Error for ${name || youtubeChannelId}:`, err.message);
  }
}

async function checkAllFeeds() {
  const links = loadChannelLinks();
  const runtimeData = loadRuntimeData();

  if (links.length === 0) {
    console.log("⚠️ No channel links found in channels.json");
    return;
  }

  for (const link of links) {
    await checkFeedForLink(link, runtimeData);
  }
}

client.on("interactionCreate", handleCommand);

client.once("clientReady", async (readyClient) => {
  console.log(`🤖 Bot is online as ${readyClient.user.tag}`);

  await checkAllFeeds();
  setInterval(checkAllFeeds, POLL_INTERVAL);
});

client.login(process.env.DISCORD_TOKEN);