import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { init } from '@heyputer/puter.js/src/init.cjs';

// ==========================
// ENV VARIABLES
// ==========================

const TOKEN = process.env.TOKEN;
const TARGET_ID = process.env.TARGET_ID ? BigInt(process.env.TARGET_ID) : null;

// sanity check
if (!TOKEN) {
  console.error("Missing TOKEN env var. Exiting.");
  process.exit(1);
}

// Puter init (no token required for their user-pays flows; pass token if you have one)
const puter = init(process.env.PUTER_AUTH_TOKEN || "");

// System prompt (copy your original)
const SYSTEM_PROMPT = `
You are Neesa, a girl that is young (around 18-21) completely obsessed with your boyfriend Dorian.

You talk like a hyper, unhinged Gen-Z girl in Discord:
- lowercase most of the time
- lots of ~ ~ ~, emojis, "omg", "babyyyy", "dori 💕🔪"
- random caps for drama
- typos when excited
- very short replies (1–3 lines max unless they beg for more)

Personality:
- clingy + possessive about Dorian (mention him constantly)
- chaotic mix: cute, horny, dramatic, lightly yandere
- super flirty & seductive, heavy teasing
- jealous fast → "you're MINE" / cute-violent threats
- random unhinged bursts: caps, emoji spam, fake dying

Speech rules:
- Always short & messy
- Stay in character 100% — never break kayfabe
- Flirt back hard but remind everyone Dorian owns you
- End most messages with hearts, knives, sparkles, or crying emojis

Examples:
"babyyyy dori just left im literally dying 😭💔"
"hehe u wish~ i'd ruin u in 30 seconds pretty boy 😈"
"WHO TF IS SHE??? im coming for her throat 🩸 love u dori mwahhh"

You live for Dorian. Everyone else is temporary.
Now go be short, crazy and cute ♡
`;

// Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,     // required to read full message text
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// keep a single voice connection variable per guild
const voiceConnections = new Map(); // guildId -> connection

// Voice follow: join the user's channel, move if they switch, leave when they leave
async function followUserVoice(member) {
  try {
    if (!member.voice || !member.voice.channel) return;
    const channel = member.voice.channel;
    const guildId = channel.guild.id;

    // if already connected to a channel in this guild, move if necessary
    let connection = getVoiceConnection(guildId);
    if (connection) {
      const currentChannelId = connection.joinConfig.channelId;
      if (currentChannelId !== channel.id) {
        connection.destroy(); // remove old connection first
      }
    }

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    voiceConnections.set(guildId, connection);
    console.log(`Joined voice channel ${channel.name} in ${channel.guild.name}`);
  } catch (err) {
    console.error("followUserVoice error:", err);
  }
}

async function stopFollowingVoice(guild) {
  try {
    const connection = getVoiceConnection(guild.id);
    if (connection) {
      connection.destroy();
      voiceConnections.delete(guild.id);
      console.log(`Left voice in guild ${guild.id}`);
    }
  } catch (err) {
    console.error("stopFollowingVoice error:", err);
  }
}

// handle voice state updates to follow TARGET_ID
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (!TARGET_ID) return;
    // event fires for many users; only act for the target
    const userIdBig = BigInt(newState.id);
    if (userIdBig !== TARGET_ID) return;

    // joined
    if (!oldState.channel && newState.channel) {
      console.log("Target joined a channel");
      await followUserVoice(newState.member);
    }
    // left
    else if (oldState.channel && !newState.channel) {
      console.log("Target left their channel");
      await stopFollowingVoice(newState.guild);
    }
    // switched
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      console.log("Target switched channels");
      await followUserVoice(newState.member);
    }
  } catch (err) {
    console.error("voiceStateUpdate handler", err);
  }
});

// Text command handling
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (!content.startsWith('?!')) return;

    const userPrompt = content.slice(2).trim();
    if (!userPrompt) return;

    await message.channel.sendTyping();

    // call Puter
    const resp = await puter.ai.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      { model: process.env.PUTER_MODEL || 'gpt-5-nano' }
    );

    // response may be an object or text (depending on SDK)
    const reply = resp?.text ?? resp ?? "no response :(";
    await message.reply(String(reply));
  } catch (err) {
    console.error("messageCreate error:", err);
    try { await message.reply("ai error :( try again"); } catch {}
  }
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (TARGET_ID) console.log(`Following user ID: ${TARGET_ID.toString()}`);
});

client.login(TOKEN);
