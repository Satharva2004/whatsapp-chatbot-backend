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
            const messageBody = msg.text?.body;

            if (messageBody) {
                console.log(`Received message from ${senderId}: ${messageBody}`);

                try {
                    // 1. Get response from Groq
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a helpful customer support assistant for a business. Keep your replies concise and professional.',
                            },
                            {
                                role: 'user',
                                content: messageBody,
                            },
                        ],
                        model: 'llama3-8b-8192', // Or your preferred Groq model
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
