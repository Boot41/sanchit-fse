const request = require('supertest');
const { app } = require('../index');
const prisma = require('../prisma-client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../prisma-client', () => ({
  user: {
    findUnique: jest.fn(),
  },
  userWorkspace: {
    findFirst: jest.fn(),
  },
  workspaceMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
}));

describe('Messages API Tests', () => {
  let testUser;
  let authToken;
  let authHeader;
  const workspaceId = 1;

  beforeAll(async () => {
    // Create a test user
    testUser = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password: await bcrypt.hash('password123', 10),
    };
    
    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    authHeader = `Bearer ${authToken}`;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock user authentication
    prisma.user.findUnique.mockResolvedValue(testUser);
  });

  describe('GET /api/messages/workspaces/:workspaceId/messages', () => {
    it('should get workspace messages successfully', async () => {
      const mockMessages = [
        {
          id: 1,
          content: 'Test message',
          workspaceId,
          senderId: testUser.id,
          createdAt: new Date(),
          sender: {
            id: testUser.id,
            username: testUser.username,
          },
        },
      ];

      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'member'
      });
      prisma.workspaceMessage.findMany.mockResolvedValue(mockMessages);

      const response = await request(app)
        .get(`/api/messages/workspaces/${workspaceId}/messages`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].content).toBe('Test message');
      expect(response.body[0].sender.username).toBe(testUser.username);
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/messages/workspaces/${workspaceId}/messages`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get(`/api/messages/workspaces/${workspaceId}/messages`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/messages/workspaces/:workspaceId/messages', () => {
    const messageData = {
      content: 'New test message',
    };

    it('should create a new message successfully', async () => {
      const mockMessage = {
        id: 1,
        content: messageData.content,
        workspaceId,
        senderId: testUser.id,
        createdAt: new Date(),
        sender: {
          id: testUser.id,
          username: testUser.username,
        },
      };

      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'member'
      });
      prisma.workspaceMessage.create.mockResolvedValue(mockMessage);

      const response = await request(app)
        .post(`/api/messages/workspaces/${workspaceId}/messages`)
        .set('Authorization', authHeader)
        .send(messageData);

      expect(response.status).toBe(200);
      expect(response.body.content).toBe(messageData.content);
      expect(response.body.sender.username).toBe(testUser.username);
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/messages/workspaces/${workspaceId}/messages`)
        .set('Authorization', authHeader)
        .send(messageData);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post(`/api/messages/workspaces/${workspaceId}/messages`)
        .send(messageData);

      expect(response.status).toBe(401);
    });
  });
});
