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

function toArray(value) {
return Array.isArray(value) ? value : [];
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
return parsed.map((x) => clean(x)).filter(Boolean).slice(0, 5);
}
} catch (_) {}

return normalized
.split("\n")
.map((line) =>
line
.replace(/^```(?:json)?/i, "")
.replace(/^\s*[$begin:math:display$$end:math:display$,]+\s*$/g, "")
.replace(/^\s*[-*•\d.)]+\s*/, "")
.replace(/^"+|"+$/g, "")
.trim()
)
.filter(Boolean)
.slice(0, 5);
}

app.get("/", (_req, res) => {
res.send("AI Reply Server Running");
});

app.get("/health", (_req, res) => {
res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
try {
const message = clean(req.body?.message);

if (!message) {
return res.status(400).json({ error: "Missing message" });
}

const completion = await openai.chat.completions.create({
model: MODEL,
temperature: 0.72,
messages: [
{
role: "system",
content: `
You generate text-message replies.

Return ONLY a JSON array of 5 strings.

GLOBAL RULES:
- Sound like a real person texting
- Natural, clear, and easy to send
- Usually 1 to 2 sentences
- No corporate, HR, or email tone
- No therapy tone
- No quotation marks
- No emojis unless very natural
- Each reply should feel slightly different
- The reply should sound polished enough that the user feels helped, but still realistic and sendable

WORK RULES:
- If the message is clearly work-related, keep it professional, respectful, and human
- Do not sound stiff, robotic, or overly formal
- If the message is about work criticism or lateness, acknowledge it, take responsibility, and communicate improvement
- If the message involves a personal or romantic invitation at work, politely decline and keep things professional

Good work tone examples:
- I understand, and I’ll do a better job being on time.
- You’re right to bring it up, and I’ll make sure I improve.
- I appreciate you asking, but I’d rather keep things professional.

FAMILY RULES:
- If the message is clearly about family, write the reply as something the user would actually send directly to their family member
- Use first-person language like I, me, and my
- Do not describe the situation from the outside
- Do not sound like a therapist, mediator, or counselor
- Do not sound overly formal
- Keep the tone calm, emotionally aware, and human
- Replies should feel thoughtful, mature, and realistic
- Make them a little more developed, not too short or abrupt
- Usually 1 to 2 sentences, with enough detail to feel meaningful
- If the family message is critical or hurtful, respond directly, clearly, and respectfully
- The reply should sound like something the user wishes they had the words to say
- Do not joke, do not use slang like chill mode, and do not minimize the situation
- Do not make the reply sound weak, helpless, or childish
- Do not use detached phrases like "I can see why she might feel that way" unless it sounds truly natural in a text

Good family tone examples:
- Sorry Mom, I know I’ve been slacking lately, and I’m going to do better.
- I know I haven’t been helping the way I should, and I understand why you’re frustrated.
- You’re right to call me out on it, and I’ll make more of an effort going forward.
- Sorry, I know it hasn’t looked great lately, but I do hear what you’re saying and I’m going to work on it.
- I know I’ve been off lately, and I understand why that’s upsetting. I’ll do better.

RELATIONSHIP RULES:
- If the message is clearly about a romantic relationship, write the reply as something the user would actually send directly to their partner
- Use first-person language like I, me, and my
- The reply must sound emotionally clear, accountable, and mature
- Do not sound vague, passive, evasive, or mixed
- Do not soften accountability with excuses
- Do not sound like a therapist, coach, or mediator
- Do not sound cold, robotic, or overly formal
- Make the reply a little more developed, not too short or abrupt
- Usually 1 to 2 sentences, with enough detail to feel meaningful
- If the partner is hurt, critical, disappointed, or calling something out, respond directly and clearly
- If accountability is appropriate, own it clearly
- The reply should sound like the user finally said the right thing instead of dodging the issue
- Do not joke, flirt, deflect, or turn the issue into banter
- Do not give mixed signals
- Do not sound half-in and half-out
- Avoid weak filler like "if you feel that way" or "that wasn't my intention" unless it is followed by real accountability

Good relationship tone examples:
- You’re right, and I haven’t been showing up the way I should. I’m sorry, and I want to do better.
- I know I’ve been falling short, and I understand why you’re upset. You deserved more from me.
- You’re not wrong, and I need to take responsibility for how I’ve been acting.
- I understand why this hurt you, and I’m sorry. I know I need to be better about this.
- I know I haven’t been putting in enough effort, and that’s on me. I don’t want to keep brushing it off.

If a message is neither clearly work-related, clearly family-related, nor clearly relationship-related:
- Still keep the tone natural, thoughtful, and sendable
- Avoid robotic or overly obvious wording

Return ONLY a JSON array of 5 strings.
`.trim()
},
{
role: "user",
content: message
}
]
});

const text = completion.choices?.[0]?.message?.content || "";
const replies = parseReplies(text);

if (!replies.length) {
return res.status(500).json({ error: "No replies generated" });
}

return res.json({ replies });
} catch (error) {
console.error("Reply error:", error);
return res.status(500).json({
error: "Failed to generate replies"
});
}
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
