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
 return parsed.map((x) => clean(x)).filter(Boolean);
 }

 if (parsed && Array.isArray(parsed.replies)) {
 return parsed.replies.map((x) => clean(x)).filter(Boolean);
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

// THIS IS THE FIX — OUTSIDE FUNCTIONS
function enforceReplies(category, replies) {
const original = replies.map((x) => clean(x)).filter(Boolean);
let cleaned = [...original];

if (category === "family") {
const bannedPhrases = [
"no pressure",
"take it slow",
"no rush",
"one step at a time"
];

cleaned = cleaned.filter((reply) => {
const lower = reply.toLowerCase();
return !bannedPhrases.some((phrase) => lower.includes(phrase));
});

// If filtering leaves too few replies, fall back to original replies
if (cleaned.length < 3) {
return original.slice(0, 5);
}

return cleaned.slice(0, 5);
}

return original.slice(0, 5);
}

function categoryRules(category) {
 switch (category) {

case "family":
return `
FAMILY RULES:
- Write exactly what the user would text back
- No therapy tone, no analysis, no emotional processing
- No "that stings", "I feel", "I want to understand", etc
- Do not sound like a counselor, coach, or mediator
- Keep it natural, direct, and realistic
- 1–2 sentences max
- Slight emotion is OK (frustration, confusion), but keep it real
- Be specific to what was said, not generic

STYLE:
- Speak plainly, like a real conversation
- It’s okay to question, push back, or be a little blunt
- Don’t over-explain

GOOD EXAMPLES:
- What do you mean I don’t get you?
- If something’s bothering you, just say it to me.
- I’m trying, but I can’t fix what I don’t understand.
- That’s not really fair.
- If that’s how you feel, we should actually talk about it.
`;

 default:
 return "";
 }
}
app.get("/", (_req, res) => {
 res.send("AI Reply Server Running V1000 CLEAN");
});

app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
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
Return ONLY a JSON array of 5 replies.

- Must sound like real text messages
- No therapy tone
- No advice tone
- No emotional commentary
${categoryRules(category)}
`
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 const text = completion.choices?.[0]?.message?.content || "";

 const parsed = parseReplies(text);
 const replies = enforceReplies(category, parsed);
 console.log("REPLIES SENT:", replies);
 return res.json({ replies });

 } catch (error) {
 console.error("ERROR:", error);
 return res.status(500).json({ error: "Server failed" });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
