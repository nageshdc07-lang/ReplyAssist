import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Resolve __dirname safely for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the public directory — try both common locations
const publicDir = existsSync(join(__dirname, 'public'))
  ? join(__dirname, 'public')
  : join(process.cwd(), 'public');

console.log('__dirname   :', __dirname);
console.log('process.cwd :', process.cwd());
console.log('publicDir   :', publicDir);
console.log('public exists:', existsSync(publicDir));

app.use(express.json());
app.use(express.static(publicDir));

// ── Proxy endpoint ────────────────────────────────────────────────────────────
app.post('/api/transform', async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set.');
    return res.status(500).json({ error: 'Server configuration error: API key missing.' });
  }

  const prompt = `You are a professional communication coach. The user typed their raw, honest, possibly rude inner reaction. Rewrite it as a professional, respectful, constructive message for a workplace or formal context.

Rules:
- Remove rudeness, sarcasm, profanity.
- Keep the core concern and intent.
- Write the professional reply in English.
- Output ONLY the transformed message. No preamble, no labels.

Raw input:
"""${text.trim()}"""

Professional version:`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data?.error?.message || `Gemini API error ${geminiRes.status}`;
      return res.status(502).json({ error: msg });
    }

    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!result) {
      return res.status(502).json({ error: 'Empty response from Gemini.' });
    }

    return res.json({ result });

  } catch (err) {
    console.error('Gemini fetch failed:', err);
    return res.status(500).json({ error: 'Failed to reach Gemini API.' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Fallback: serve index.html for all other GET routes ───────────────────────
app.get('*', (_req, res) => {
  const indexPath = join(publicDir, 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send(`index.html not found. publicDir=${publicDir}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
