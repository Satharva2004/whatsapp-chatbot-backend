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
                let systemPrompt = 'You are a helpful customer support assistant for Renukaa Travels. Keep your replies concise and professional.';

                if (messageBody.toLowerCase().includes('ultimate')) {
                    systemPrompt += ' The user is interested in the "Ultimate" package. Talk specifically about https://mumbaidarshan.com and its features.';
                } else if (messageBody.toLowerCase().includes('pro')) {
                    systemPrompt += ' The user is interested in the "Pro" package. Talk specifically about https://mumbaidarshan.pro and its features.';
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
