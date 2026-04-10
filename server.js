const express = require("express");
const app = express();

app.use(express.json());

app.post("/reply", (req, res) => {
return res.json({
replies: [
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

app.post("/reply", async (req, res) => {
try {
const { message, category, tone, goal } = req.body;

const prompt = `
You are an expert in communication, dating, social intelligence, and emotional awareness.

Someone said:
"${message}"

Category: ${category}
Tone: ${tone}
Goal: ${goal}

Generate 5 high-quality reply options that:
- Sound natural and human (not robotic)
- Match the tone exactly
- Feel confident and emotionally intelligent
- Are short enough to send as a text

Return ONLY a JSON array of strings.
`;

const completion = await openai.chat.completions.create({
model: "gpt-4o-mini",
messages: [{ role: "user", content: prompt }],
temperature: 0.8
});

const text = completion.choices[0].message.content;

let replies;
try {
replies = JSON.parse(text);
} catch {
replies = [text]; // fallback
}

res.json({ replies });

} catch (err) {
console.error(err);
res.status(500).json({
replies: ["Something went wrong. Try again."]
});
}
});

app.get("/", (req, res) => {
res.send("AI Reply Server Running");
});

app.listen(process.env.PORT || 3000, () => {
console.log("Server running");
});
});
});

app.get("/", (req, res) => {
res.send("Server running");
});

app.listen(process.env.PORT || 3000, () => {
console.log("FORCED SERVER RUNNING");
});


