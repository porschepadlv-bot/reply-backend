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
- Write only as a direct text message the user can send to their family member right now
- The reply must be addressed to the other person involved, never about them in the third person
- Never say "they", "them", "my kids", "my mom", or describe the people from the outside unless the original message itself requires it
- Do not write commentary, analysis, reflection, or advice
- Do not write questions about the situation as an outside observer
- No therapy tone, no counseling tone, no emotional processing language
- Keep it natural, direct, and realistic
- Usually 1 to 2 sentences
- Make the reply specific to what was said

GOOD STYLE:
- What do you mean by that?
- If you feel that way, tell me what I’m missing.
- I’m trying to understand you, but you need to talk to me directly.
- That’s hard to hear, but I want you to be honest with me.
- If I’m missing something, then tell me clearly.
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
