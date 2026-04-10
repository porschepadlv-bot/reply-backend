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

function clean(value) {
return typeof value === "string" ? value.trim() : "";
}

function normalizeCategory(category) {
const value = clean(category).toLowerCase();
const allowed = ["dating", "relationship", "friendship", "family", "work"];
return allowed.includes(value) ? value : "dating";
}

function normalizeTone(category, tone) {
const value = clean(tone).toLowerCase();

if (category === "dating") {
const allowed = ["flirty", "funny", "smooth", "confident", "cute", "chill", "polite"];
return allowed.includes(value) ? value : "flirty";
}

const allowed = ["calm", "accountable", "firm", "direct", "polite", "warm", "closure"];
return allowed.includes(value) ? value : "calm";
}

function normalizeGoal(category, goal) {
const value = clean(goal).toLowerCase();

if (category === "dating") {
return value || "pursuing interest";
}

return value || "resolution";
}

function buildSystemPrompt(category, tone, goal) {
return `
You write high-quality text-message replies for a mobile app.

Rules:
- Return exactly 5 reply options
- Each reply should feel like a real text
- Usually 1 line, max 2 short lines
- No labels
- No numbering
- No quotation marks
- No explanations
- No robotic therapy language
- Each option must feel different from the others
- Match the requested tone exactly

Category: ${category}
Tone: ${tone}
Goal: ${goal}

Tone guidance:
- flirty = playful, attractive, confident, never needy
- funny = witty, light, charming, never wounded
- smooth = polished, effortless, calm confidence
- confident = brief, bold, self-respecting
- cute = sweet, warm, charming
- chill = casual, easy, natural
- polite = respectful, mature, human
- calm = steady, composed, emotionally controlled
- accountable = takes ownership cleanly, no defensiveness
- firm = clear boundaries, strong but not rude
- direct = straight to the point, no fluff
- warm = kind, human, open
- closure = final, self-respecting, emotionally controlled

Return ONLY a valid JSON array of 5 strings.
`.trim();
}

function buildUserPrompt({ message, category, tone, goal, issue, previousReplies, conversationContext }) {
const prev = Array.isArray(previousReplies) ? previousReplies.filter(Boolean) : [];
const convo = Array.isArray(conversationContext) ? conversationContext.filter(Boolean) : [];

return `
Message to respond to:
${message}

Category:
${category}

Tone:
${tone}

Goal:
${goal}

Issue:
${issue || "None"}

Recent conversation context:
${convo.length ? convo.join("\n") : "None"}

Replies already shown before:
${prev.length ? prev.join("\n") : "None"}

Important:
- Do not repeat or closely paraphrase any previous reply
- Make the replies feel strong on first impression
- Keep them usable as real texts

Return ONLY a valid JSON array of 5 strings.
`.trim();
}

function parseReplies(text) {
try {
const parsed = JSON.parse(text);
if (Array.isArray(parsed)) {
return parsed
.map((item) => clean(item))
.filter(Boolean)
.slice(0, 5);
}
} catch (_) {}

return text
.split("\n")
.map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
.filter(Boolean)
.slice(0, 5);
}

app.get("/", (_req, res) => {
res.send("AI Reply Server Running");
});

app.get("/health", (_req, res) => {
res.json({ ok: true });
});

app.post("/reply", async (req, res) => {
try {
const message = clean(req.body?.message);
const category = normalizeCategory(req.body?.category);
const tone = normalizeTone(category, req.body?.tone || req.body?.mode);
const goal = normalizeGoal(category, req.body?.goal);
const issue = clean(req.body?.issue);
const previousReplies = Array.isArray(req.body?.previousReplies) ? req.body.previousReplies : [];
const conversationContext = Array.isArray(req.body?.conversationContext) ? req.body.conversationContext : [];

if (!message) {
return res.status(400).json({
error: "Missing message"
});
}

const completion = await openai.chat.completions.create({
model: "gpt-4o-mini",
temperature: 0.9,
messages: [
{
role: "system",
content: buildSystemPrompt(category, tone, goal)
},
{
role: "user",
content: buildUserPrompt({
message,
category,
tone,
goal,
issue,
previousReplies,
conversationContext
})
}
]
});

const text = completion.choices?.[0]?.message?.content || "";
const replies = parseReplies(text);

if (!replies.length) {
return res.status(500).json({
error: "No replies generated"
});
}

return res.json({ replies });
} catch (error) {
console.error("Reply error:", error);

return res.status(500).json({
error: "Failed to generate replies",
details: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error)
});
}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`AI Reply Server Running on port ${PORT}`);
});