const express = require('express');
const router = express.Router();
const { isAuth } = require('../middleware/auth');
const { Groq } = require("groq-sdk");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Store conversations in memory (replace with database in production)
const conversations = new Map();

// Initialize a new conversation
router.post('/conversations', isAuth, async (req, res) => {
  try {
    const { initialMessage, systemMessage } = req.body;
    const userId = req.user.id;

    const messages = [];
    if (initialMessage) {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemMessage || "You are an AI assistant helping with workspace tasks and questions."
          },
          {
            role: "user",
            content: initialMessage
          }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0.9,
        max_tokens: 1024,
      });

      if (chatCompletion.choices && chatCompletion.choices[0]) {
        messages.push({
          role: "user",
          content: initialMessage
        });
        messages.push({
          role: "assistant",
          content: chatCompletion.choices[0].message.content
        });
      }
    }

    // Create conversation object
    const conversationId = Date.now().toString();
    const conversation = {
      id: conversationId,
      userId,
      messages,
      systemMessage
    };

    // Store conversation
    conversations.set(conversationId, conversation);
    console.log('Created conversation:', conversationId, 'Total conversations:', conversations.size);

    // Send response
    res.json({
      conversationId: conversation.id,
      messages: conversation.messages
    });
  } catch (error) {
    console.error('Error in chat completion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Continue an existing conversation
router.post('/conversations/:conversationId/messages', isAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    console.log('Looking for conversation:', conversationId);
    console.log('Available conversations:', Array.from(conversations.keys()));

    // Get existing conversation
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      console.log('Conversation not found:', conversationId);
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify user owns the conversation
    if (conversation.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to access this conversation' });
    }

    // Build message history for context
    const messageHistory = [
      {
        role: "system",
        content: conversation.systemMessage || "You are an AI assistant helping with workspace tasks and questions."
      },
      ...conversation.messages,
      {
        role: "user",
        content: message
      }
    ];

    // Get AI response
    const chatCompletion = await groq.chat.completions.create({
      messages: messageHistory,
      model: "mixtral-8x7b-32768",
      temperature: 0.9,
      max_tokens: 1024,
    });

    if (!chatCompletion.choices || !chatCompletion.choices[0]) {
      throw new Error('No response from AI');
    }

    // Add new messages to conversation
    conversation.messages.push(
      {
        role: "user",
        content: message
      },
      {
        role: "assistant",
        content: chatCompletion.choices[0].message.content
      }
    );

    // Update conversation in storage
    conversations.set(conversationId, conversation);
    console.log('Updated conversation:', conversationId, 'Messages:', conversation.messages.length);

    // Send response
    res.json({
      messages: [
        {
          role: "user",
          content: message
        },
        {
          role: "assistant",
          content: chatCompletion.choices[0].message.content
        }
      ]
    });
  } catch (error) {
    console.error('Error in chat completion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history
router.get('/conversations/:conversationId', isAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Get existing conversation
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify user owns the conversation
    if (conversation.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to access this conversation' });
    }

    // Send response
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
router.post('/json', isAuth, async (req, res) => {
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

// Workspace chat endpoint
router.post('/chat', isAuth, async (req, res) => {
  try {
    const { message, workspaceId, context } = req.body;
    const userId = req.user.id;

    // Verify user's access to workspace
    const userWorkspace = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId,
      },
      include: {
        workspace: true,
      },
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get workspace purpose for context
    const workspacePurpose = userWorkspace.workspace.purpose;

    // Create system message with workspace context
    const systemMessage = `You are an AI assistant for a workspace focused on: ${workspacePurpose}. 
    Your goal is to help users with tasks, planning, and questions related to this purpose. 
    Provide specific, actionable advice and suggestions that align with the workspace's focus.`;

    // Create chat completion
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        ...(context?.previousMessages || []),
        { role: 'user', content: message }
      ],
      model: 'mixtral-8x7b-32768',
      temperature: 0.7,
      max_tokens: 2048,
    });

    // Store the message
    await prisma.workspaceMessage.create({
      data: {
        content: message,
        sender: { connect: { id: userId } },
        workspace: { connect: { id: parseInt(workspaceId) } },
        role: 'user'
      }
    });

    const aiResponse = completion.choices[0].message.content;

    // Store AI response
    await prisma.workspaceMessage.create({
      data: {
        content: aiResponse,
        workspace: { connect: { id: parseInt(workspaceId) } },
        role: 'assistant'
      }
    });

    res.json({ message: aiResponse });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message', details: error.message });
  }
});

module.exports = router;
