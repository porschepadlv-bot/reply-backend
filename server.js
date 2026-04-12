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
  const allowed = ["dating", "relationship", "friendship", "family", "work", "teen"];

  if (allowed.includes(value)) return value;

  for (const item of allowed) {
    if (value.includes(item)) return item;
  }

  return "dating";
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
    return datingIntents.includes(value) ? value : "keep_it_going";
  }

  return generalIntents.includes(value) ? value : "resolution";
}

function normalizeGoal(category, goal) {
  const value = clean(goal);
  if (value) return value;

  if (category === "dating" || category === "teen") {
    return "Reply naturally and match the chosen intent.";
  }

  return "Reply clearly and help the user handle the situation well.";
}

function intentRules(category, intent) {
  if (category === "dating" || category === "teen") {
    const rules = {
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
      "Can express acceptance or boundary without sounding cold.",
      "Do NOT sound casual, playful, or dismissive."
    ],
    accountability: [
      "Take responsibility cleanly where appropriate.",
      "No excuses.",
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

function buildSystemPrompt(category, intent, goal) {
  const intentRuleText = intentRules(category, intent)
    .map((rule) => `- ${rule}`)
    .join("\n");

  let categoryRules = "";

  if (category === "dating") {
    categoryRules = `
DATING:
- Natural, engaging, human.
- Can be playful, light, confident.
- Slight personality is OK.
- Can tease lightly if appropriate.
- Do not assume a male or female voice.
- Make replies usable for anyone.
- Do not default to pursuit.
- Only escalate if the message and intent support it.
`;
  } else if (category === "teen") {
    categoryRules = `
TEEN:
- Casual, short, modern.
- No cringe slang.
- Keep it believable.
- Do not force memes or try-hard humor.
`;
  } else if (category === "work") {
    categoryRules = `
WORK (STRICTEST MODE):
- Workplace communication only.
- Every reply must be professional, respectful, neutral, and work-focused.
- Never accept, encourage, or reciprocate personal, romantic, flirtatious, or social invitations.
- If the message suggests coffee, drinks, dinner, hanging out, compliments on appearance, attraction, or anything outside professional boundaries, every reply must politely set a professional boundary.
- Do not sound interested, enthusiastic, playful, warm, flirtatious, personal, or emotionally open.
- Do not generate dating-style responses.
- Do not ask follow-up questions that continue the personal invitation.
- Do not suggest meeting socially.
- If needed, politely redirect the tone back to work and professionalism.
`;
  } else {
    categoryRules = `
RELATIONSHIP / FRIENDSHIP / FAMILY (STRICT MODE):
- Must be serious and grounded.
- No jokes.
- No flirting.
- No sarcasm.
- No playful teasing.
- No witty or clever comebacks.
- No emojis.
- No charm-based responses.
- Do not reframe insults as jokes.
- Do not turn criticism into banter.
- Do not answer with charm, wit, or humor.
- Do not sound cute, slick, or clever.
- When the message is criticism, respond with maturity and accountability.
- Prefer acknowledging the feeling over defending the ego.
- In relationship category, short negative messages must still be treated as serious relationship criticism.
- Do not wait for the user to explicitly say "in this relationship".
- In family category, do not use humor, sarcasm, or emojis under any circumstance.
- Treat family situations as emotionally sensitive by default.
- If the message involves exclusion, rejection, or hurt, respond with calm seriousness.
- Do not make the reply sound playful, cheeky, or casual.
- If intent is closure in family category, tone must still remain serious, calm, and emotionally grounded.
- Prioritize emotional intelligence, calm tone, understanding, accountability when needed, maturity, empathy, and clear communication.
- If the message is negative, critical, tense, dismissive, or hurtful: acknowledge it, do not deflect, do not joke, do not minimize, do not get cute, and do not turn it into banter.
- Responses should feel mature, real, emotionally aware, and appropriate for a real relationship conversation.
- Stay grounded in the actual situation.
- Do not invent extra backstory.
`;
  }

  return `
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
- Match the category and intent exactly.

Category: ${category}
Intent: ${intent}
Goal: ${goal}

Intent rules:
${intentRuleText}

CRITICAL CATEGORY RULES:
${categoryRules}

Return only a valid JSON array of 5 strings.
`.trim();
}

function formatContext(contextItems) {
  return toArray(contextItems)
    .map((item) => {
      if (typeof item === "string") return clean(item);

      if (item && typeof item === "object") {
        const speaker = clean(item.speaker || item.role || "");
        const text = clean(item.text || item.message || item.content || "");

        if (speaker && text) return `${speaker}: ${text}`;
        return text;
      }

      return "";
    })
    .filter(Boolean)
    .slice(-8)
    .join("\n");
}

function buildUserPrompt(data) {
  const contextText = formatContext(data.conversationContext);
  const previousText = toArray(data.previousReplies)
    .map((x) => clean(x))
    .filter(Boolean)
    .slice(-12)
    .join("\n");

  const workExtra =
    data.category === "work"
      ? `
WORKPLACE OVERRIDE:
- Treat the category as work even if the message sounds social.
- If the incoming message is personal or socially suggestive, every reply must politely maintain a professional boundary.
- Never accept coffee, drinks, dinner, hanging out, or personal invitations in work category.
`
      : "";

  return `
Message to respond to:
${data.message}

Category: ${data.category}
Intent: ${data.intent}
Goal: ${data.goal}
Issue: ${data.issue || "None"}

Recent conversation context:
${contextText || "None"}

Replies already shown before:
${previousText || "None"}

Important:
- Do not repeat or closely paraphrase previous replies.
- Stay aligned with the chosen intent.
- Keep the replies easy to send as real texts.
- Directly respond to the actual message.
- Treat the selected category as the source of truth, even if the message is short or ambiguous.
- If category is relationship, friendship, family, or work, keep the tone serious and mature.
- For relationship category, assume the message is about a real relationship issue unless the message clearly proves otherwise.
- In relationship category, do not interpret criticism as flirting, teasing, or banter.
- In family category, default to a serious, respectful, emotionally aware tone.
- If the family message suggests rejection, exclusion, or hurt, do not respond with jokes, surprise humor, or casual banter.
- If category is family and intent is closure: do not use casual language like "that's a bummer", "wow", or "haha"; do not ask playful follow-up questions; do not sound socially light; keep tone calm, respectful, and emotionally aware.
- If the incoming message is critical, tense, dismissive, or insulting, do not respond playfully.
${workExtra}
Return only a valid JSON array of 5 strings.
`.trim();
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
        .replace(/^\s*[\[\],]+\s*$/g, "")
        .replace(/^\s*[-*•\d.)]+\s*/, "")
        .replace(/^"+|"+$/g, "")
        .replace(/",?\s*$/g, "")
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
    const rawCategory = req.body?.category || req.body?.context || req.body?.message || "";
    const category = normalizeCategory(rawCategory);
    const intent = normalizeIntent(category, req.body?.intent);
    const goal = normalizeGoal(category, req.body?.goal);
    const issue = clean(req.body?.issue);
    const previousReplies = toArray(req.body?.previousReplies);
    const conversationContext = toArray(req.body?.conversationContext);

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: category === "dating" || category === "teen" ? 0.9 : 0.45,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(category, intent, goal)
        },
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

    const text = completion.choices?.[0]?.message?.content || "";
    const replies = parseReplies(text);

    if (!replies.length) {
      return res.status(500).json({ error: "No replies generated" });
    }

    return res.json({ replies });
  } catch (error) {
    console.error("Reply error:", error);
    return res.status(500).json({
      error: "Failed to generate replies",
      details: process.env.NODE_ENV === "production" ? undefined : String(error?.message || error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI Reply Server Running on port ${PORT}`);
});

