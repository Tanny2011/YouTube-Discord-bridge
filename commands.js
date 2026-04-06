const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

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

function loadChannels() {
  ensureStorage();

  const data = readJson(CHANNELS_FILE, []);
  if (!Array.isArray(data)) {
    return [];
  }

  return data;
}

function saveChannels(data) {
  writeJson(CHANNELS_FILE, data);
}

function loadRuntime() {
  ensureStorage();

  const data = readJson(YTCHANNELS_FILE, {});
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return data;
}

function saveRuntime(data) {
  writeJson(YTCHANNELS_FILE, data);
}

function normalizeInput(value) {
  return value.trim();
}

function findChannelIndex(channels, youtubeChannelId) {
  return channels.findIndex(
    (entry) => entry.youtubeChannelId === youtubeChannelId
  );
}

function extractChannelIdFromText(input) {
  const trimmed = input.trim();

  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/i);
  if (channelMatch) {
    return channelMatch[1];
  }

  return null;
}

function extractHandleFromText(input) {
  const trimmed = input.trim();

  if (/^@[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed.slice(1);
  }

  const handleMatch = trimmed.match(/youtube\.com\/@([a-zA-Z0-9._-]+)/i);
  if (handleMatch) {
    return handleMatch[1];
  }

  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }

  return await res.text();
}

async function resolveChannelIdFromHandle(handle) {
  const html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`);

  const canonicalMatch = html.match(
    /"canonicalBaseUrl":"\\\/channel\\\/(UC[a-zA-Z0-9_-]+)"/
  );

  if (canonicalMatch) {
    return canonicalMatch[1];
  }

  const channelMatch = html.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/i);
  if (channelMatch) {
    return channelMatch[1];
  }

  const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);
  if (externalIdMatch) {
    return externalIdMatch[1];
  }

  throw new Error(`Could not find a YouTube channel ID for @${handle}`);
}

async function fetchYoutubeChannelInfo(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is missing in .env");
  }

  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=snippet` +
    `&id=${encodeURIComponent(channelId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const item = data.items?.[0];

  if (!item) {
    throw new Error(`No channel found for ID ${channelId}`);
  }

  return {
    youtubeChannelId: item.id,
    name: item.snippet?.title || channelId,
  };
}

async function resolveYoutubeChannel(input) {
  const directChannelId = extractChannelIdFromText(input);
  if (directChannelId) {
    return await fetchYoutubeChannelInfo(directChannelId);
  }

  const handle = extractHandleFromText(input);
  if (handle) {
    const channelId = await resolveChannelIdFromHandle(handle);
    return await fetchYoutubeChannelInfo(channelId);
  }

  throw new Error(
    "Invalid input. Use a YouTube channel ID, a /channel/ URL, or an @handle."
  );
}

async function resolveStoredYoutubeChannelId(input) {
  const channels = loadChannels();

  const directChannelId = extractChannelIdFromText(input);
  if (directChannelId) {
    return directChannelId;
  }

  const handle = extractHandleFromText(input);
  if (handle) {
    const handleLower = handle.toLowerCase();

    const byStoredName = channels.find(
      (entry) => entry.name && entry.name.toLowerCase() === handleLower
    );

    if (byStoredName) {
      return byStoredName.youtubeChannelId;
    }

    const resolved = await resolveYoutubeChannel(input);
    return resolved.youtubeChannelId;
  }

  const exactNameMatch = channels.find(
    (entry) => entry.name && entry.name.toLowerCase() === input.toLowerCase()
  );

  if (exactNameMatch) {
    return exactNameMatch.youtubeChannelId;
  }

  throw new Error(
    "Invalid input. Use a YouTube channel ID, a /channel/ URL, or an @handle."
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName("follow")
    .setDescription("Add a YouTube channel or update an existing link.")
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("YouTube channel: UC-ID, @handle, or channel URL")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("discord_channel")
        .setDescription("Discord channel where notifications should be sent")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("unfollow")
    .setDescription("Remove a YouTube channel from the follow list.")
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("YouTube channel: UC-ID, @handle, or channel URL")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("listfollows")
    .setDescription("Show all followed YouTube channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("resetlastvideo")
    .setDescription("Reset the stored last video for a followed channel.")
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("YouTube channel: UC-ID, @handle, or channel URL")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("forcecheck")
    .setDescription("Clear the stored last video so the bot syncs the channel again.")
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("YouTube channel: UC-ID, @handle, or channel URL")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON());

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  ensureStorage();

  if (interaction.commandName === "follow") {
    const input = normalizeInput(
      interaction.options.getString("input", true)
    );
    const discordChannel = interaction.options.getChannel("discord_channel", true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const resolved = await resolveYoutubeChannel(input);
      const name = resolved.name;
      const youtubeChannelId = resolved.youtubeChannelId;

      const channels = loadChannels();
      const runtime = loadRuntime();

      const index = findChannelIndex(channels, youtubeChannelId);

      if (index !== -1) {
        channels[index].name = name;
        channels[index].discordChannelId = discordChannel.id;
        saveChannels(channels);

        if (!runtime[youtubeChannelId]) {
          runtime[youtubeChannelId] = { lastVideoId: null };
          saveRuntime(runtime);
        }

        await interaction.editReply({
          content:
            `♻️ Link updated.\n\n` +
            `**Name:** ${name}\n` +
            `**YouTube ID:** \`${youtubeChannelId}\`\n` +
            `**Discord channel:** ${discordChannel}`,
        });
        return;
      }

      channels.push({
        name,
        youtubeChannelId,
        discordChannelId: discordChannel.id,
      });
      saveChannels(channels);

      if (!runtime[youtubeChannelId]) {
        runtime[youtubeChannelId] = {
          lastVideoId: null,
        };
        saveRuntime(runtime);
      }

      await interaction.editReply({
        content:
          `✅ Channel added.\n\n` +
          `**Name:** ${name}\n` +
          `**YouTube ID:** \`${youtubeChannelId}\`\n` +
          `**Discord channel:** ${discordChannel}`,
      });
      return;
    } catch (err) {
      await interaction.editReply({
        content: `❌ Could not resolve that YouTube channel.\n${err.message}`,
      });
      return;
    }
  }

  if (interaction.commandName === "unfollow") {
    const input = normalizeInput(
      interaction.options.getString("input", true)
    );

    await interaction.deferReply({ ephemeral: true });

    try {
      const resolved = await resolveYoutubeChannel(input);
      const youtubeChannelId = resolved.youtubeChannelId;

      const channels = loadChannels();
      const runtime = loadRuntime();

      const index = findChannelIndex(channels, youtubeChannelId);

      if (index === -1) {
        await interaction.editReply({
          content: `⚠️ No channel found with ID \`${youtubeChannelId}\`.`,
        });
        return;
      }

      const removed = channels.splice(index, 1)[0];
      saveChannels(channels);

      if (runtime[youtubeChannelId]) {
        delete runtime[youtubeChannelId];
        saveRuntime(runtime);
      }

      await interaction.editReply({
        content:
          `🗑️ Channel removed.\n\n` +
          `**Name:** ${removed.name || resolved.name || "Unknown"}\n` +
          `**YouTube ID:** \`${youtubeChannelId}\``,
      });
      return;
    } catch (err) {
      await interaction.editReply({
        content: `❌ Could not resolve that YouTube channel.\n${err.message}`,
      });
      return;
    }
  }

  if (interaction.commandName === "listfollows") {
    const channels = loadChannels();

    if (channels.length === 0) {
      await interaction.reply({
        content: "📭 No YouTube channels have been configured yet.",
        ephemeral: true,
      });
      return;
    }

    const lines = channels.map((entry, index) => {
      return [
        `**${index + 1}. ${entry.name || "Unknown"}**`,
        `YouTube ID: \`${entry.youtubeChannelId}\``,
        `Discord channel: <#${entry.discordChannelId}>`,
      ].join("\n");
    });

    await interaction.reply({
      content: `📋 **Followed channels**\n\n${lines.join("\n\n")}`,
      ephemeral: true,
    });
    return;
  }

  if (
    interaction.commandName === "resetlastvideo" ||
    interaction.commandName === "forcecheck"
  ) {
    const input = normalizeInput(
      interaction.options.getString("input", true)
    );

    await interaction.deferReply({ ephemeral: true });

    try {
      const youtubeChannelId = await resolveStoredYoutubeChannelId(input);

      const channels = loadChannels();
      const runtime = loadRuntime();

      const entry = channels.find(
        (channel) => channel.youtubeChannelId === youtubeChannelId
      );

      if (!entry) {
        await interaction.editReply({
          content: `⚠️ This YouTube channel is not listed in channels.json: \`${youtubeChannelId}\``,
        });
        return;
      }

      if (!runtime[youtubeChannelId]) {
        runtime[youtubeChannelId] = { lastVideoId: null };
      } else {
        runtime[youtubeChannelId].lastVideoId = null;
      }

      saveRuntime(runtime);

      const actionText =
        interaction.commandName === "resetlastvideo"
          ? "lastVideoId reset"
          : "force check completed";

      await interaction.editReply({
        content:
          `🔄 ${actionText} for **${entry.name || "Unknown"}**\n` +
          `**YouTube ID:** \`${youtubeChannelId}\`\n` +
          `The next feed sync will treat this channel as new again.`,
      });
      return;
    } catch (err) {
      await interaction.editReply({
        content: `❌ Could not resolve that YouTube channel.\n${err.message}`,
      });
      return;
    }
  }
}

module.exports = {
  commands,
  handleCommand,
};