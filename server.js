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

function uniqueReplies(replies) {
 const seen = new Set();
 const result = [];

 for (const raw of replies) {
 const reply = clean(raw);
 if (!reply) continue;

 const key = reply.toLowerCase();
 if (seen.has(key)) continue;

 seen.add(key);
 result.push(reply);
 }

 return result;
}

function filterReplies(category, replies) {
 let cleaned = uniqueReplies(replies);

 if (category === "family") {
 const banned = [
 "no pressure",
 "take it slow",
 "no rush",
 "one step at a time"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !banned.some((phrase) => lower.includes(phrase));
 });
 }

 return cleaned;
}

function categoryRules(category) {
 switch (category) {
 case "dating":
 return `
DATING:
- Write only as a direct text the user can send back right now
- Keep replies natural, casual, easy to answer, and human
- Show interest without sounding flirty, thirsty, overly smooth, or suggestive
- Do not escalate too quickly
- Do not suggest hanging out, meeting up, coming over, or doing an activity unless the other person's message clearly invites that
- No therapy tone
- No analysis
- No cheesy lines
- Usually 1 to 2 sentences
`;

 case "relationship":
 return `
RELATIONSHIP:
- Write only as a direct text the user can send to their partner
- Be clear, accountable, emotionally real, and human
- No therapy tone
- No counseling language
- No vague reflection
- No mixed signals
- Usually 1 to 2 sentences
`;

 case "friendship":
 return `
FRIENDSHIP:
- Write only as a direct text the user can send to their friend
- Keep it natural, balanced, direct, and realistic
- No therapy tone
- No emotional analysis
- No commentary from the outside
- Usually 1 to 2 sentences
`;

 case "family":
 return `
case "family":
return `
FAMILY:
- Write only as a direct text message the user can send to their family member right now
- The reply must be written TO the family member, not TO the user
- Never ask the user questions
- Never refer to the family member in third person like "they", "them", "your kids", "your mom", or "what they mean"
- Do not sound like a therapist, counselor, coach, mediator, or outside observer
- No advice
- No analysis
- No reflection from the outside
- No lines like "Can you help me understand what they mean?", "That sounds tough", or "What do you think..."
- Keep it human, direct, realistic, and sendable
- Most replies should be 1 to 2 full sentences
- When appropriate, prefer:
1. calm clarification directed at the family member
2. slight accountability or apology
3. honest but controlled emotion
- Do not sound cold or detached
- Do not sound overly polished or clinical

GOOD STYLE:
- If that’s how you feel, then tell me what I’m missing instead of just leaving it there.
- I’m trying to understand you, and if I’ve been getting it wrong, then tell me clearly.
- I’m sorry if I haven’t been seeing it the way I should, but I want you to talk to me directly.
- That’s hard to hear, but I’d rather you be honest with me and tell me what you mean.
- If I’ve fallen short with you, then say that clearly so I can understand it better.
- I may not have gotten everything right, but I do care, and I want you to tell me what feels missing.
`;
 case "work":
 return `
WORK:
- Write only as a direct message the user can send in a work context
- Keep replies professional, respectful, neutral, and human
- Never sound romantic, personal, playful, or flirty
- If the message crosses professional boundaries, politely keep it work-focused
- No therapy tone
- No analysis
- Usually 1 to 2 sentences
`;

 default:
 return `
GENERAL RULES:
- Write only as a direct sendable text message
- No therapy tone
- No advice tone
- No analysis
- No emotional commentary from the outside
- Usually 1 to 2 sentences
`;
 }
}

function buildSystemPrompt({ category, context, previousReplies }) {
 const avoidBlock = previousReplies.length
 ? previousReplies.map((x) => `- ${x}`).join("\n")
 : "- none";

 const contextBlock = context
 ? `ADDITIONAL CONTEXT:\n${context}\n`
 : "";

 return `
Return ONLY a JSON array of EXACTLY 5 replies.

GLOBAL RULES:
- Every reply must be a message the user can copy and send immediately
- Never write as a coach, therapist, counselor, mediator, or outside observer
- No advice tone
- No emotional commentary from the outside
- No analysis
- No journaling
- No reflection about the situation
- No quotation marks around replies
- Use plain, natural, everyday text-message language
- Keep replies specific to the message, not generic filler
- Every reply should be meaningfully different from the others
- Do not repeat wording
- If you are about to generate a reply similar to an avoided reply, generate a different one instead
- You MUST return exactly 5 replies
- Do not make replies too short, emotionally flat, or dismissive
- Most replies should be 1 to 2 full sentences
- Replies should feel human, emotionally real, and worth sending

${categoryRules(category)}

${contextBlock}REPLIES TO AVOID:
${avoidBlock}
`.trim();
}

async function generateReplies({ category, context, message, previousReplies }) {
 let bestReplies = [];

 for (let attempt = 0; attempt < 3; attempt += 1) {
 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.95 + (attempt * 0.1),
 messages: [
 {
 role: "system",
 content: buildSystemPrompt({ category, context, previousReplies })
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 const text = completion.choices?.[0]?.message?.content || "";
 const parsed = parseReplies(text);
 const filtered = filterReplies(category, parsed).filter(
 (reply) => !previousReplies.some((prev) => prev.toLowerCase() === reply.toLowerCase())
 );

 if (filtered.length > bestReplies.length) {
 bestReplies = filtered;
 }

 if (filtered.length >= 5) {
 return filtered.slice(0, 5);
 }
 }

 throw new Error(`Could not generate 5 valid replies. Best count: ${bestReplies.length}`);
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server V1004 HUMAN");
});

app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);
 const context = clean(req.body?.context);
 const previousReplies = Array.isArray(req.body?.previousReplies)
 ? uniqueReplies(req.body.previousReplies.map((x) => clean(x))).slice(0, 20)
 : [];

 if (!message) {
 return res.status(400).json({ error: "Missing message" });
 }

 const replies = await generateReplies({
 category,
 context,
 message,
 previousReplies
 });

 return res.json({ replies });
 } catch (error) {
 console.error("ERROR:", error);
 return res.status(502).json({
 error: "Failed to generate replies"
 });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
