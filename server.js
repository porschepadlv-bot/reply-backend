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
let cleaned = replies.map((x) => clean(x)).filter(Boolean);

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

if (cleaned.length < 4) {
return [
"I hear what you’re saying, and I know I need to put in more effort.",
"You’re right to bring it up, and I need to do better with this.",
"I know I haven’t been doing enough, and I understand why that’s frustrating.",
"I hear your point, and I need to be more consistent about helping out.",
"I know this has been frustrating, and I’m going to work on doing better."
];
}

return cleaned.slice(0, 5);
}

return replies.slice(0, 5);
}
function categoryRules(category) {
 switch (category) {

 case "family":
 return `
FAMILY RULES:
- Write the reply as something the user would actually text directly to their family member
- Use first-person language like I, me, and my
- Keep the tone calm, human, and emotionally real
- The reply can show hurt, disappointment, or confusion when it fits
- Do not make the reply cold or emotionally blank
- Do not sound like a therapist or outside observer
- Avoid generic filler phrases
- Make the reply feel specific to the situation
- Usually 1 to 2 sentences
- If the message is hurtful, respond honestly without being aggressive

Examples:
- That honestly hurts to hear, especially coming from you.
- I’m not going to pretend that doesn’t affect me.
- I wish we could talk about this more directly.
- Hearing that like this is actually hard for me.
- I get you’re frustrated, but that still doesn’t feel good to hear.
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
