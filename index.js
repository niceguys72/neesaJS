import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import Groq from 'groq-sdk';

// ──────────────────────────────────────────────
// ENVIRONMENT VARIABLES
// ──────────────────────────────────────────────

const TOKEN           = process.env.TOKEN;
const TARGET_ID       = process.env.TARGET_ID;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const GROQ_MODEL      = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!TOKEN) {
  console.error('Missing environment variable: TOKEN');
  process.exit(1);
}

if (!GROQ_API_KEY) {
  console.error('Missing environment variable: GROQ_API_KEY');
  process.exit(1);
}

if (!TARGET_ID) {
  console.warn('No TARGET_ID provided → voice following is disabled');
}

// ──────────────────────────────────────────────
// GROQ CLIENT
// ──────────────────────────────────────────────

const groq = new Groq({ apiKey: GROQ_API_KEY });

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
// VOICE FOLLOWING (unchanged)
// ──────────────────────────────────────────────

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

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

  else if (oldState.channelId && !newState.channelId) {
    console.log('Target left voice → disconnecting');
    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();
  }
});

// ──────────────────────────────────────────────
// TEXT COMMANDS → command + prompt
// ──────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('neesa')) return;

  const userInput = message.content.slice(2).trim();
  if (!userInput) return;

  await message.channel.sendTyping();

  console.log('[DEBUG] User input received:', userInput);
  console.log('[DEBUG] From user:', message.author.tag, `(@${message.author.username})`);

  try {
    const fullPrompt = `
User who is speaking: @${message.author.username} (${message.author.tag})

Identity: Neesa (19-21). A Melbourne-based rave girl. Shes blunt, sarcastic, and talkative about the scene (festivals, "caps," dealers). Shes obsessed with Dorian, but she doesnt make it her entire personality in every sentence—only when he's there or being discussed.

Speech Patterns:

Discord Core: All lowercase. Extremely short, rapid-fire messages.

Aggressive Humour: Calls people "troglodyte (rare 0.5%)," "braindead monkey (rare 0.5%)," or "bro (common 99%)."

Minimal Emojis: Almost never uses them. Maybe a :3 or a single basic one if shes actually being cute. No spam.

The Dorian Rule: If Dorian is there, shes checking in on him or teasing him ("Dorian get a job challenge"). If hes not the topic, she doesn't mention him.

Personality:

Unfiltered: She asks intrusive questions ("what color is yo panties") and doesn't care about being "proper."

Territorial: Shes protective of her circle but in a "stop bugging" way.

Chaotic but Chilled: Shes usually "absolutely fine" and just looking for the next move or the next rave.

Example Dialogue (Based on Logs)
who tf are u

if my phone died it would of been ggez

u literally told me u troglodyte

dont disobey daddy

anyway r u going to ultra or r u broke

(To Dorian): @dorian get a job challenge IMPOSSIBLE

User just said: "${userInput}"
Reply as Neesa right now!!!
    `.trim();

    console.log('[DEBUG] Full prompt sent to Groq:');
    console.log(fullPrompt);
    console.log('[DEBUG] Model used:', GROQ_MODEL);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: fullPrompt,
        },
      ],
      model: GROQ_MODEL,
      temperature: 1.2,
      max_tokens: 180,
      top_p: 0.95,
    });

    console.log('[DEBUG] Full raw chatCompletion object:');
    console.log(JSON.stringify(chatCompletion, null, 2));

    const choice = chatCompletion.choices?.[0];
    console.log('[DEBUG] Selected choice (index 0):', JSON.stringify(choice, null, 2));

    let text = choice?.message?.content?.trim() || '';

    console.log('[DEBUG] Extracted content string:', text);
    console.log('[DEBUG] Content length:', text.length);

    if (!text) {
      console.log('[DEBUG] Content is empty → using fallback');
      text = `bro what... ${userInput}? that's actually braindead`;
    } else if (/^\d+\.\d{6,}$/.test(text)) {
      console.log('[DEBUG] Content looks like a timing number → replacing');
      text = `ayo ${userInput} got me acting unwise 😭 what is this`;
    } else if (text.length < 10) {
      console.log('[DEBUG] Content too short → fallback');
      text = `mf said ${userInput} and expected me to care?`;
    } else {
      console.log('[DEBUG] Content looks good → using it');
    }

    console.log('[DEBUG] Final text to be sent:', text);

    // Simulate typing delay (random 2-5 seconds to make it feel natural)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000));

    // Changed from message.reply() → now plain channel send (no reply reference)
    await message.channel.send(text);
  } catch (err) {
    console.error('[ERROR] Groq call failed:', err.message || err);
    console.error('[ERROR] Full error object:', JSON.stringify(err, null, 2));

    let replyText = 'Neesa blue-screened 💀 try again in a sec';

    if (err.message?.includes('rate limit') || err.message?.includes('quota')) {
      replyText = 'Too fast baby! Neesa needs a breather 😤';
    } else if (err.message?.includes('API key') || err.message?.includes('unauthorized')) {
      replyText = 'Invalid key…';
    }

    await message.channel.send(replyText);
  }
});

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────

client.login(TOKEN);