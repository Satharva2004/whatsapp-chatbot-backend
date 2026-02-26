require('dotenv').config();
const express = require('express');
const axios = require('axios');
const Groq = require('groq-sdk');

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

                try {
                    // 1. Get response from Groq
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: systemPrompt,
                            },
                            {
                                role: 'user',
                                content: messageBody,
                            },
                        ],
                        model: 'llama-3.3-70b-versatile', // Updated to a supported model
                    });

                    const aiResponse = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";

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
