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

 return dedupeReplies(
 normalized
 .split("\n")
 .map((line) =>
 line
 .replace(/^```(?:json)?/i, "")
 .replace(/^\s*[-*•\d.)]+\s*/, "")
 .trim()
 )
 );
}

function removeNearDuplicates(replies, previousReplies = []) {
 const prior = new Set(
 previousReplies.map((x) => normalizeReply(x).toLowerCase())
 );
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

function detectFamilySubmode(message) {
 const lower = message.toLowerCase();

 const highConflictTriggers = [
 "i don't want to come home anymore",
 "i dont want to come home anymore",
 "i'm done explaining myself",
 "im done explaining myself",
 "you don't understand anything",
 "you dont understand anything",
 "you act like i'm a problem",
 "you act like im a problem",
 "i don't trust you anymore",
 "i dont trust you anymore",
 "leave me alone",
 "you embarrassed me",
 "you never listen to me",
 "you don't respect me",
 "you dont respect me"
 ];

 if (highConflictTriggers.some((p) => lower.includes(p))) {
 return "high_conflict";
 }

 return "standard";
}

function enforceReplies(category, replies, previousReplies = []) {
 let cleaned = dedupeReplies(replies);

 const bannedGlobalPhrases = [
 "it sounds like",
 "you’re feeling",
 "you're feeling",
 "you are feeling",
 "you must be feeling",
 "that must feel",
 "your feelings are valid",
 "i want to validate",
 "have you tried",
 "maybe you could",
 "communication can be tricky",
 "i totally understand",
 "i know how that feels",
 "i can understand you're feeling",
 "i can understand you’re feeling",
 "i understand you're feeling",
 "i understand you’re feeling",
 "help me understand their perspective",
 "their perspective",
 "see their perspective"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedGlobalPhrases.some((phrase) => lower.includes(phrase));
 });

 if (category === "family") {
 const bannedFamilyPhrases = [
 "i'm sorry to hear that",
 "i’m sorry to hear that",
 "help me see",
 "connect better",
 "let's focus on",
 "let’s focus on",
 "what you need me to understand right now",
 "i can see how i may not have been",
 "fully aware",
 "really alone in this",
 "how you’re feeling",
 "how you're feeling",
 "how they feel",
 "i care about how you feel",
 "i care about how they feel",
 "you need a safe space",
 "open conversation could help"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedFamilyPhrases.some((phrase) => lower.includes(phrase));
 });
 }

 cleaned = removeNearDuplicates(cleaned, previousReplies);

 return cleaned.slice(0, 5);
}

function categoryRules(category, message) {
 const familySubmode = detectFamilySubmode(message);

 switch (category) {
 case "family":
 return `
FAMILY MODE:
- Write only as a direct text message the user can send right now
- The reply must be addressed directly to the family member
- The reply MUST be written directly to the other person as if texting them
- NEVER refer to them as "she", "he", "they", "her", "him", or by role like "my sister", "my mom", etc.
- ALWAYS speak directly using "you"
- If the reply sounds like it is describing them instead of talking to them, it is wrong
- Do NOT ask the user questions
- Do NOT sound like a therapist, coach, counselor, mediator, or outside observer
- No advice
- No analysis
- No emotional commentary from the outside
- Do NOT use reflective therapy phrasing like:
 "it sounds like you're feeling..."
 "you must be feeling..."
 "that must feel..."
 "i can see how..."
 "let's focus on..."
 "help me understand your perspective"
- For parent-to-child situations, do NOT make the parent sound weak, submissive, overly apologetic, or unsure of their role
- Slight accountability is okay when appropriate, but keep it restrained
- Clarification is good, but it must sound direct and natural
- Keep replies calm, grounded, human, and sendable
- Most replies should be 1 to 2 full sentences
- Each set of 5 must include different functions:
 1. clarification
 2. emotional honesty
 3. light accountability
 4. calm firmness
 5. repair-oriented directness
- Do NOT generate 5 versions of "what do you mean"
- Do NOT make every reply soft
- Do NOT make every reply apologetic
- Keep parental authority calm, not harsh
- The input message is ALWAYS what the other person said to the user
- The replies MUST always be from the user's perspective responding back
- NEVER repeat the same tone or direction as the input
- NEVER sound like you are giving instructions to the user
- If the input is a command, complaint, or criticism, the reply must respond to it and not restate it
- If a reply sounds like it could have been said by the same person who sent the original message, it is wrong

${
 familySubmode === "high_conflict"
 ? `
HIGH CONFLICT FAMILY SUBMODE:
- The other person's message is harsher or more loaded
- Replies should still de-escalate, but they should be firmer and less soft
- Avoid sounding passive
- Avoid sounding needy
- Clarification should sound direct
- Emotional honesty should be brief and grounded
- Repair-oriented reply should still keep dignity and calm authority
`
 : `
STANDARD FAMILY SUBMODE:
- Keep replies calm, clear, and open
- Slight warmth is okay as long as it does not become therapy-like
`
}

GOOD STYLE:
- If that's how you feel, then tell me what you mean.
- Don't just say that and leave it there. Tell me what you're talking about.
- If you think I'm missing something, then say it clearly.
- I hear what you're saying, but I need you to be specific.
- If you're frustrated with me, then say it plainly.
- If I've missed something, then spell it out instead of just throwing that at me.
- That's not easy to hear, so tell me clearly what you mean.
- If that's how you see it, then talk to me directly.
- If I'm getting it wrong, then say exactly where.
- If something I've done is landing badly, then say that clearly.
`;
 case "relationship":
 return `
RELATIONSHIP MODE:
- Write only as a direct text message the user can send right now
- Keep it natural, direct, emotionally real, and sendable
- No therapy tone
- No coaching
- No advice
- No analysis
- Accountability is good when it fits
- Avoid generic filler
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel meaningfully different
`;
 case "friendship":
 return `
FRIENDSHIP MODE:
- Write only as a direct text message the user can send right now
- Keep it natural, direct, realistic, and socially normal
- No therapy tone
- No coaching
- No advice
- No analysis
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel meaningfully different
`;
 case "dating":
 return `
DATING MODE:
- Write only as a direct text message the user can send right now
- Keep it natural, attractive, casual, socially aware, and easy to reply to
- No therapist tone
- No coaching
- No advice
- No analysis
- Do not sound cheesy, thirsty, robotic, or performative
- Keep it realistic and textable
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel meaningfully different
`;
 case "work":
 return `
WORK MODE:
- Write only as a direct message the user can send right now
- Keep it professional, respectful, neutral, and work-focused
- No therapist tone
- No coaching
- No advice
- No analysis
- Never encourage romantic or personal escalation
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel meaningfully different
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
 "I'm not trying to dodge it. I know this matters.",
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
 "I'm not totally sure how to read that yet.",
 "Alright, I'm listening."
 ];
 case "work":
 return [
 "Thanks for reaching out. I'd prefer to keep this work-focused.",
 "I appreciate it, but I'd rather keep this professional.",
 "Thank you, but I'm more comfortable keeping this work-related.",
 "I'd prefer to keep our communication professional.",
 "Thanks, but I'd rather keep this focused on work."
 ];
 default:
 return [
 "What do you mean by that?",
 "Can you be more specific?",
 "Say that a little more clearly.",
 "Tell me what you mean directly.",
 "I'm listening, so be clear with me."
 ];
 }
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server V1008");
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
- Each set of 5 should feel intentionally varied, not like rewrites of one idea
- The input message is ALWAYS what the other person said to the user
- The replies MUST always be from the user's perspective responding back
- NEVER repeat the same tone or direction as the input
- NEVER sound like you are giving instructions to the user
- If the input is a command, complaint, or criticism, the reply must respond to it and not restate it

${categoryRules(category, message)}

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
 const merged = removeNearDuplicates(
 [...replies, ...fallback],
 previousReplies
 );
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
