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
function normalizeCategory(category) { 
 const value = clean(category).toLowerCase(); 
 const allowed = ["dating", "relationship", "friendship", "family", "work", "teen"];  return allowed.includes(value) ? value : "dating"; 
} 
function normalizeIntent(category, intent) { 
 const value = clean(intent).toLowerCase(); 
 const datingIntents = [ 
 "keep_it_going", 
 "playful", 
 "direct", 
 "respectful", 
 "boundary", 
 "end_cleanly" 
 ]; 
 const generalIntents = [ 
 "resolution", 
 "closure", 
 "accountability", 
 "de_escalate", 
 "boundary", 
 "direct", 
 "respectful" 
 ]; 
 if (category === "dating" || category === "teen") { 
 return datingIntents.includes(value) ? value : "keep_it_going";  } 
 return generalIntents.includes(value) ? value : "resolution";
} 
function normalizeGoal(category, goal) { 
 const value = clean(goal); 
 if (value) return value; 
 if (category === "dating" || category === "teen") {  return "Reply naturally and match the chosen intent.";  } 
 return "Reply clearly and help the user handle the situation well."; } 
function intentRules(category, intent) { 
 if (category === "dating" || category === "teen") {  const rules = { 
 keep_it_going: [ 
 "Keep the conversation alive.", 
 "Invite more back-and-forth naturally.", 
 "Do not sound needy." 
 ], 
 playful: [ 
 "Light, witty, playful energy.", 
 "Can tease lightly.", 
 "Never sound hurt or bitter." 
 ], 
 direct: [ 
 "Clear, confident, brief.", 
 "Strong without sounding aggressive.", 
 "High self-respect." 
 ], 
 respectful: [ 
 "Warm, mature, balanced.", 
 "No robotic politeness.", 
 "Natural and easy to send." 
 ], 
 boundary: [ 
 "Set a clear line without drama.", 
 "Calm and self-respecting.", 
 "No overexplaining." 
 ], 
 end_cleanly: [ 
 "Short, final, self-respecting.", 
 "No begging.", 
 "No passive aggression." 
 ] 
 }; 
 return rules[intent] || rules.keep_it_going; 
 } 
 const rules = { 
 resolution: [ 
 "Move toward solving the issue.", 
 "Emotionally intelligent.", 
 "No unnecessary defensiveness."
 ], 
 closure: [ 
 "Final, calm, and emotionally grounded.", 
 "No humor, no sarcasm, no light tone.", 
 "Acknowledge the situation with maturity.", 
 "Can express acceptance or boundary without sounding cold.",  "Do NOT sound casual, playful, or dismissive."  ], 
 accountability: [ 
 "Take responsibility cleanly where appropriate.",  "No excuses.", 
 "Sound sincere, not performative." 
 ], 
 de_escalate: [ 
 "Lower tension.", 
 "Stay calm and grounded.", 
 "Do not inflame the conflict." 
 ], 
 boundary: [ 
 "Clear line, calm delivery.", 
 "Strong but not rude.", 
 "No overexplaining." 
 ], 
 direct: [ 
 "Brief, clear, straightforward.", 
 "No fluff.", 
 "Confident and controlled." 
 ], 
 respectful: [ 
 "Mature and fair.", 
 "Human, not corporate.", 
 "No passive aggression." 
 ] 
 }; 
 return rules[intent] || rules.resolution; 
} 
function buildSystemPrompt(category, intent, goal) {  return ` 
You write text-message replies for a mobile app. 
Return exactly 5 reply options. 
GLOBAL RULES: 
- Sound like a real person texting. 
- Usually 1 line, max 2 short lines. 
- No numbering. 
- No labels. 
- No quotation marks. 
- No emojis unless truly natural. 
- No therapy voice. 
- No robotic or corporate wording. 
- Avoid repeating structure. 
- Match the category and intent EXACTLY. 
Category: ${category}
Intent: ${intent} 
Goal: ${goal} 
Intent rules: 
${intentRules(category, intent).map((r) => `- ${r}`).join("\n")} 
CRITICAL CATEGORY RULES: 
${ 
 category === "dating" 
 ? ` 
DATING: 
- Natural, engaging, human 
- Can be playful, light, confident 
- Slight personality is OK 
- Can tease lightly if appropriate 
- Do not assume a male or female voice 
- Make replies usable for anyone 
- Do not default to pursuit 
- Only escalate if the message and intent support it 
` 
 : category === "teen" 
 ? ` 
TEEN: 
- Casual, short, modern 
- No cringe slang 
- Keep it believable 
- Do not force memes or try-hard humor 
` 
 : ` 
RELATIONSHIP / FRIENDSHIP / FAMILY / WORK (STRICT MODE): 
- MUST be serious and grounded 
- NO jokes 
- NO flirting 
- NO sarcasm 
- NO playful teasing 
- NO witty or clever comebacks 
- NO emojis 
- NO charm-based responses 
- Do not reframe insults as jokes 
- Do not turn criticism into banter 
- Do not answer with charm, wit, or humor 
- Do not sound cute, slick, or clever 
- When the message is criticism, respond with maturity and accountability 
- Prefer acknowledging the feeling over defending the ego 
- In relationship category, short negative messages must still be treated as serious relationship criticism - Do not wait for the user to explicitly say "in this relationship" 
- In family category, do NOT use humor, sarcasm, or emojis under any circumstance 
- Treat family situations as emotionally sensitive by default 
- If the message involves exclusion, rejection, or hurt, respond with calm seriousness 
- Do not make the reply sound playful, cheeky, or casual 
- If intent is closure in family category, tone must still remain serious, calm, and emotionally grounded (never casual 
PRIORITIZE: 
- emotional intelligence 
- calm tone 
- understanding
- accountability when needed 
- maturity 
- empathy 
- clear communication 
If the message is negative, critical, tense, dismissive, or hurtful: - acknowledge it 
- do NOT deflect 
- do NOT joke 
- do NOT minimize 
- do NOT get cute 
- do NOT turn it into banter 
Responses should feel: 
- mature 
- real 
- emotionally aware 
- appropriate for a real relationship conversation 
Stay grounded in the actual situation. 
Do not invent extra backstory. 
` 
} 
Return ONLY a valid JSON array of 5 strings. 
`.trim(); 
} 
function formatContext(contextItems) { 
 return toArray(contextItems) 
 .map((item) => { 
 if (typeof item === "string") return clean(item); 
 if (item && typeof item === "object") { 
 const speaker = clean(item.speaker || item.role || "");  const text = clean(item.text || item.message || item.content || ""); 
 if (speaker && text) return `${speaker}: ${text}`;  return text; 
 } 
 return ""; 
 }) 
 .filter(Boolean) 
 .slice(-8) 
 .join("\n"); 
} 
function buildUserPrompt(data) { 
 const contextText = formatContext(data.conversationContext); 
 const previousText = toArray(data.previousReplies)  .map((x) => clean(x)) 
 .filter(Boolean) 
 .slice(-12) 
 .join("\n"); 
 return `
Message to respond to: 
${data.message} 
Category: 
${data.category} 
Intent: 
${data.intent} 
Goal: 
${data.goal} 
Issue: 
${data.issue || "None"} 
Recent conversation context: 
${contextText || "None"} 
Replies already shown before: 
${previousText || "None"} 
Important: 
- Do not repeat or closely paraphrase previous replies. 
- Stay aligned with the chosen intent. 
- Keep the replies easy to send as real texts. 
- Directly respond to the actual message. 
- Treat the selected category as the source of truth, even if the message is short or ambiguous. - If category is relationship, friendship, family, or work, keep the tone serious and mature. - For relationship category, assume the message is about a real relationship issue unless the message clearly prove- In relationship category, do not interpret criticism as flirting, teasing, or banter. 
- In family category, default to a serious, respectful, emotionally aware tone. 
- If the family message suggests rejection, exclusion, or hurt, do not respond with jokes, surprise humor, or casual ba- If category is family AND intent is closure: 
 - Do NOT use casual language like "that's a bummer", "wow", "haha" 
 - Do NOT ask playful follow-up questions 
 - Do NOT sound socially light 
 - Keep tone calm, respectful, and emotionally aware 
- If the incoming message is critical, tense, dismissive, or insulting, do not respond playfully. 
Return ONLY a valid JSON array of 5 strings. 
`.trim(); 
} 
function parseReplies(text) { 
 try { 
 const parsed = JSON.parse(text); 
 if (Array.isArray(parsed)) { 
 return parsed.map((x) => clean(x)).filter(Boolean).slice(0, 5); 
 } 
 } catch (_) {} 
 return String(text || "") 
 .split("\n") 
 .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, "").trim()) 
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
 const category = normalizeCategory(req.body?.category);  const intent = normalizeIntent(category, req.body?.intent);  const goal = normalizeGoal(category, req.body?.goal);  const issue = clean(req.body?.issue); 
 const previousReplies = toArray(req.body?.previousReplies);  const conversationContext = toArray(req.body?.conversationContext); 
 if (!message) { 
 return res.status(400).json({ error: "Missing message" });  } 
 const completion = await openai.chat.completions.create({  model: MODEL, 
 temperature: category === "dating" || category === "teen" ? 0.9 : 0.45,  messages: [ 
 { 
 role: "system", 
 content: buildSystemPrompt(category, intent, goal)  }, 
 { 
 role: "user", 
 content: buildUserPrompt({ 
 message, 
 category, 
 intent, 
 goal, 
 issue, 
 previousReplies, 
 conversationContext 
 }) 
 } 
 ] 
 }); 
 const text = completion.choices?.[0]?.message?.content || "";  const replies = parseReplies(text); 
 if (!replies.length) { 
 return res.status(500).json({ error: "No replies generated" });  } 
 return res.json({ replies }); 
 } catch (error) { 
 console.error("Reply error:", error);
 return res.status(500).json({ 
 error: "Failed to generate replies", 
 details: 
 process.env.NODE_ENV === "production"  ? undefined 
 : String(error?.message || error) 
 }); 
 } 
}); 
app.listen(PORT, () => { 
 console.log(`AI Reply Server Running on port ${PORT}`); });
