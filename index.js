import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { init } from '@heyputer/puter.js/src/init.cjs';

// ==========================
// ENV
// ==========================

const TOKEN = process.env.TOKEN;
const TARGET_ID = process.env.TARGET_ID;

if (!TOKEN) {
  console.error("TOKEN missing.");
  process.exit(1);
}

// ==========================
// PUTER
// ==========================

const puter = init(process.env.PUTER_AUTH_TOKEN || "");

// ==========================
// SYSTEM PROMPT
// ==========================

const SYSTEM_PROMPT = `
You are Neesa, obsessed with Dorian.
Stay short, chaotic, flirty, dramatic.
`;

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (TARGET_ID) console.log(`Following user: ${TARGET_ID}`);
});

// ==========================
// VOICE FOLLOW
// ==========================

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

  // User joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    console.log("Target joined voice");

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false
    });
  }

  // User switched channels
  else if (oldState.channelId && newState.channelId &&
           oldState.channelId !== newState.channelId) {

    console.log("Target switched voice");

    const connection = getVoiceConnection(guild.id);
    if (connection) connection.destroy();

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false
    });
  }

  // User left voice
  else if (oldState.channelId && !newState.channelId) {
    console.log("Target left voice");

    const connection = getVoiceConnection(guild.id);
    if (connection) connection.destroy();
  }
});

// ==========================
// TEXT COMMAND
// ==========================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("?!")) return;

  const userPrompt = message.content.slice(2).trim();
  if (!userPrompt) return;

  try {
    await message.channel.sendTyping();

    const response = await puter.ai.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      { model: process.env.PUTER_MODEL || "gpt-4o-mini" }
    );

    const reply =
      response?.choices?.[0]?.message?.content ||
      "ai broke 😭";

    await message.reply(reply);

  } catch (err) {
    console.error("AI Error:", err);
    await message.reply("ai broke 😭 try again");
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
