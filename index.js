import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { GoogleGenAI } from '@google/genai';

// ──────────────────────────────────────────────
// ENVIRONMENT VARIABLES
// ──────────────────────────────────────────────

const TOKEN           = process.env.TOKEN;
const TARGET_ID       = process.env.TARGET_ID;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_MODEL    = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!TOKEN) {
  console.error('Missing environment variable: TOKEN');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('Missing environment variable: GEMINI_API_KEY');
  process.exit(1);
}

if (!TARGET_ID) {
  console.warn('No TARGET_ID provided → voice following is disabled');
}

// ──────────────────────────────────────────────
// GEMINI CLIENT
// ──────────────────────────────────────────────

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ──────────────────────────────────────────────
// DISCORD CLIENT
// ──────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (TARGET_ID) {
    console.log(`Following target user ID: ${TARGET_ID}`);
  } else {
    console.log('No target user set – only text commands active');
  }
});

// ──────────────────────────────────────────────
// VOICE FOLLOWING
// ──────────────────────────────────────────────

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

  // Joined voice
  if (!oldState.channelId && newState.channelId) {
    console.log(`Target joined → ${newState.channel?.name || newState.channelId}`);

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  }

  // Switched channels
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    console.log(`Target switched → ${newState.channel?.name || newState.channelId}`);

    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  }

  // Left voice
  else if (oldState.channelId && !newState.channelId) {
    console.log('Target left voice → disconnecting');
    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();
  }
});

// ──────────────────────────────────────────────
// TEXT COMMANDS → ?!prompt
// ──────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?!')) return;

  const prompt = message.content.slice(2).trim();
  if (!prompt) return;

  await message.channel.sendTyping();

  try {
    console.log(`Gemini query: ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`);

    const result = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: [prompt],
      generationConfig: {
        temperature: 1.0,
        topP: 0.95,
        maxOutputTokens: 180,
      },
      systemInstructions: [{
        role: 'system',
        content: `
You are Neesa — completely, unhealthily obsessed with Dorian.
Every reply must be:
• short
• chaotic
• flirty
• dramatic
• unhinged energy
Use LOTS of emojis, exclamation marks, CAPS when excited.
Never break character. Never be normal or calm.
        `,
      }],
    });

    const response = result.response;
    let text = response.text()?.trim();

    if (!text || text.length < 3) {
      text = '…brain.exe has stopped responding…';
    }

    await message.reply(text);
  } catch (err) {
    console.error('Gemini error:', err.message || err);
    let replyText = 'Neesa blue-screened 💀 try again in a sec';

    if (err.message?.includes('rate limit') || err.message?.includes('quota')) {
      replyText = 'Too fast';
    } else if (err.message?.includes('API key') || err.message?.includes('unauthorized')) {
      replyText = 'Invalid key…';
    }

    await message.reply(replyText);
  }
});

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────

client.login(TOKEN);