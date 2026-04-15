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

function normalizeReply(text) {
 return clean(text)
 .replace(/^["'`$begin:math:display$$end:math:display$,\s]+|["'`\[\],\s]+$/g, "")
 .replace(/\s+/g, " ")
 .trim();
}

function dedupeReplies(replies) {
 const seen = new Set();
 const output = [];

 for (const raw of replies) {
 const normalized = normalizeReply(raw);
 const key = normalized.toLowerCase();

 if (!normalized) continue;
 if (normalized === "[" || normalized === "]") continue;
 if (seen.has(key)) continue;

 seen.add(key);
 output.push(normalized);
 }

 return output;
}

function parseReplies(text) {
 const normalized = stripCodeFences(text);

 try {
 const parsed = JSON.parse(normalized);

 if (Array.isArray(parsed)) {
 return dedupeReplies(parsed);
 }

 if (parsed && Array.isArray(parsed.replies)) {
 return dedupeReplies(parsed.replies);
 }

 if (typeof parsed === "string") {
 try {
 const nested = JSON.parse(parsed);

 if (Array.isArray(nested)) {
 return dedupeReplies(nested);
 }

 if (nested && Array.isArray(nested.replies)) {
 return dedupeReplies(nested.replies);
 }
 } catch (_) {}
 }
 } catch (_) {}

 const lines = normalized
 .split("\n")
 .map((line) =>
 line
 .replace(/^```(?:json)?/i, "")
 .replace(/^\s*[-*•\d.)]+\s*/, "")
 .trim()
 );

 return dedupeReplies(lines);
}

function removeNearDuplicates(replies, previousReplies = []) {
 const prior = new Set(previousReplies.map((x) => normalizeReply(x).toLowerCase()));
 const usedStarts = new Set();
 const finalReplies = [];

 for (const reply of replies) {
 const normalized = normalizeReply(reply);
 const lower = normalized.toLowerCase();
 const startKey = lower.split(/[,.!?]/)[0].trim();

 if (!normalized) continue;
 if (prior.has(lower)) continue;
 if (usedStarts.has(startKey)) continue;

 usedStarts.add(startKey);
 finalReplies.push(normalized);
 }

 return finalReplies;
}

function enforceReplies(category, replies, previousReplies = []) {
 let cleaned = dedupeReplies(replies);

 const bannedGlobalPhrases = [
 "that sounds tough",
 "have you tried",
 "maybe you could",
 "it can be tough",
 "i totally understand",
 "i know how that feels",
 "communication can be tricky",
 "help you understand their perspective",
 "see their perspective",
 "connect better with them"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedGlobalPhrases.some((phrase) => lower.includes(phrase));
 });

 if (category === "family") {
 const bannedFamilyPhrases = [
 "help me see their perspective",
 "how they feel",
 "i care about how they feel",
 "can you help me",
 "what do they think",
 "their perspective",
 "that sounds tough",
 "have you tried",
 "maybe you could",
 "connect better",
 "i want to connect",
 "open conversation could help",
 "it can be tough to feel",
 "communication can be tricky",
 "i'm sorry to hear that",
 "what they feel",
 "what do they mean by that?",
 "can you give me an example?"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedFamilyPhrases.some((phrase) => lower.includes(phrase));
 });
 }

 cleaned = removeNearDuplicates(cleaned, previousReplies);

 return cleaned.slice(0, 5);
}

function categoryRules(category) {
 switch (category) {
 case "family":
 return `
FAMILY:
- Write only as a direct text message the user can send right now
- The reply must be addressed directly to the family member
- Do NOT refer to the family member in third person like "they", "them", "my kids", "my mom", or "my dad"
- Do NOT ask the user questions
- Do NOT sound like a therapist, coach, counselor, mediator, or outside observer
- No advice
- No analysis
- No emotional commentary from the outside
- No soft therapy phrases like:
 "that sounds tough"
 "have you tried"
 "maybe you could"
 "help me see their perspective"
 "connect better"
 "communication can be tricky"
- For parent-to-child situations, do NOT make the parent sound weak, submissive, overly apologetic, or unsure of their role
- Slight accountability is okay when appropriate, but keep it restrained
- Clarification is good, but it must sound direct and natural
- Keep replies calm, grounded, human, and sendable
- Most replies should be 1 to 2 full sentences
- Prefer replies that ask for clarity directly or respond firmly without sounding harsh

GOOD STYLE:
- If that's how you feel, then tell me what you mean.
- Don't just say I don't get you and leave it there. Tell me what you're talking about.
- If you think I'm missing something, then say it clearly.
- I may not see it the same way, but I'm listening, so be direct with me.
- If you're frustrated with me, then say what you mean plainly.
- If I've missed something, then spell it out instead of just throwing that at me.
- That's not easy to hear, so tell me clearly what you mean.
- If that's how you see it, then talk to me directly.
`;

 case "relationship":
 return `
RELATIONSHIP:
- Write only as a direct text message the user can send right now
- Keep it natural, direct, emotionally real, and sendable
- No therapy tone
- No coaching
- No advice
- No analysis
- Accountability is good when it fits
- Avoid generic filler
- Most replies should be 1 to 2 sentences
`;

 case "friendship":
 return `
FRIENDSHIP:
- Write only as a direct text message the user can send right now
- Keep it natural, direct, realistic, and socially normal
- No therapy tone
- No coaching
- No advice
- No analysis
- Most replies should be 1 to 2 sentences
`;

 case "dating":
 return `
DATING:
- Write only as a direct text message the user can send right now
- Keep it natural, attractive, casual, socially aware, and easy to reply to
- No therapist tone
- No coaching
- No advice
- No analysis
- Do not sound cheesy, thirsty, robotic, or performative
- Keep it realistic and textable
- Most replies should be 1 to 2 sentences
`;

 case "work":
 return `
WORK:
- Write only as a direct message the user can send right now
- Keep it professional, respectful, neutral, and work-focused
- No therapist tone
- No coaching
- No advice
- No analysis
- Never encourage romantic or personal escalation
- Most replies should be 1 to 2 sentences
`;

 default:
 return "";
 }
}

function fallbackReplies(category) {
 switch (category) {
 case "family":
 return [
 "If that's how you feel, then tell me what you mean.",
 "Don't just leave it at that. Tell me clearly what you're talking about.",
 "If you think I'm missing something, then say it plainly.",
 "I hear what you're saying, but I need you to be specific.",
 "If you're frustrated with me, then be direct about it."
 ];

 case "relationship":
 return [
 "I hear what you're saying, and I need to take that seriously.",
 "You're right to bring it up, and I know I need to do better here.",
 "I’m not trying to dodge it. I know this matters.",
 "I understand why you're upset, and I need to own my part in it.",
 "I hear you, and I know I need to show up better."
 ];

 case "friendship":
 return [
 "If something's off, just say it directly.",
 "I get that you're upset, but I'd rather talk about it clearly.",
 "That didn't sit right with me, and I think we should be honest about it.",
 "If we're going to fix it, then let's actually talk about it.",
 "Say what you mean directly so we can deal with it."
 ];

 case "dating":
 return [
 "What did you mean by that?",
 "Okay, now you have my attention.",
 "Fair enough, tell me more.",
 "I’m not totally sure how to read that yet.",
 "Alright, I'm listening."
 ];

 case "work":
 return [
 "Thanks for reaching out. I’d prefer to keep this work-focused.",
 "I appreciate it, but I’d rather keep this professional.",
 "Thank you, but I’m more comfortable keeping this work-related.",
 "I’d prefer to keep our communication professional.",
 "Thanks, but I’d rather keep this focused on work."
 ];

 default:
 return [
 "What do you mean by that?",
 "Can you be more specific?",
 "Say that a little more clearly.",
 "Tell me what you mean directly.",
 "I’m listening, so be clear with me."
 ];
 }
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server Running V1005");
});

app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);
 const previousReplies = Array.isArray(req.body?.previousReplies)
 ? req.body.previousReplies.map((x) => clean(x)).filter(Boolean)
 : [];

 if (!message) {
 return res.json({ replies: fallbackReplies(category) });
 }

 const previousSection =
 previousReplies.length > 0
 ? `
AVOID THESE PREVIOUS REPLIES:
${previousReplies.map((r) => `- ${r}`).join("\n")}
- Do not repeat them
- Do not make minor rewrites of them
- Generate clearly different options
`.trim()
 : "";

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.95,
 messages: [
 {
 role: "system",
 content: `
Return ONLY a plain JSON array of EXACTLY 5 distinct replies.

GLOBAL RULES:
- Output must be a JSON array only
- No markdown
- No explanation
- No labels
- No bullet points
- No numbering
- Do not return an object
- Must contain EXACTLY 5 strings
- Each reply must be different
- Every reply must be something the user can send immediately
- Never write as a coach, therapist, counselor, mediator, or outside observer
- No therapy tone
- No coaching tone
- No advice
- No analysis
- No narration
- Keep replies natural, direct, realistic, and sendable
- Avoid generic filler
- Do not use quotation marks around replies unless naturally required

${categoryRules(category)}

${previousSection}
`.trim()
 },
 {
 role: "user",
 content: `
Message:
${message}

Generate 5 different reply options now.
`.trim()
 }
 ]
 });

 const text = completion.choices?.[0]?.message?.content || "";
 const parsed = parseReplies(text);
 let replies = enforceReplies(category, parsed, previousReplies);

 if (!replies || replies.length < 5) {
 const fallback = fallbackReplies(category);
 const merged = removeNearDuplicates([...replies, ...fallback], previousReplies);
 replies = merged.slice(0, 5);
 }

 if (!replies || replies.length < 5) {
 replies = fallbackReplies(category);
 }

 return res.json({ replies });
 } catch (error) {
 console.error("ERROR:", error);
 const category = clean(req.body?.category).toLowerCase();
 return res.json({ replies: fallbackReplies(category) });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
