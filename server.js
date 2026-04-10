const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/reply", async (req, res) => {
try {
const { message, category, tone, goal } = req.body;

// TEMP TEST (to confirm backend works)
return res.json({
replies: [
"🔥 Backend is now working",
`You said: ${message}`,
`Tone: ${tone}`
]
});

} catch (err) {
console.error(err);
res.status(500).json({
replies: ["Server error"]
});
}
});

app.get("/", (req, res) => {
res.send("AI Reply Server Running");
});

app.listen(process.env.PORT || 3000, () => {
console.log("Server running");
});