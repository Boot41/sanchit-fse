const request = require('supertest');
const { app } = require('../index');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock Prisma client
jest.mock('../prisma-client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  return mockPrisma;
});

// Mock Groq SDK
jest.mock('groq-sdk', () => ({
  Groq: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Mock AI response'
            }
          }],
          usage: {
            total_tokens: 100
          }
        })
      }
    }
  }))
}));

const prisma = require('../prisma-client');

describe('Groq API Tests', () => {
  let authToken;
  let authHeader;
  let testUser;
  let conversationId;

  beforeAll(async () => {
    testUser = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
    };
    
    // Mock the user lookup for authentication
    prisma.user.findUnique.mockResolvedValue(testUser);
    
    // Create auth token
    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    authHeader = `Bearer ${authToken}`;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock to return the test user
    prisma.user.findUnique.mockResolvedValue(testUser);
  });

  describe('POST /api/groq/conversations', () => {
    it('should create a new conversation', async () => {
      const response = await request(app)
        .post('/api/groq/conversations')
        .set('Authorization', authHeader)
        .send({ 
          initialMessage: 'Hello AI',
          systemMessage: 'You are a test assistant'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('conversationId');
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
      
      // Check if messages contain both user and assistant messages
      const messages = response.body.messages;
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello AI');
      expect(messages[1].role).toBe('assistant');
      expect(typeof messages[1].content).toBe('string');

      // Save conversationId for later tests
      conversationId = response.body.conversationId;
    });

    it('should handle missing initial message', async () => {
      const response = await request(app)
        .post('/api/groq/conversations')
        .set('Authorization', authHeader)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('conversationId');
      expect(response.body.messages).toHaveLength(0);
    });
  });

  describe('POST /api/groq/conversations/:conversationId/messages', () => {
    it('should continue an existing conversation', async () => {
      const response = await request(app)
        .post(`/api/groq/conversations/${conversationId}/messages`)
        .set('Authorization', authHeader)
        .send({ message: 'How are you?' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0].role).toBe('user');
      expect(response.body.messages[1].role).toBe('assistant');
    });

    it('should handle non-existent conversation', async () => {
      const response = await request(app)
        .post('/api/groq/conversations/non-existent-id/messages')
        .set('Authorization', authHeader)
        .send({ message: 'Hello' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/groq/conversations/:conversationId', () => {
    it('should get conversation history', async () => {
      const response = await request(app)
        .get(`/api/groq/conversations/${conversationId}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('conversationId');
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
    });

    it('should handle non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/groq/conversations/non-existent-id')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
