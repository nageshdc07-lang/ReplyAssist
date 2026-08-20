import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Proxy endpoint ───────────────────────────────────────────────────────────
app.post('/api/transform', async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    return res.status(500).json({ error: 'Server configuration error.' });
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

// ── Fallback: serve index.html for any unknown route ────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
