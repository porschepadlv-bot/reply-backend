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

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
 res.send("Server running OK");
});

app.post("/reply", async (req, res) => {
 try {
 const message = req.body.message;

 const completion = await openai.chat.completions.create({
 model: "gpt-4o-mini",
 messages: [
 {
 role: "system",
 content: "Return 5 natural text message replies as a JSON array."
 },
 {
 role: "user",
 content: message
 }
 ]
 });

 const text = completion.choices[0].message.content;

 return res.json({ replies: [text] });

 } catch (err) {
 console.error(err);
 res.status(500).json({ error: "fail" });
 }
});

app.listen(PORT, () => {
 console.log("Server started");
});
