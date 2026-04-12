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

function toArray(value) {
return Array.isArray(value) ? value : [];
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
return parsed.map((x) => clean(x)).filter(Boolean).slice(0, 5);
}
} catch (_) {}

return normalized
.split("\n")
.map((line) =>
line
.replace(/^```(?:json)?/i, "")
.replace(/^\s*[$begin:math:display$$end:math:display$,]+\s*$/g, "")
.replace(/^\s*[-*•\d.)]+\s*/, "")
.replace(/^"+|"+$/g, "")
.trim()
)
.filter(Boolean)
.slice(0, 5);
}

app.get("/", (_req, res) => {
res.send("AI Reply Server Running");
});

app.get("/health", (_req, res) => {
res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
try {
const message = clean(req.body?.message);

if (!message) {
return res.status(400).json({ error: "Missing message" });
}

const completion = await openai.chat.completions.create({
model: MODEL,
temperature: 0.7,
messages: [
{
role: "system",
content: `
You generate short text-message replies.

Return ONLY a JSON array of 5 strings.

GLOBAL RULES:
- Sound like a real person texting
- 1 short sentence (max 2)
- No corporate, HR, or email tone
- No fluff or overexplaining
- No quotation marks
- No emojis unless very natural
- Each reply should feel slightly different

WORK RULES (if message is work-related):
- Keep it professional but human
- Use simple, natural language
- Avoid formal phrases like "Thank you for bringing this to my attention"
- Be direct, calm, and respectful

If message is about being late / performance:
- Acknowledge simply
- Take responsibility
- Keep it short

Examples:
- You’re right — I’ll do better.
- I hear you. I’ll make sure it doesn’t keep happening.
- That’s on me, I’ll fix it.

If message involves coworker asking you out / personal invite at work:
- Politely decline
- Keep it professional
- Do NOT sound interested or playful

Examples:
- I appreciate it, but I’d rather keep things professional.
- Thanks for asking, but I want to keep work and personal separate.

Return ONLY a JSON array.
`.trim()
},
{
role: "user",
content: message
}
]
});

const text = completion.choices?.[0]?.message?.content || "";
const replies = parseReplies(text);

if (!replies.length) {
return res.status(500).json({ error: "No replies generated" });
}

return res.json({ replies });
} catch (error) {
console.error("Reply error:", error);
return res.status(500).json({
error: "Failed to generate replies"
});
}
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
