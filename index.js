import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import axios from 'axios';

// ==========================
// ENV
// ==========================

const TOKEN = process.env.TOKEN;
const TARGET_ID = process.env.TARGET_ID;
const GEMINI_KEY = process.env.GEMINI_KEY; // your Gemini API key
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5';

if (!TOKEN) {
  console.error("TOKEN missing.");
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("GEMINI_KEY missing.");
  process.exit(1);
}

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
// AI CHAT FUNCTION (Gemini)
// ==========================

async function askGemini(prompt) {
  try {
    const resp = await axios.post(
      'https://api.generativeai.google/v1beta2/models/' + GEMINI_MODEL + ':generateMessage',
      {
        prompt: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${GEMINI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Gemini returns structured JSON
    return resp.data?.candidates?.[0]?.content || "AI did not respond 😭";
  } catch (err) {
    console.error("Gemini Error:", err.response?.data || err.message);
    return "AI broke 😭 try again";
  }
}

// ==========================
// TEXT COMMAND
// ==========================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("?!")) return;

  const userPrompt = message.content.slice(2).trim();
  if (!userPrompt) return;

  await message.channel.sendTyping();

  const reply = await askGemini(userPrompt);
  await message.reply(reply);
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
