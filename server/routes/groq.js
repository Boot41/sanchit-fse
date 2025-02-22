const express = require('express');
const router = express.Router();
const { Groq } = require('groq-sdk');
const { isAuth } = require('../middleware/auth');

const groq = new Groq();
groq.apiKey = process.env.GROQ_API_KEY;

// Store conversations in memory (for demo purposes)
// In production, you should use a database
const conversations = new Map();

// Initialize a new conversation
router.post('/api/groq/conversations', isAuth, async (req, res) => {
  try {
    const { initialMessage } = req.body;
    const userId = req.user.id;

    const messages = [];
    if (initialMessage) {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: initialMessage
          }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0.7,
        max_tokens: 1024,
      });

      const assistantMessage = chatCompletion.choices[0]?.message?.content;
      messages.push(
        { role: 'user', content: initialMessage },
        { role: 'assistant', content: assistantMessage }
      );
    }

    const conversationId = Date.now().toString();
    conversations.set(conversationId, {
      userId,
      messages
    });

    res.json({
      conversationId,
      messages
    });
  } catch (error) {
    console.error('Groq conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Continue a conversation
router.post('/api/groq/conversations/:conversationId/messages', isAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        ...conversation.messages,
        {
          role: "user",
          content: message
        }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const assistantMessage = chatCompletion.choices[0]?.message?.content;
    conversation.messages.push(
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage }
    );

    res.json({
      conversationId,
      messages: conversation.messages
    });
  } catch (error) {
    console.error('Groq message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Get conversation history
router.get('/api/groq/conversations/:conversationId', isAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      conversationId,
      messages: conversation.messages
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// JSON mode endpoint
router.post('/api/groq/json', isAuth, async (req, res) => {
  try {
    const { prompt, schema } = req.body;

    const systemMessage = schema 
      ? `You are a helpful assistant that always responds in valid JSON format following this schema: ${JSON.stringify(schema)}`
      : 'You are a helpful assistant that always responds in valid JSON format';

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" }  
    });

    const response = chatCompletion.choices[0]?.message?.content;
    
    try {
      // Ensure the response is valid JSON
      const jsonResponse = JSON.parse(response);
      res.json(jsonResponse);
    } catch (jsonError) {
      res.status(422).json({ 
        error: 'Invalid JSON response from model',
        rawResponse: response
      });
    }
  } catch (error) {
    console.error('Groq JSON mode error:', error);
    res.status(500).json({ error: 'Failed to process JSON request' });
  }
});

module.exports = router;
