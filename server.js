function normalizeReply(text) {
return clean(text)
.replace(/^["'`$begin:math:display$$end:math:display$,\s]+|["'`\[\],\s]+$/g, "")
.replace(/\s+/g, " ")
.trim();
}

function fallbackReplies(category) {
switch (category) {
case "family":
return [
"If that's how you feel, then tell me what you mean.",
"Don't just leave it at that. Tell me clearly what you're talking about.",
"If you think I'm missing something, then say it plainly.",
"I hear what you're saying, but I need you to be specific.",
"If you're frustrated with me, then be direct about it."
];
case "relationship":
return [
"I hear what you're saying, and I need to take that seriously.",
"You're right to bring it up, and I know I need to do better here.",
"I’m not trying to dodge it. I know this matters.",
"I understand why you're upset, and I need to own my part in it.",
"I hear you, and I know I need to show up better."
];
case "friendship":
return [
"If something's off, just say it directly.",
"I get that you're upset, but I'd rather talk about it clearly.",
"That didn't sit right with me, and I think we should be honest about it.",
"If we're going to fix it, then let's actually talk about it.",
"Say what you mean directly so we can deal with it."
];
case "dating":
return [
"What did you mean by that?",
"Okay, now you have my attention.",
"Fair enough, tell me more.",
"I’m not totally sure how to read that yet.",
"Alright, I'm listening."
];
case "work":
return [
"Thanks for reaching out. I’d prefer to keep this work-focused.",
"I appreciate it, but I’d rather keep this professional.",
"Thank you, but I’m more comfortable keeping this work-related.",
"I’d prefer to keep our communication professional.",
"Thanks, but I’d rather keep this focused on work."
];
default:
return [
"What do you mean by that?",
"Can you be more specific?",
"Say that a little more clearly.",
"Tell me what you mean directly.",
"I’m listening, so be clear with me."
];
}
}
