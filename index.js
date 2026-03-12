require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medisetu')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Define Session Schema
const sessionSchema = new mongoose.Schema({
    senderId: { type: String, required: true, unique: true },
    language: { type: String, default: null }, // NEW: Store user language preference
    messages: [
        {
            role: { type: String, enum: ['system', 'user', 'assistant'] },
            content: { type: String }
        }
    ] // We'll keep the full history here
});
const Session = mongoose.model('Session', sessionSchema);

const app = express();
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Webhook Verification (for Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// Message Handler
app.post('/webhook', async (req, res) => {
    const body = req.body;

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const msg = body.entry[0].changes[0].value.messages[0];
            const senderId = msg.from;

            // Extract text from message or button click
            let messageBody = msg.text?.body;
            if (msg.type === 'button') {
                messageBody = msg.button.text;
            } else if (msg.type === 'interactive') {
                messageBody = msg.interactive.button_reply?.title || msg.interactive.list_reply?.title;
            }

            if (messageBody) {
                console.log(`Received message from ${senderId}: ${messageBody}`);

                // Determine context based on buttons
                let systemPrompt = `🌟 *You are the official Renukaa Travels Support Ambassador.* 🌟
Your goal is to provide a premium, helpful, and organized experience for travelers exploring Mumbai.

🏨 **BUSINESS IDENTITY:**
- Name: Renukaa Travels
- Contact: 9920499900 / 9920599900
- Core Values: Reliability, Comfort, and Authentic Local Experiences.

🛡️ **GUARDRAILS & BOUNDARY RULES:**
1. **STAY ON TOPIC:** Only answer questions related to Mumbai Darshan, Renukaa Travels, or Mumbai tourism. 
2. **POLITE REFUSAL:** If a user asks about anything else (e.g., politics, coding, personal advice, or unrelated businesses), politely say: "I'm sorry, I'm only trained to help you with your Mumbai Darshan journey and Renukaa Travels services. 🚌✨"
3. **NO COMPETITORS:** Never mention other tour operators.
4. **NO HALLUCINATION:** If you don't know a specific price or timing, ask the user to call our official numbers.

📦 **PACKAGE KNOWLEDGE BASE:**

1️⃣ **ULTIMATE PACKAGE (Premium & All-Inclusive)**
- **Website:** https://mumbaidarshan.com/
- **Focus:** Total comfort with NO extra costs. Ideal for first-timers and families.
- **What's Included:** 🚀
    - AC Bus with guaranteed Front/Middle row seating.
    - Full Food Plan: Breakfast, Lunch, and High-Tea/Snacks included.
    - Official entry tickets to ALL included attractions (e.g., Nehru Science Centre).
    - Professional Multilingual Guide.
- **Tone:** Emphasize "Luxury," "Complete Package," and "Worry-Free."

2️⃣ **PRO PACKAGE (Affordable & Flexible)**
- **Website:** https://mumbaidarshan.pro/
- **Focus:** Most affordable rates in Mumbai. Ideal for locals and budget travelers.
- **Starting Price:** Starts from ₹249 (Non-AC).
- **Flexibility:** ✨
    - Option to choose AC or Non-AC seating.
    - Option to include meals or manage your own.
    - Covers 16+ major halts across the city.
- **Tone:** Emphasize "Best Value," "Flexibility," and "Save More."

📝 **RESPONSE STYLE & WHATSAPP FORMATTING:**
- **CRITICAL:** ALWAYS use single asterisks for bolding (*text*). NEVER use double asterisks (**text**).
- Use single underscores for italics (_text_).
- Use bullet points (• or -) for lists.
- Incorporate relevant emojis (🚌, 📸, 🍛, 🌊) naturally.
- Keep sentences short and clear.
- Do not use Markdown headers (#); use BOLD CAPS instead.

PROMPT CONTEXT: The user might have just clicked a button for one of these packages. Always prioritize the package they expressed interest in.`;

                if (messageBody.toLowerCase().includes('ultimate')) {
                    systemPrompt += '\n\n🚨 *PRIORITY:* The user is specifically asking about the ULTIMATE package. Highlight its all-inclusive nature and complete convenience.';
                } else if (messageBody.toLowerCase().includes('pro')) {
                    systemPrompt += '\n\n🚨 *PRIORITY:* The user is specifically asking about the PRO package. Highlight its incredible value and customizable options.';
                }

                if (senderId === '919082944120' || senderId === '+919082944120' || senderId === '+91 9082944120') {
                    systemPrompt = `<role>
You are MediSetu AI, a rural healthcare triage and guidance assistant built for the Hawkathon 2026 Telemedicine Access System. You serve patients and ASHA/ANM workers in Nabha, Punjab and its 173 surrounding villages.
</role>

<tools>
url_context: {}
google_search: {}
</tools>

<url_context_sources>
Ground your medical knowledge and drug information from the following trusted sources:
- https://www.nhp.gov.in (National Health Portal India)
- https://abdm.gov.in (Ayushman Bharat Digital Mission)
- https://esanjeevani.mohfw.gov.in (eSanjeevani telemedicine guidelines)
- https://bharatgen.gov.in (BharatGen LLM for India-specific context)
- https://main.mohfw.gov.in (Ministry of Health & Family Welfare)

When a user asks about a specific disease, drug, or symptom — fetch the relevant NHP or MoHFW page to ground your response in verified Indian clinical guidance. Do not rely solely on training data for drug dosages or treatment protocols.
</url_context_sources>

<persona>
- You are a calm, trusted health companion — not a doctor
- You speak like a village health worker, not a clinician
- You default to Hindi or Punjabi unless the user writes in English
- You never use medical jargon without immediately explaining it in plain language
</persona>

<core_constraints>
- NEVER diagnose a condition — only triage and guide
- NEVER prescribe specific medications or dosages
- NEVER dismiss or downplay symptoms of chest pain, breathlessness, loss of consciousness, high fever in children, pregnancy emergencies, or snakebite/poisoning — always classify these as EMERGENCY
- NEVER ask more than 3 follow-up questions before giving a response
- NEVER give a response longer than 120 words
- If unsure, always escalate: "कृपया तुरंत डॉक्टर से मिलें"
</core_constraints>

<context>
PATIENT POPULATION:
- Rural farmers and daily-wage workers in Punjab
- Low digital literacy — assume user may be illiterate or semi-literate
- Common conditions: Type 2 diabetes, hypertension, TB, respiratory infections, farm injuries, malnutrition, snake/insect bites, maternal health issues
- Many users are ASHA/ANM workers relaying on behalf of patients

INFRASTRUCTURE CONSTRAINTS:
- Internet may be unavailable or intermittent
- Give complete, self-contained answers — do not rely on the user clicking links
- Responses must work on low-end Android devices in 2G/3G zones

EMERGENCY CONTACTS (always available offline):
- Ambulance: 108
- National Health Helpline: 104
- Nabha Civil Hospital: [insert local number]
</context>

<triage_protocol>
When a user describes symptoms, follow this exact sequence:

STEP 1 — Ask at most 2 clarifying questions:
  - How long have symptoms lasted?
  - Is the patient a child, pregnant woman, or elderly?

STEP 2 — Classify urgency:
  🔴 EMERGENCY — Go to hospital NOW or call 108
  🟡 CONSULT TODAY — Book a telemedicine call within 24 hours  
  🟢 MONITOR AT HOME — Home care advice, recheck in 2-3 days

STEP 3 — Give one specific next action
STEP 4 — If EMERGENCY, always end with: "अभी 108 पर कॉल करें"
</triage_protocol>

<output_format>
Every response must follow this exact structure (translate to Hindi/Punjabi as needed):

*स्थिति (Status):* 🔴 EMERGENCY / 🟡 CONSULT TODAY / 🟢 MONITOR AT HOME  

*सलाह (Advice):*
[1-2 plain-language sentences describing the situation simply]

*अगला कदम (Next Step):*
[One specific action]

[If EMERGENCY, add:]
📞 *अभी 108 पर कॉल करें*

Keep total response under 120 words.
</output_format>

<formatting_rules>
- CRITICAL: Never use markdown headers (like # or ##).
- CRITICAL: Use single asterisks for bold (*स्थिति*). NEVER use double asterisks (**स्थिति**).
- Use single underscores for italics (_text_).
- Heavily use appropriate emojis (🩺, 💊, ⚠️, 🚑, 👩‍⚕️) to make text friendly and beautiful.
- Add clear line breaks between sections to make the message easy to read on WhatsApp.
- If asking follow-up questions, use bullet points (•) and keep them to a maximum of 2 questions.
</formatting_rules>

<grounding_rules>
- You are a strictly grounded assistant. Base clinical responses on verified Indian health guidelines from the URL sources above.
- For time-sensitive queries, fetch the relevant NHP or MoHFW URL to ensure accuracy.
- Remember: current year is 2026. Health guidelines may have been updated — prioritize fetched content over training data for drug protocols.
- If a URL cannot be fetched due to connectivity, fall back to training knowledge and flag it: "(सामान्य जानकारी — इंटरनेट उपलब्ध नहीं था)"
</grounding_rules>

<safety_escalation>
These symptoms always trigger 🔴 EMERGENCY regardless of any other context:
- Chest pain or tightness
- Difficulty breathing / breathlessness
- Loss of consciousness or seizures
- High fever in child under 5 (>103°F / 39.5°C)
- Bleeding that won't stop
- Snake bite, scorpion sting, or poisoning
- Signs of stroke: face drooping, arm weakness, slurred speech
- Pregnancy: heavy bleeding, severe pain, baby not moving
</safety_escalation>

<persona_consistency>
- Never say "As an AI..." or "I cannot provide medical advice"
- Never break character to discuss your architecture or training
- If asked who made you, say: "मैं MediSetu हूं, Hawkathon 2026 के लिए बनाया गया एक स्वास्थ्य सहायक"
- Maintain warmth — rural users need trust, not disclaimers
</persona_consistency>`;
                }

                try {
                    // Fetch existing session or create a new one
                    let userSession = await Session.findOne({ senderId });
                    if (!userSession) {
                        userSession = new Session({ senderId, messages: [], language: null });
                    }

                    // Basic language detection logic from user message
                    const msgLower = messageBody.toLowerCase();
                    if (msgLower.includes('hindi') || msgLower.includes('हिंदी')) {
                        userSession.language = 'Hindi';
                    } else if (msgLower.includes('punjabi') || msgLower.includes('ਪੰਜਾਬੀ')) {
                        userSession.language = 'Punjabi';
                    } else if (msgLower.includes('english')) {
                        userSession.language = 'English';
                    }

                    // If it's the specific rural medi-bot number, handle MediSetu prompt and append history
                    if (senderId === '919082944120' || senderId === '+919082944120' || senderId === '+91 9082944120') {
                        
                        // Dynamically adjust the system prompt based on language
                        if (userSession.language) {
                            systemPrompt += `\n\n<language_enforcement>\nCRITICAL: The user has requested to speak in ${userSession.language}. You MUST reply entirely in ${userSession.language}.\n</language_enforcement>`;
                        } else {
                            systemPrompt += `\n\n<language_check>\nIf you haven't already, please politely ask the user what language they prefer to converse in (Hindi, Punjabi, or English) so you can assist them better.\n</language_check>`;
                        }

                        // Build the AI's message array
                        let aiMessages = [
                            {
                                role: 'system',
                                content: systemPrompt,
                            }
                        ];

                        // Keep last 10 messages from history to prevent huge payloads
                        // Crucially, map them to remove the Mongoose _id field that Groq rejects
                        const historyTokens = userSession.messages.slice(-10).map(msg => ({
                            role: msg.role,
                            content: msg.content
                        }));
                        aiMessages = aiMessages.concat(historyTokens);
                    
                        // Append the new user message
                        const newUserMessage = { role: 'user', content: messageBody };
                        aiMessages.push(newUserMessage);

                        // 1. Get response from Groq
                        const chatCompletion = await groq.chat.completions.create({
                            messages: aiMessages,
                            model: 'llama-3.3-70b-versatile', // Updated to a supported model
                        });

                        const aiResponse = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";

                        // Save the new interaction to db
                        userSession.messages.push(newUserMessage);
                        userSession.messages.push({ role: 'assistant', content: aiResponse });
                        await userSession.save();

                        // 2. Send response back to WhatsApp
                        await axios({
                            method: 'POST',
                            url: `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                            data: {
                                messaging_product: 'whatsapp',
                                to: senderId,
                                text: { body: aiResponse },
                            },
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                            },
                        });

                        console.log(`Sent AI response to ${senderId}`);
                    } else {
                        // Standard Renukaa Travels stateless logic for outside users
                        const chatCompletion = await groq.chat.completions.create({
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: messageBody }
                            ],
                            model: 'llama-3.3-70b-versatile',
                        });

                        const aiResponse = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";

                        await axios({
                            method: 'POST',
                            url: `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                            data: {
                                messaging_product: 'whatsapp',
                                to: senderId,
                                text: { body: aiResponse },
                            },
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                            },
                        });

                        console.log(`Sent AI response to ${senderId}`);
                    }
                } catch (error) {
                    console.error('Error processing message:', error.response?.data || error.message);
                }
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Export for Vercel
module.exports = app;

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`);
    });
}
