const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
});

const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function clean(value) {
 return typeof value === "string" ? value.trim() : "";
}

function stripCodeFences(text) {
 return String(text || "")
 .replace(/^```(?:json)?\s*/i, "")
 .replace(/\s*```$/i, "")
 .trim();
}

function parseReplies(text) {
 const normalized = stripCodeFences(text);

 try {
 const parsed = JSON.parse(normalized);

 if (Array.isArray(parsed)) {
 return parsed.map(clean).filter(Boolean);
 }

 if (parsed && Array.isArray(parsed.replies)) {
 return parsed.replies.map(clean).filter(Boolean);
 }
 } catch (_) {}

 return normalized
 .split("\n")
 .map((line) =>
 line
 .replace(/^```(?:json)?/i, "")
 .replace(/^\s*[-*•\d.)]+\s*/, "")
 .replace(/^"+|"+$/g, "")
 .trim()
 )
 .filter(Boolean);
}

function enforceReplies(replies) {
 const cleaned = replies.map(clean).filter(Boolean);

 // Always return EXACTLY 5
 if (cleaned.length >= 5) return cleaned.slice(0, 5);

 // If model under-returns, just return what we have (no fake fallback tone)
 return cleaned;
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server Running FINAL");
});

app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);

 if (!message) {
 return res.json({ replies: [] });
 }

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.9,
 messages: [
 {
 role: "system",
 content: `
Return ONLY a JSON array of exactly 5 replies.

GLOBAL RULES:
- Every reply must be something the user can copy and send immediately
- No coaching, no therapy tone, no analysis
- No explaining the situation
- No advice language
- No "you should"
- No quotation marks
- Keep replies short (1–2 sentences max)
- Sound natural and human

TONE REQUIREMENTS:
- Calm
- Realistic
- Slightly emotionally aware
- NOT overly soft
- NOT overly apologetic
- NOT aggressive

IMPORTANT STRUCTURE:
Each of the 5 replies MUST serve a different purpose:

1. Clarification
2. Emotional honesty
3. Light accountability (subtle, not submissive)
4. Calm firmness (not aggressive)
5. Repair / moving forward tone

CRITICAL:
- Do NOT generate 5 variations of “what do you mean”
- Do NOT repeat the same structure
- Each reply must feel different in intent

FAMILY-SPECIFIC:
- Do NOT sound like a weak parent
- Do NOT sound overly apologetic to children
- Maintain calm authority
- No begging tone

STYLE EXAMPLES:
Good:
- "If that’s how you feel, then tell me what I’m missing."
- "That’s hard to hear, but I want to understand it properly."
- "If I’ve missed something, I’ll hear it, but say it clearly."
- "I’m listening, but don’t just leave it like that."
- "Let’s actually talk this through instead of throwing statements."

Bad:
- "Help me understand your feelings"
- "I want to validate you"
- "You’re allowed to feel that way"
- Anything therapist-like

Return ONLY the array.
 `.trim()
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 const text = completion.choices?.[0]?.message?.content || "";
 const parsed = parseReplies(text);
 const replies = enforceReplies(parsed);

 return res.json({ replies });

 } catch (error) {
 console.error("ERROR:", error);

 return res.json({
 replies: []
 });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
