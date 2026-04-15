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

// remove duplicates
function uniqueReplies(replies) {
 const seen = new Set();
 const result = [];

 for (const r of replies) {
 const reply = clean(r);
 if (!reply) continue;

 const key = reply.toLowerCase();
 if (seen.has(key)) continue;

 seen.add(key);
 result.push(reply);
 }

 return result;
}

// category-specific cleanup
function filterReplies(category, replies) {
 let cleaned = uniqueReplies(replies);

 if (category === "family") {
 const banned = ["no pressure", "take it slow", "no rush", "one step at a time"];

 cleaned = cleaned.filter(r => {
 const lower = r.toLowerCase();
 return !banned.some(p => lower.includes(p));
 });
 }

 return cleaned;
}

// category rules (THIS FIXES GENERIC + THERAPY ISSUE)
function categoryRules(category) {
 switch (category) {

 case "dating":
 return `
DATING:
- Sound natural and human
- Slight curiosity is good
- Not flirty, not thirsty
- Not robotic
- No therapy tone
- Keep it easy to reply to
`;

 case "relationship":
 return `
RELATIONSHIP:
- Direct, accountable, real
- No therapy tone
- No analysis
- Sound like a real partner texting
`;

 case "friendship":
 return `
FRIENDSHIP:
- Casual, honest, natural
- No therapy tone
- No analysis
`;

 case "family":
 return `
FAMILY:
- Direct message only
- No therapy tone
- No analysis
- No third-person talking
`;

 case "work":
 return `
WORK:
- Professional, neutral
- No personal tone
- No flirting
- No therapy tone
`;

 default:
 return "";
 }
}

// MAIN AI GENERATION (RETRY + VARIETY)
async function generateReplies({ category, message, previousReplies }) {

 let best = [];

 for (let attempt = 0; attempt < 3; attempt++) {

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.85 + (attempt * 0.1),

 messages: [
 {
 role: "system",
 content: `
Return ONLY a JSON array of EXACTLY 5 replies.

RULES:
- Direct text messages only
- No advice
- No therapy tone
- No analysis
- No quotes
- Make each reply DIFFERENT
- Avoid repeating wording
- Avoid these previous replies:

${previousReplies.map(r => `- ${r}`).join("\n") || "- none"}

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

 const filtered = filterReplies(category, parsed)
 .filter(r => !previousReplies.some(p => p.toLowerCase() === r.toLowerCase()));

 if (filtered.length > best.length) {
 best = filtered;
 }

 if (filtered.length >= 5) {
 return filtered.slice(0, 5);
 }
 }

 throw new Error("AI failed to generate enough replies");
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server V1003 CLEAN");
});

app.post("/reply", async (req, res) => {
 try {

 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);
 const previousReplies = Array.isArray(req.body?.previousReplies)
 ? req.body.previousReplies.map(clean)
 : [];

 if (!message) {
 return res.status(400).json({ error: "Missing message" });
 }

 const replies = await generateReplies({
 category,
 message,
 previousReplies
 });

 return res.json({ replies });

 } catch (err) {
 console.error(err);
 return res.status(500).json({ error: "AI failed" });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
