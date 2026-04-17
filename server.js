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
 .replace(/^["'`[\],\s]+|["'`[\],\s]+$/g, "")
 .replace(/\s+/g, " ")
 .trim();
}

function dedupeReplies(replies) {
 const seen = new Set();
 const output = [];

 for (const raw of replies || []) {
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

function isDescriptiveInput(message) {
 const lower = message.toLowerCase();

 const descriptiveMarkers = [
 "my mom says",
 "my dad says",
 "my parents say",
 "my boyfriend says",
 "my girlfriend says",
 "my wife says",
 "my husband says",
 "my partner says",
 "my sister says",
 "my brother says",
 "my son says",
 "my daughter says",
 "my child says",
 "my kid says",
 "there's been",
 "there has been",
 "conversations often",
 "you want to",
 "without making things worse",
 "after ",
 "because ",
 "when ",
 "situation",
 "argument",
 "tension"
 ];

 return descriptiveMarkers.some((x) => lower.includes(x));
}

function detectFamilyRole(message) {
 const lower = message.toLowerCase();

 if (
 lower.includes("my mom says") ||
 lower.includes("my dad says") ||
 lower.includes("my parents say") ||
 lower.includes("my father says") ||
 lower.includes("my mother says") ||
 lower.includes("my stepdad says") ||
 lower.includes("my stepmom says")
 ) {
 return "child_to_parent";
 }

 if (
 lower.includes("my son says") ||
 lower.includes("my daughter says") ||
 lower.includes("my kid says") ||
 lower.includes("my child says") ||
 lower.includes("my teen says")
 ) {
 return "parent_to_child";
 }

 if (
 lower.includes("my sister says") ||
 lower.includes("my brother says") ||
 lower.includes("my sibling says") ||
 lower.includes("my aunt says") ||
 lower.includes("my uncle says") ||
 lower.includes("my cousin says")
 ) {
 return "adult_family";
 }

 return "general_family";
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

function familyRoleGuidance(message) {
 const role = detectFamilyRole(message);
 const descriptive = isDescriptiveInput(message);

 if (role === "child_to_parent") {
 return `
FAMILY ROLE: CHILD RESPONDING TO PARENT
- The user is likely responding to a parent or guardian
- Keep replies respectful, grounded, natural, and age-neutral
- Do NOT sound sarcastic, snarky, or rebellious
- Do NOT sound overly submissive either
- Slight self-advocacy is okay
- Good tone = "I hear you / I understand / I'm working on it / I'm trying"
- If the input is descriptive, convert it into a direct reply the child could actually send
- Avoid therapy language
- Avoid fake polished corporate phrases like "I appreciate the feedback" unless it sounds truly natural
`;
 }

 if (role === "parent_to_child") {
 return `
FAMILY ROLE: PARENT RESPONDING TO CHILD
- The user is likely responding to a child or teen
- Keep calm parental authority
- Do NOT make the parent sound weak, unsure, overly apologetic, or therapist-like
- Do NOT sound harsh or controlling
- Good tone = calm, clear, steady, direct
- If the input is descriptive, convert it into a direct reply the parent could actually send
`;
 }

 if (role === "adult_family") {
 return `
FAMILY ROLE: ADULT FAMILY MEMBER TO ADULT FAMILY MEMBER
- Keep replies direct, calm, human, and realistic
- No therapy tone
- No coaching tone
- If the input is descriptive, convert it into a direct reply the user could send
`;
 }

 if (descriptive) {
 return `
FAMILY ROLE: GENERAL FAMILY DESCRIPTION INPUT
- The input sounds like a situation description, not exact quoted words
- Convert the situation into a direct reply the user can actually send
- Do NOT answer the description itself
- Do NOT give advice about the situation
- Return only sendable replies
`;
 }

 return `
FAMILY ROLE: GENERAL FAMILY
- Keep replies calm, grounded, natural, and sendable
`;
}

function categoryRules(category, message, context) {
 const familySubmode = detectFamilySubmode(message);
 const familyGuidance = familyRoleGuidance(message);
 const descriptive = isDescriptiveInput(message);

 switch (category) {
 case "family":
 return `
FAMILY MODE:
- Write only direct text messages the user can send right now
- No advice
- No analysis
- No therapist tone
- No coaching
- No emotional commentary from the outside
- No generic validation language
- Replies must sound like a real person texting a family member
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel varied but stay inside the same family tone
- Keep the tone category-driven, not random
- Avoid sudden tone swings between soft therapy and sharp confrontation
- Do NOT use phrases like:
 "it sounds like you're feeling"
 "you must be feeling"
 "help me understand your perspective"
 "your feelings are valid"
 "safe space"
 "let's process this"
 "let's unpack that"
- Do NOT return fake-polished phrases that sound HR-like or robotic
${familyGuidance}
${
 familySubmode === "high_conflict"
 ? `
HIGH CONFLICT FAMILY SUBMODE:
- Stay firm, calm, and direct
- Do not sound passive
- Do not sound needy
- Keep dignity and control
`
 : `
STANDARD FAMILY SUBMODE:
- Slight warmth is okay
- Calmness matters more than softness
`
}
${
 descriptive
 ? `
DESCRIPTION INPUT RULE:
- The input may describe the situation instead of quoting exact words
- Convert it into direct replies the user could actually send
- Never reply as if you are speaking about "the user"
`
 : ""
}
GOOD FAMILY TONE EXAMPLES:
- I hear you. I'm taking it seriously.
- I understand why you're saying that, and I'm working on it.
- I know this matters, and I want to do better here.
- I get what you're saying. Tell me clearly what needs to change.
`;
 case "relationship":
 return `
RELATIONSHIP MODE:
- Write only direct text messages the user can send right now
- Keep it emotionally real, natural, and sendable
- No therapy tone
- No coaching
- No advice
- No analysis
- Accountability is good when it fits
- Do not swing between overly apologetic and cold
- Most replies should be 1 to 2 sentences
- Each set of 5 should be varied but still feel like the same category
- Avoid robotic lines like "I appreciate you bringing this up" unless it feels truly natural
- Avoid over-therapeutic phrasing like "I want to understand your perspective better" unless the input truly calls for it
- Prefer grounded relationship language
GOOD STYLE:
- I hear what you're saying, and I want to fix this.
- I get why you're upset, and I need to take that seriously.
- I don't want this to keep going in the wrong direction.
- Tell me what feels missing so I can show up better.
`;
 case "friendship":
 return `
FRIENDSHIP MODE:
- Write only direct text messages the user can send right now
- Keep replies realistic, socially normal, and natural
- No therapy tone
- No coaching
- No advice
- No analysis
- Keep the tone mature and clear
- Most replies should be 1 to 2 sentences
- Each set of 5 should feel meaningfully different but still coherent
`;
 case "dating":
 return `
DATING MODE:
- Write only direct text messages the user can send right now
- Keep replies natural, casual, attractive, and easy to reply to
- No therapy tone
- No coaching
- No advice
- No analysis
- Do NOT sound cheesy, thirsty, robotic, corny, or performative
- Do NOT jump too far ahead emotionally
- Do NOT force "meet up" language unless the input clearly supports moving toward a date
- Keep it confident but relaxed
- Most replies should be 1 to 2 sentences
- Each set of 5 should be varied but clearly still dating replies
GOOD STYLE:
- I'd be down to plan something soon if you are.
- I've been meaning to see you again.
- We should do something casual this week.
- I'd like to keep this moving and see where it goes.
`;
 case "work":
 return `
WORK MODE:
- Write only direct messages the user can send right now
- Keep it professional, respectful, neutral, and work-focused
- No therapy tone
- No coaching
- No advice
- No analysis
- If the input is personal, flirtatious, or suggests social/romantic contact outside work, every reply must keep a professional boundary
- Never suggest another time for drinks, hanging out, dinner, or personal contact
- Never reciprocate compliments about appearance or attraction
- Keep replies brief and clear
- Most replies should be 1 to 2 sentences
GOOD STYLE:
- I'd prefer to keep this professional.
- Thanks, but I'd rather keep our relationship work-focused.
- I appreciate it, but I want to keep things professional.
`;
 default:
 return `
GENERAL MODE:
- Write only direct text messages the user can send right now
- No advice
- No analysis
- No therapy tone
- Keep replies natural and sendable
`;
 }
}

function enforceReplies(category, replies, previousReplies = [], message = "") {
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
 "safe space",
 "let's unpack",
 "let’s unpack",
 "let's process",
 "let’s process",
 "help me understand your perspective",
 "understand your perspective better",
 "see your perspective",
 "their perspective"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedGlobalPhrases.some((phrase) => lower.includes(phrase));
 });

 if (category === "family") {
 const role = detectFamilyRole(message);

 const bannedFamilyPhrases = [
 "i appreciate the feedback",
 "thanks for the heads up",
 "i'll definitely take that into consideration",
 "i’ll definitely take that into consideration",
 "what you need me to understand right now",
 "i can see how i may not have been",
 "fully aware",
 "you need a safe space",
 "open conversation could help"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedFamilyPhrases.some((phrase) => lower.includes(phrase));
 });

 if (role === "child_to_parent") {
 const bannedChildToParent = [
 "i appreciate the feedback",
 "thanks for the heads up",
 "i’ll put in more effort",
 "i'll put in more effort"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedChildToParent.some((phrase) => lower.includes(phrase));
 });
 }

 if (role === "parent_to_child") {
 const bannedParentToChild = [
 "i'm trying my best",
 "i’m trying my best",
 "it's frustrating to hear that",
 "it’s frustrating to hear that"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedParentToChild.some((phrase) => lower.includes(phrase));
 });
 }
 }

 if (category === "dating") {
 const bannedDatingPhrases = [
 "take it to the next level",
 "i'm not sure how to read that yet",
 "i’m not sure how to read that yet",
 "okay, now you have my attention"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedDatingPhrases.some((phrase) => lower.includes(phrase));
 });
 }

 if (category === "work") {
 const bannedWorkPhrases = [
 "another time",
 "reschedule",
 "let's do it soon",
 "let’s do it soon",
 "i'd love to join",
 "i’d love to join",
 "that sounds great"
 ];

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !bannedWorkPhrases.some((phrase) => lower.includes(phrase));
 });
 }

 cleaned = removeNearDuplicates(cleaned, previousReplies);

 return cleaned.slice(0, 5);
}

function fallbackReplies(category, message = "") {
 const familyRole = detectFamilyRole(message);

 switch (category) {
 case "family":
 if (familyRole === "child_to_parent") {
 return [
 "I hear you. I'm working on it and taking it seriously.",
 "I understand why you're saying that, and I'm trying to do better.",
 "I know this matters, and I'm putting more focus on it.",
 "I get what you're saying. I'm not ignoring it.",
 "I'm taking it seriously and working on improving."
 ];
 }

 if (familyRole === "parent_to_child") {
 return [
 "I'm saying this because it matters, not to put you down.",
 "I want us to deal with this calmly and clearly.",
 "I'm not trying to attack you. I want us to fix it.",
 "Let's talk about what's actually going wrong here.",
 "I need us to handle this directly without making it worse."
 ];
 }

 return [
 "I hear what you're saying, and I want to deal with it clearly.",
 "I get that this matters, and I don't want to make it worse.",
 "Let's talk about what actually needs to change here.",
 "I understand why you're bringing it up, and I want to handle it better.",
 "Tell me clearly what the issue is so we can deal with it."
 ];
 case "relationship":
 return [
 "I hear what you're saying, and I want to fix this.",
 "I get why this matters, and I need to take it seriously.",
 "Tell me what feels missing so I can show up better.",
 "I don't want this to keep going in the wrong direction.",
 "I hear you, and I want us to work through it."
 ];
 case "friendship":
 return [
 "If something's off, say it directly so we can deal with it.",
 "I hear you, and I'd rather talk about it clearly.",
 "Let's be honest about what's actually bothering you.",
 "If we're going to fix it, we should say it plainly.",
 "Tell me directly what you mean so we can sort it out."
 ];
 case "dating":
 return [
 "I'd be down to plan something soon if you are.",
 "I've been meaning to see you again.",
 "We should do something casual this week.",
 "I'd like to see where this goes in person.",
 "I'm into the idea of making plans."
 ];
 case "work":
 return [
 "I'd prefer to keep this professional.",
 "Thanks, but I'd rather keep our relationship work-focused.",
 "I appreciate it, but I want to keep things professional.",
 "Let's keep this centered on work.",
 "I'd rather keep our communication professional."
 ];
 default:
 return [
 "Tell me clearly what you mean.",
 "Can you be more specific?",
 "Say that a little more clearly.",
 "Tell me what you're actually getting at.",
 "I hear you. Be direct with me."
 ];
 }
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server V1012");
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
 ? req.body.previousReplies.map((x) => clean(x)).filter(Boolean)
 : [];

 if (!message) {
 return res.json({ replies: fallbackReplies(category, message) });
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

 const contextSection = context
 ? `
APP CONTEXT FROM CLIENT:
${context}
`.trim()
 : "";

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.85,
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
- Every reply must be something the user can send immediately
- No advice
- No analysis
- No narration
- No therapist tone
- No coaching tone
- No generic filler
- Keep replies natural, direct, realistic, and sendable
- The input is either:
 1. exact words said to the user, OR
 2. a short description of the situation
- If the input is a description, convert it into direct reply options the user could actually send
- Do not answer the situation as an outside observer
- Stay consistent with the category tone
- Do not let small wording changes create a totally different tone for the same category situation

${categoryRules(category, message, context)}

${contextSection}

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
 let replies = enforceReplies(category, parsed, previousReplies, message);

 if (!replies || replies.length < 5) {
 const fallback = fallbackReplies(category, message);
 const merged = removeNearDuplicates(
 [...(replies || []), ...fallback],
 previousReplies
 );
 replies = merged.slice(0, 5);
 }

 if (!replies || replies.length < 5) {
 replies = fallbackReplies(category, message).slice(0, 5);
 }

 return res.json({ replies });
 } catch (error) {
 console.error("ERROR:", error);
 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);
 return res.json({ replies: fallbackReplies(category, message) });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
