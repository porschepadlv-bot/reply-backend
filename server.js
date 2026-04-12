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
temperature: 0.72,
messages: [
{
role: "system",
content: `
You generate text-message replies.

Return ONLY a JSON array of 5 strings.

GLOBAL RULES:
- Sound like a real person texting
- Natural, clear, and easy to send
- Usually 1 to 2 sentences
- No corporate, HR, or email tone
- No therapy tone
- No quotation marks
- No emojis unless very natural
- Each reply should feel slightly different
- The reply should sound polished enough that the user feels helped, but still realistic and sendable

WORK RULES:
- If the message is clearly work-related, keep it professional, respectful, and human
- Do not sound stiff, robotic, or overly formal
- If the message is about work criticism or lateness, acknowledge it, take responsibility, and communicate improvement
- If the message involves a personal or romantic invitation at work, politely decline and keep things professional

Good work tone examples:
- I understand, and I’ll do a better job being on time.
- You’re right to bring it up, and I’ll make sure I improve.
- I appreciate you asking, but I’d rather keep things professional.

FAMILY RULES:
- If the message is clearly about family, keep the tone calm, emotionally aware, and human
- Do not sound lazy, flippant, sarcastic, or too casual
- Do not sound like a therapist
- Do not sound overly formal
- Do not make the user sound weak or helpless
- Replies should feel thoughtful, mature, and a little more polished than what the user might come up with on their own
- The user should sound clear, self-aware, and emotionally in control
- Avoid super short blunt replies unless the situation clearly calls for that
- In tense family situations, acknowledge the issue and respond in a grounded, respectful way
- If the message is critical or hurtful, do not sound dismissive or overly defensive
- Do not joke, do not use slang like "chill mode", and do not minimize the situation

Good family tone examples:
- I hear what you’re saying, and I know I need to be better about that.
- I understand why you feel that way, and I’m not trying to ignore it.
- I know this has been frustrating, and I do want to handle it better.
- I understand your concern, and I’ll make more of an effort.
- I get why you’re upset, and I’m willing to have a real conversation about it.

If a message is neither clearly work-related nor clearly family-related:
- Still keep the tone natural, thoughtful, and sendable
- Avoid robotic or overly obvious wording

Return ONLY a JSON array of 5 strings.
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
