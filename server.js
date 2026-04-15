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
 .replace(/```json/gi, "")
 .replace(/```/g, "")
 .trim();
}

function parseReplies(text) {
 const normalized = stripCodeFences(text);

 const cleanArray = (arr) =>
 arr
 .map((x) => clean(x))
 .map((x) => x.replace(/^"+|"+$/g, "").trim())
 .filter(Boolean);

 try {
 const parsed = JSON.parse(normalized);

 if (Array.isArray(parsed)) {
 return cleanArray(parsed);
 }

 if (parsed && Array.isArray(parsed.replies)) {
 return cleanArray(parsed.replies);
 }

 if (typeof parsed === "string") {
 const nested = JSON.parse(parsed);

 if (Array.isArray(nested)) {
 return cleanArray(nested);
 }

 if (nested && Array.isArray(nested.replies)) {
 return cleanArray(nested.replies);
 }
 }
 } catch (_) {}

 const lines = normalized
 .split("\n")
 .map((line) =>
 line
 .replace(/^\s*[-*•\d.)]+\s*/, "")
 .replace(/^[\[\],"]+/, "")
 .replace(/^"+|"+$/g, "")
 .trim()
 )
 .filter(Boolean);

 if (lines.length === 1) {
 try {
 const nested = JSON.parse(lines[0]);

 if (Array.isArray(nested)) {
 return cleanArray(nested);
 }

 if (nested && Array.isArray(nested.replies)) {
 return cleanArray(nested.replies);
 }
 } catch (_) {}
 }

 return lines.filter((x) => x !== "[" && x !== "]");
}

function enforceReplies(category, replies) {
 const original = replies
 .map((x) => clean(x))
 .map((x) => x.replace(/^"+|"+$/g, "").trim())
 .filter(Boolean);

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
FAMILY:
- Write only as a direct text message the user can send to their family member right now
- The reply must be written TO the family member, not TO the user
- The reply must always be addressed to the other person involved, never to the user
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
- The best replies should often do one or both of these:
 1. ask for clarification in a calm, direct way
 2. show slight accountability or apology when that fits
- When the other person is critical, disappointed, or rejecting, prefer replies that sound open, honest, and willing to understand instead of just defensive
- Slightly apologetic is good when appropriate, but do not overdo it
- Do not sound desperate, weak, or begging
- Make the reply specific to what was said

GOOD STYLE:
- If that’s how you feel, then tell me what I’m missing instead of just leaving it there.
- I’m trying to understand you, and if I’ve been getting it wrong, then tell me clearly.
- I’m sorry if I haven’t been seeing it the way I should, but I want you to talk to me directly.
- That’s hard to hear, but I’d rather you be honest with me and tell me what you mean.
- If I’ve fallen short with you, then say that clearly so I can understand it better.
- I may not have gotten everything right, but I do care, and I want you to tell me what feels missing.
- Can you tell me what you mean by that? I want to understand where you're coming from.
- If that's how you feel, then help me understand what got us here.
- I'm sorry if I've been missing something, but I need you to be clear with me.
- I hear what you're saying, and if I've fallen short, I want to understand how.
- That’s hard to hear, but I’d rather talk about it clearly than leave it there.
- If I’ve been getting it wrong, then tell me directly so I can understand it better.
- I’m sorry if that’s how I’ve come across. Can you tell me what you mean?
`;

 case "relationship":
 return `
RELATIONSHIP:
- Write only as a direct text message the user can send right now
- Keep it natural, grounded, and sendable
- No therapist tone
- No advice
- No analysis
- No outside-observer framing
- Accountability is good when it fits
- Clarity is more important than sounding polished
- Avoid generic filler
`;

 case "friendship":
 return `
FRIENDSHIP:
- Write only as a direct text message the user can send right now
- Keep it natural, direct, and realistic
- No therapist tone
- No advice
- No analysis
- No outside-observer framing
- Prefer honest, calm, textable replies
`;

 case "dating":
 return `
DATING:
- Write only as a direct text message the user can send right now
- Keep it natural, attractive, casual, and easy to reply to
- No therapist tone
- No advice
- No analysis
- Do not sound cheesy, thirsty, robotic, or performative
- Keep it socially aware and realistic
`;

 case "work":
 return `
WORK:
- Write only as a direct text message or workplace message the user can send right now
- Keep it professional, respectful, and work-focused
- No therapist tone
- No advice
- No analysis
- Never encourage personal or romantic escalation
`;

 default:
 return "";
 }
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server Running V1003");
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
 temperature: 0.9,
 messages: [
 {
 role: "system",
 content: `
Return ONLY a plain JSON array of EXACTLY 5 strings.
Do NOT include markdown.
Do NOT include \`\`\`json.
Do NOT include explanation.
Do NOT return an object.
Example format:
["Reply one","Reply two","Reply three","Reply four","Reply five"]

GLOBAL RULES:
- Every reply must be a message the user can copy and send immediately
- Never write as a coach, therapist, counselor, mediator, or outside observer
- No advice tone
- No emotional commentary from the outside
- No analysis
- No journaling
- No reflection about the situation
- No quotation marks around replies unless they are naturally part of the message
- Use plain, natural, everyday text-message language
- Keep replies specific to the message, not generic filler
- Replies should feel human, emotionally real, and worth sending
- When appropriate, prefer replies that invite clarification and understanding instead of sounding purely defensive

${categoryRules(category)}
`.trim()
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 let text = completion.choices?.[0]?.message?.content || "";

 text = text
 .replace(/```json/gi, "")
 .replace(/```/g, "")
 .trim();

 let replies;
 const parsed = parseReplies(text);

 if (!parsed || parsed.length === 0) {
 replies = [];
 } else {
 replies = enforceReplies(category, parsed);
 }

 replies = replies
 .map((r) => clean(r))
 .map((r) => r.replace(/^"+|"+$/g, "").trim())
 .filter((r) => r && r !== "[" && r !== "]")
 .slice(0, 5);

 return res.json({ replies });
 } catch (error) {
 console.error("ERROR:", error);
 return res.status(500).json({ error: "Server failed" });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});

process.on("uncaughtException", (err) => {
 console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (err) => {
 console.error("UNHANDLED:", err);
});
