const express = require("express");
const app = express();

app.use(express.json());

app.post("/reply", (req, res) => {
return res.json({
replies: [
"REAL SERVER FILE",
"SERVER.JS IS ACTIVE",
"THIS IS THE RIGHT BACKEND"
]
});
});

app.get("/", (req, res) => {
res.send("Server running");
});

app.listen(process.env.PORT || 3000, () => {
console.log("FORCED SERVER RUNNING");
});


