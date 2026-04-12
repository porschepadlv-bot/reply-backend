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
- Natural,
