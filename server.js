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

function detectSubmode(category, message) {
 const lower = clean(message).toLowerCase();

 const greetingPatterns = [
 "hey",
 "hi",
 "hello",
 "morning",
 "good morning",
 "goodnight",
 "good night",
 "happy monday",
 "happy tuesday",
 "happy wednesday",
 "happy thursday",
 "happy friday",
 "happy saturday",
 "happy sunday",
 "how are you",
 "how’s your day",
 "hows your day",
 "what's up",
 "whats up",
 "yo",
 "gm"
 ];

 if (category === "dating") {
 if (greetingPatterns.some((p) => lower === p || lower.startsWith(p))) {
 return "greeting";
 }

 const ambiguousMessages = [
 "hard to read",
 "mixed signals",
 "not sure what you mean",
 "confused",
 "kinda hard to read",
 "idk"
 ];

 if (ambiguousMessages.some((p) => lower.includes(p))) {
 return "ambiguous";
 }

 return "standard";
 }

 if (category === "family") {
 if (greetingPatterns.some((p) => lower === p || lower.startsWith(p))) {
 return "greeting";
 }

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
 "you dont respect me",
 "you always assume the worst about me"
 ];

 if (highConflictTriggers.some((p) => lower.includes(p))) {
 return "high_conflict";
 }

 const directiveTriggers = [
 "you need to",
 "you should",
 "you have to",
 "start helping",
 "do your share",
 "help out with house chores",
 "you need to help out",
 "pitch in more",
 "do more around the house"
 ];

 if (directiveTriggers.some((p) => lower.includes(p))) {
 return "directive";
 }

 return "standard";
 }

 return "standard";
}

function getGlobalRules() {
 return `
Return ONLY a plain JSON array of EXACTLY 5 strings.

GLOBAL FORMAT RULES:
- Output must be a JSON array only
- No markdown
- No explanation
- No labels
- No bullet points
- No numbering
- Do not return an object
- Each reply must be something the user can send immediately
- Each reply must be distinct
- Keep replies natural, direct, and sendable
- Avoid generic filler
- Do not use quotation marks around replies unless naturally required
- The input message is ALWAYS what the other person said to the user
- The replies MUST always be from the user's perspective responding back
- NEVER repeat the same tone or direction as the input
- NEVER sound like you are giving instructions to the user
- If the input is a command, complaint, criticism, or greeting, the reply must respond to it and not restate it
`.trim();
}

function getCategoryRules(category, submode) {
 if (category === "family") {
 if (submode === "greeting") {
 return `
FAMILY GREETING MODE:
- Treat the message as a simple family greeting or casual check-in
- Replies should be warm, natural, and easy to send
- Do NOT sound suspicious, intense, conflicted, or overly emotional
- Do NOT use conflict-resolution language
- Do NOT ask "what do you mean"
- Keep it light, normal, and human
- Most replies should be 1 sentence, sometimes 2
GOOD STYLE:
- Good morning to you too.
- Morning, hope your day’s off to a good start.
- Good morning, hope today goes smoothly for you.
- Morning, how’s your day looking so far?
- Good morning — hope you slept well.
`;
 }

 if (submode === "high_conflict") {
 return `
FAMILY HIGH CONFLICT MODE:
- Write only as a direct text message the user can send right now
- The reply MUST be written directly to the other person as if texting them
- ALWAYS speak directly using "you"
- NEVER refer to them as "she", "he", "they", "her", "him", or by role like "my sister", "my mom", or "my dad"
- Do NOT ask the user questions
- Do NOT sound like a therapist, coach, counselor, mediator, or outside observer
- No advice
- No analysis
- No emotional commentary from the outside
- Do NOT use reflective therapy phrasing
- Do NOT make the user sound weak, needy, overly apologetic, or passive
- Replies should de-escalate, but be firmer and less soft
- Clarification should sound direct
- Emotional honesty should be brief and grounded
- Repair-oriented replies should keep dignity and calm authority
- Most replies should be 1 to 2 full sentences
- The 5 replies should feel intentionally different:
 1. clarification
 2. emotional honesty
 3. light accountability
 4. calm firmness
 5. repair-oriented directness
GOOD STYLE:
- If that's how you feel, then tell me what you mean.
- Don't just say that and leave it there. Tell me what you're talking about.
- If you think I'm missing something, then say it clearly.
- I hear what you're saying, but I need you to be specific.
- If you're frustrated with me, then say it plainly.
`;
 }

 if (submode === "directive") {
 return `
FAMILY DIRECTIVE MODE:
- The other person is giving instructions, criticism, or commands
- Reply from the user's perspective
- Do NOT mirror the same authority tone back
- Respond to the complaint instead of restating it
- ALWAYS speak directly using "you"
- NEVER refer to them as "she", "he", "they", "her", "him", or by role
- No therapy tone
- No coaching
- No advice
- No analysis
- Keep the tone calm, grounded, and realistic
- Slight accountability is okay when appropriate
- Most replies should be 1 to 2 sentences
- The 5 replies should feel intentionally different:
 1. clarification
 2. emotional honesty
 3. light accountability
 4. calm firmness
 5. repair-oriented directness
GOOD STYLE:
- Alright, then tell me exactly what you want me to handle.
- If you want more from me, then be specific about what needs to get done.
- That’s fair, but tell me clearly what you expect from me.
- If I need to do more, then say exactly where.
- Okay, then tell me what you want me to take care of.
`;
 }

 return `
FAMILY STANDARD MODE:
- Write only as a direct text message the user can send right now
- The reply MUST be written directly to the other person as if texting them
- ALWAYS speak directly using "you"
- NEVER refer to them as "she", "he", "they", "her", "him", or by role like "my sister", "my mom", or "my dad"
- Do NOT ask the user questions
- Do NOT sound like a therapist, coach, counselor, mediator, or outside observer
- No advice
- No analysis
- No emotional commentary from the outside
- Slight accountability is okay when appropriate, but keep it restrained
- Clarification is good, but it must sound direct and natural
- Keep replies calm, grounded, human, and sendable
- Do NOT make every reply soft
- Do NOT make every reply apologetic
- Most replies should be 1 to 2 full sentences
- The 5 replies should feel intentionally different:
 1. clarification
 2. emotional honesty
 3. light accountability
 4. calm firmness
 5. repair-oriented directness
GOOD STYLE:
- If that's how you feel, then tell me what you mean.
- Don't just say that and leave it there. Tell me what you're talking about.
- If you think I'm missing something, then say it clearly.
- I hear what you're saying, but I need you to be specific.
- If you're frustrated with me, then say it plainly.
`;
 }

 if (category === "dating") {
 if (submode === "greeting") {
 return `
DATING GREETING MODE:
- Treat the message as a casual opener, greeting, or light check-in
- Replies should be light, warm, easy, and natural
- Do NOT sound suspicious, confused, or intense
- Do NOT ask "what do you mean"
- Do NOT act like the message is vague drama
- Do NOT be overly flirty
- Keep it smooth, socially normal, and low-pressure
- Good replies should feel like natural texting
- Most replies should be 1 sentence, sometimes 2
GOOD STYLE:
- Good morning to you too.
- Good morning how’s your day going?
- Morning, hope your day’s off to a good start.
- Good morning, you too. Sleep okay?
- Morning — hope today’s treating you kindly already.
`;
 }

 if (submode === "ambiguous") {
 return `
DATING AMBIGUOUS MODE:
- The message is unclear or mixed
- Replies can gently clarify
- Stay natural and attractive
- Do not sound needy or overly serious
- No therapist tone
- No coaching
- No advice
- Keep it casual and textable
`;
 }

 return `
DATING STANDARD MODE:
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
 }

 if (category === "relationship") {
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
 }

 if (category === "friendship") {
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
 }

 if (category === "work") {
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
 }

 return `
GENERAL MODE:
- Write direct, natural, sendable replies
- No therapy tone
- No advice
- No analysis
`;
}

function getCategoryBannedPhrases(category, submode) {
 const global = [
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

 if (category === "family") {
 if (submode === "greeting") {
 return [
 ...global,
 "if that's how you feel",
 "don't just leave it at that",
 "tell me what you mean",
 "i need you to be specific",
 "if you're frustrated"
 ];
 }

 return [
 ...global,
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
 "open conversation could help",
 "my sister",
 "my mom",
 "my dad",
 "she ",
 "he ",
 "they ",
 " her ",
 " him "
 ];
 }

 if (category === "dating" && submode === "greeting") {
 return [
 ...global,
 "what did you mean by that",
 "tell me more",
 "i’m not sure how to read that",
 "i'm not sure how to read that",
 "now you have my attention",
 "fair enough"
 ];
 }

 return global;
}

function postProcessReplies(category, submode, replies, previousReplies = []) {
 const banned = getCategoryBannedPhrases(category, submode);
 let cleaned = dedupeReplies(replies);

 cleaned = cleaned.filter((reply) => {
 const lower = reply.toLowerCase();
 return !banned.some((phrase) => lower.includes(phrase));
 });

 cleaned = removeNearDuplicates(cleaned, previousReplies);

 return cleaned.slice(0, 5);
}

function getCategoryFallbackReplies(category, submode) {
 if (category === "family" && submode === "greeting") {
 return [
 "Good morning to you too.",
 "Morning, hope your day’s off to a good start.",
 "Good morning, hope today goes smoothly for you.",
 "Morning, how’s your day looking so far?",
 "Good morning — hope you slept well."
 ];
 }

 if (category === "dating" && submode === "greeting") {
 return [
 "Good morning to you too.",
 "Good morning how’s your day going?",
 "Morning, hope your day’s off to a good start.",
 "Good morning, you too. Sleep okay?",
 "Morning — hope today’s treating you kindly already."
 ];
 }

 if (category === "family" && submode === "directive") {
 return [
 "Alright, then tell me exactly what you want me to handle.",
 "If you want more from me, then be specific about what needs to get done.",
 "That’s fair, but tell me clearly what you expect from me.",
 "If I need to do more, then say exactly where.",
 "Okay, then tell me what you want me to take care of."
 ];
 }

 if (category === "family") {
 return [
 "If that's how you feel, then tell me what you mean.",
 "Don't just leave it at that. Tell me clearly what you're talking about.",
 "If you think I'm missing something, then say it plainly.",
 "I hear what you're saying, but I need you to be specific.",
 "If you're frustrated with me, then be direct about it."
 ];
 }

 if (category === "relationship") {
 return [
 "I hear what you're saying, and I need to take that seriously.",
 "You're right to bring it up, and I know I need to do better here.",
 "I'm not trying to dodge it. I know this matters.",
 "I understand why you're upset, and I need to own my part in it.",
 "I hear you, and I know I need to show up better."
 ];
 }

 if (category === "friendship") {
 return [
 "If something's off, just say it directly.",
 "I get that you're upset, but I'd rather talk about it clearly.",
 "That didn't sit right with me, and I think we should be honest about it.",
 "If we're going to fix it, then let's actually talk about it.",
 "Say what you mean directly so we can deal with it."
 ];
 }

 if (category === "dating") {
 return [
 "Hey, good to hear from you.",
 "Hi how’s your day going?",
 "Hey, hope your day’s going well so far.",
 "Nice to hear from you — what are you up to today?",
 "Hey, how’s everything going on your end?"
 ];
 }

 if (category === "work") {
 return [
 "Thanks for reaching out. I'd prefer to keep this work-focused.",
 "I appreciate it, but I'd rather keep this professional.",
 "Thank you, but I'm more comfortable keeping this work-related.",
 "I'd prefer to keep our communication professional.",
 "Thanks, but I'd rather keep this focused on work."
 ];
 }

 return [
 "What do you mean by that?",
 "Can you be more specific?",
 "Say that a little more clearly.",
 "Tell me what you mean directly.",
 "I'm listening, so be clear with me."
 ];
}

app.get("/", (_req, res) => {
 res.send("AI Reply Server FINAL");
});

app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
 const message = clean(req.body?.message);
 const previousReplies = Array.isArray(req.body?.previousReplies)
 ? req.body.previousReplies.map(clean).filter(Boolean)
 : [];

 if (!message) {
 const submode = detectSubmode(category, "");
 return res.json({
 replies: getCategoryFallbackReplies(category, submode)
 });
 }

 const submode = detectSubmode(category, message);

 const previousSection =
 previousReplies.length > 0
 ? `
PREVIOUS REPLIES TO AVOID:
${previousReplies.map((r) => `- ${r}`).join("\n")}
- Do not repeat them
- Do not make minor rewrites of them
- Generate clearly different options
`.trim()
 : "PREVIOUS REPLIES TO AVOID:\nNone";

 const systemPrompt = `
${getGlobalRules()}

${getCategoryRules(category, submode)}

${previousSection}
`.trim();

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.55,
 messages: [
 { role: "system", content: systemPrompt },
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

 let replies = postProcessReplies(
 category,
 submode,
 parsed,
 previousReplies
 );

 if (replies.length < 5) {
 const fallback = getCategoryFallbackReplies(category, submode);
 replies = postProcessReplies(
 category,
 submode,
 [...replies, ...fallback],
 previousReplies
 );
 }

 if (replies.length < 5) {
 replies = getCategoryFallbackReplies(category, submode);
 }

 return res.json({ replies });
 } catch (error) {
 console.error("ERROR:", error);
 const category = clean(req.body?.category).toLowerCase();
 const submode = detectSubmode(category, "");
 return res.json({
 replies: getCategoryFallbackReplies(category, submode)
 });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
