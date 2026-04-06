import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import express from "express";
import OpenAI from "openai";

console.log("ENV KEY:", process.env.OPENAI_API_KEY ? "LOADED" : "MISSING");

const app = express();
app.use(express.json());

const client = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

app.post("/reply", async (req, res) => {
try {
console.log("🔥 HIT CURRENT SERVER");

const { message = "", context = "", previousReplies = [] } = req.body;

const trimmedMessage = String(message).trim();
const trimmedContext = String(context).trim();

if (!trimmedMessage) {
return res.json({ replies: [] });
}

const prompt = `
You generate realistic iPhone-style text replies.

Situation:
${trimmedContext || "No extra context"}

Message to reply to:
${trimmedMessage}

STYLE GOAL:
These must feel like real human texts, not AI.

CONTEXT RULES:
- Use both the situation and the exact message
- If the situation is serious, do not soften it
- Do not assume the user wants to keep the relationship
- Do not assume things are okay

TONE VARIETY:
Give 4 different emotional angles:
1. calm / composed
2. firm / direct
3. hurt / honest
4. slightly shocked / clarity-seeking

GLOBAL RULES:
- return exactly 4 replies
- each on a new line
- no emojis
- no quotes
- no numbering
- short
- natural texting language
- each reply must feel clearly different
- no therapy tone
- no explanations
- no advice
- no fluff
- avoid robotic phrasing

REALISM RULES:
- slight imperfection is okay
- contractions are okay
- casual phrasing
- do not over-explain
- do not sound written

Avoid anything that sounds AI-generated.
`;

const response = await client.chat.completions.create({
model: "gpt-4o-mini",
messages: [{ role: "system", content: prompt }],
temperature: 0.7
});

const text = response.choices?.[0]?.message?.content || "";

let replies = text
.split("\\n")
.map((r) => r.trim())
.filter(Boolean);

replies = replies.filter((r) => !previousReplies.includes(r));
replies = replies.slice(0, 4);

return res.json({ replies });
} catch (err) {
console.error("❌ ERROR:", err);
return res.status(500).json({ error: "Failed to generate replies" });
}
});

app.listen(3000, () => {
console.log("🚀 Server running on port 3000");
});