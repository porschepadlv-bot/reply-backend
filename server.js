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
 return parsed.map((x) => clean(x)).filter(Boolean).slice(0, 5);
 }

 if (parsed && Array.isArray(parsed.replies)) {
 return parsed.replies.map((x) => clean(x)).filter(Boolean).slice(0, 5);
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
 .replace(/",?\s*$/g, "")
 .trim()
 )
 .filter(Boolean)
 .slice(0, 5);
}

function categoryRules(category) {
 switch (category) {
 case "dating":
 return `
DATING RULES:
- If the message is clearly about early dating or talking stages, write the reply as something the user would actually text back
- Keep the tone natural, casual, low-pressure, and easy to respond to
- Show interest without sounding flirty, thirsty, overly forward, romantic, or suggestive
- Do not escalate the conversation too quickly
- Do not suggest hanging out, meeting up, coming over, or doing an activity unless the other person's message clearly and directly invites that
- Do not turn simple conversation like boredom or small talk into an invitation
- It is OK to include a light, natural follow-up question to keep the conversation going
- Follow-up questions should feel casual and relevant, not forced or strategic
- Do not ask intense, personal, or overly direct questions
- Do not stack multiple questions
- Do not sound smooth, performative, cheesy, or too polished
- Do not sound robotic, overly formal, or like a therapist
- Keep replies realistic, grounded, and textable
- Usually 1 to 2 sentences
- Write only as a direct sendable reply to the other person involved

Good dating tone examples:
- Same here, today’s been kind of slow. What have you been up to?
- Honestly same, I’ve just been taking it easy. You do anything fun today?
- Bored too, I’ve just been relaxing. How’s your day been?
- Yeah, it’s been a lazy day on my end too. Anything interesting happen on your side?
`;

 case "relationship":
 return `
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
- Write only as a direct sendable reply to the other person involved, never as a response to the user
- Do not comfort the user or speak as an outside observer

Good relationship tone examples:
- You’re right, and I haven’t been showing up the way I should. I’m sorry, and I want to do better.
- I know I’ve been falling short, and I understand why you’re upset. You deserved more from me.
- You’re not wrong, and I need to take responsibility for how I’ve been acting.
- I understand why this hurt you, and I’m sorry. I know I need to be better about this.
- I know I haven’t been putting in enough effort, and that’s on me. I don’t want to keep brushing it off.
`;

 case "friendship":
 return `
FRIENDSHIP RULES:
- If the message is clearly about friendship, keep the tone balanced, clear, and natural
- Do not make it overly emotional, overly apologetic, or too heavy
- Do not make it sound romantic or like a relationship conversation
- Do not make it aggressive, defensive, or rude
- Do not default to apologizing unless the situation clearly calls for it
- Do not default to setting a hard boundary unless the message clearly calls for it
- Sound calm, socially aware, and emotionally in control
- The user should sound self-respecting and reasonable
- Acknowledge the point when appropriate, but keep it measured
- If accountability is needed, keep it simple and direct without overdoing it
- If there is disagreement, express it calmly and fairly
- Keep replies practical, realistic, and easy to send
- Avoid therapy language, deep emotional processing, or overly polished apology wording
- Do not sound dramatic or overly serious unless the situation clearly calls for it
- Do not comfort the user or speak as an outside observer
- Write only as a direct sendable reply to the other person involved, never as a response to the user

Good friendship tone examples:
- I hear what you’re saying, and I’ll be more mindful of that.
- That’s fair, I can see how it came across that way.
- I get where you’re coming from, and I’ll handle that better.
- I understand your point, even if that wasn’t my intention.
- I hear you, but I don’t think that’s the full picture either.
- I’m open to talking about it, I just don’t want it to turn into something bigger than it needs to be.
`;

 case "family":
 return `
FAMILY RULES:
- If the message is clearly about family, write the reply as something the user would actually send directly to their family member
- Use first-person language like I, me, and my
- Do not describe the situation from the outside
- Do not sound like a therapist, mediator, counselor, or supportive friend
- Do not comfort the user
- Do not say things like "I'm sorry you're feeling this way", "that sounds hurtful", or "I'm here for you"
- Do not turn the reply into emotional support
- Keep the tone calm, emotionally aware, and human
- Replies should feel thoughtful, mature, and realistic
- Make them a little more developed, not too short or abrupt
- Usually 1 to 2 sentences, with enough detail to feel meaningful
- If the family message is critical or hurtful, respond directly, clearly, and respectfully
- The reply should sound like something the user wishes they had the words to say
- Do not joke, do not use slang like chill mode, and do not minimize the situation
- Do not make the reply sound weak, helpless, or childish
- Do not use detached phrases like "I can see why they might feel that way" unless it sounds truly natural in a direct text
- For vague inputs like "My cousins don't like me", generate replies directed to the cousins, not replies directed to the user

Good family tone examples:
- I’ve felt some distance from you lately, and I’d rather clear it up than keep pretending everything is fine.
- If there’s an issue with me, I’d rather hear it directly so we can address it honestly.
- I don’t want there to be weird tension between us, so I’m being direct about it.
- If I’ve done something to create distance, I’m open to talking about it.
- I’ve noticed things feel off between us, and I’d rather address it than leave it hanging.
- Sorry Mom, I know I’ve been slacking lately, and I’m going to do better.
- I know I haven’t been helping the way I should, and I understand why you’re frustrated.
- You’re right to call me out on it, and I’ll make more of an effort going forward.
`;

 case "work":
 return `
WORK RULES:
- If the message is clearly work-related, keep it professional, respectful, and human
- Do not sound stiff, robotic, or overly formal
- If the message is about work criticism or lateness, acknowledge it, take responsibility, and communicate improvement
- If the message involves a personal or romantic invitation at work, politely decline and keep things professional
- Write only as a direct sendable reply to the other person involved, never as a response to the user
- Do not comfort the user or speak as an outside observer

Good work tone examples:
- I understand, and I’ll do a better job being on time.
- You’re right to bring it up, and I’ll make sure I improve.
- I appreciate you asking, but I’d rather keep things professional.
`;

 default:
 return `
GENERAL RULES:
- Keep the reply natural, clear, and easy to send
- Sound like a real person texting
- No therapy tone
- No advice tone
- No analysis
`;
 }
}


app.get("/", (_req, res) => {
res.send("AI Reply Server Running V999 FAMILY RESET");
});app.get("/health", (_req, res) => {
 res.json({ ok: true, model: MODEL });
});

app.post("/reply", async (req, res) => {
 try {
 const category = clean(req.body?.category).toLowerCase();
 console.log("CATEGORY RECEIVED:", category);
 const message = clean(req.body?.message);
 const previousReplies = Array.isArray(req.body?.previousReplies)
 ? req.body.previousReplies.map((x) => clean(x)).filter(Boolean).slice(0, 20)
 : [];

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
- The output must always be a message the user could send to the other person involved, never a message back to the user
- You generate replies the user can directly send to another person
- Never reply to the user as a coach, therapist, counselor, friend, or support person
- Never comfort the user
- Never validate the user's feelings from the outside
- Never say things like "I'm sorry you're feeling this way", "that sounds hurtful", "I'm here for you", "you deserve better", or "let’s talk about it"
- Never describe the situation from an outside observer perspective
- Always write as if the user is speaking directly to the other person involved
- Use first-person language like I, me, and my when appropriate
- Every reply must sound like an actual text the user could send right now
- No therapy tone
- No advice tone
- No analysis
- No emotional commentary about the situation
- No supportive listener language
- Sound like a real person texting
- Natural, clear, and easy to send
- Usually 1 to 2 sentences
- No corporate, HR, or email tone
- No quotation marks
- No emojis unless very natural
- Each reply should feel slightly different
- The reply should sound polished enough that the user feels helped, but still realistic and sendable

${categoryRules(category)}

PREVIOUS REPLIES TO AVOID REPEATING:
${previousReplies.length ? previousReplies.map((x) => `- ${x}`).join("\n") : "- none"}

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
const parsedReplies = parseReplies(text);
const replies = enforceReplies(category, parsedReplies, message);

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
