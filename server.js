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

function enforceReplies(category, replies) {
 const cleaned = replies
 .map((x) => clean(x))
 .filter(Boolean)
 .slice(0, 5);

 return cleaned;
}

function categoryRules(category) {
 switch (category) {
 case "family":
 return `
FAMILY:
- Write only as a direct text message the user can send right now
- Address the other person directly (no "they", "my kids", etc.)
- No therapy tone, no coaching, no advice
- No emotional analysis or commentary
- No explaining feelings like a narrator
- Do not sound like a counselor or mediator
- Keep it natural, grounded, and realistic
- Slight accountability is OK but do NOT over-apologize
- Do NOT sound weak, overly soft, or submissive
- Keep replies 1–2 sentences
- Favor clarity, calm pushback, or direct communication
- Asking for clarification is GOOD when done directly

GOOD STYLE:
- If that's how you feel, then tell me what you mean.
- Don't just say that — explain it.
- If I'm missing something, say it clearly.
- I hear you, but be specific about what you mean.
- If you feel that way, then talk to me directly.
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
 return res.json({
 replies: [
 "What do you mean by that?",
 "If you feel that way, explain it to me.",
 "Say it clearly so I understand.",
 "Don't just leave it like that — explain.",
 "If I'm missing something, tell me directly."
 ]
 });
 }

 const completion = await openai.chat.completions.create({
 model: MODEL,
 temperature: 0.7,
 messages: [
 {
 role: "system",
 content: `
Return ONLY a JSON array of 5 replies.

GLOBAL RULES:
- Each reply must be something the user can send immediately
- No therapist tone
- No coaching tone
- No advice
- No analysis
- No explanations about the situation
- No narration
- No emotional commentary
- No quotation marks
- No JSON wrappers like { "replies": ... }
- Output ONLY raw JSON array

${categoryRules(category)}
`.trim()
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 const text = completion.choices?.[0]?.message?.content || "";
 const parsed = parseReplies(text);

 let replies;

 if (!parsed || parsed.length === 0) {
 replies = [
 "What do you mean by that?",
 "If that's how you feel, explain it to me.",
 "Say it clearly so I understand.",
 "Don't just leave it like that — explain.",
 "If I'm missing something, tell me directly."
 ];
 } else {
 replies = enforceReplies(category, parsed);
 }

 return res.json({ replies });

 } catch (error) {
 console.error("ERROR:", error);

 return res.json({
 replies: [
 "What do you mean by that?",
 "If that's how you feel, explain it to me.",
 "Say it clearly so I understand.",
 "Don't just leave it like that — explain.",
 "If I'm missing something, tell me directly."
 ]
 });
 }
});

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
