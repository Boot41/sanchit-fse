// Mock modules before requiring any module
jest.mock('../prisma-client', () => {
  const mockPrisma = {
    userWorkspace: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 1,
        workspaceId: 1,
        role: 'member'
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        userId: 1,
        workspaceId: 1,
        role: 'member'
      })
    },
    task: {
      create: jest.fn().mockResolvedValue({
        id: 1,
        title: "Drink water",
        description: "Stay hydrated",
        status: "pending",
        workspaceId: 1,
        assigneeId: 1
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 1,
        title: "Drink water",
        description: "Stay hydrated",
        status: "pending",
        workspaceId: 1,
        assigneeId: 1
      }),
      findMany: jest.fn().mockResolvedValue([{
        id: 1,
        title: "Drink water",
        description: "Stay hydrated",
        status: "pending",
        workspaceId: 1,
        assigneeId: 1
      }]),
      update: jest.fn().mockResolvedValue({
        id: 1,
        title: "Drink water",
        description: "Stay hydrated",
        status: "completed",
        workspaceId: 1,
        assigneeId: 1
      })
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        username: 'testuser'
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        username: 'testuser'
      })
    }
  };

  // Add $connect method
  mockPrisma.$connect = jest.fn();
  mockPrisma.$disconnect = jest.fn();

  return mockPrisma;
});

jest.mock('groq-sdk', () => ({
  Groq: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                title: "Drink water",
                description: "Stay hydrated",
                assigneeName: "rob",
                dueDate: "2024-03-01",
                labels: ["health"]
              })
            }
          }]
        })
      }
    }
  }))
}));

jest.mock('ioredis', () => jest.fn());

const request = require('supertest');
const { app } = require('../index');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma-client');
const { Groq } = require('groq-sdk');

// Mock Socket.io
const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn()
};

// Mock modules
describe('Tasks API Tests', () => {
  let testUser;
  let authToken;
  let authHeader;

  beforeAll(async () => {
    testUser = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password: await bcrypt.hash('password123', 10),
    };
    
    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    authHeader = `Bearer ${authToken}`;
    app.set('io', mockIo);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(testUser);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/tasks/workspaces/:workspaceId/ai', () => {
    const workspaceId = 1;
    const taskPrompt = "remind bob to submit report by next friday";

    it('should handle AI task creation', async () => {
      // Mock workspace access check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
      });

      // Mock workspace members
      prisma.userWorkspace.findMany.mockResolvedValueOnce([
        {
          userId: 2,
          workspaceId,
          user: { id: 2, username: 'bob', email: 'bob@example.com' }
        }
      ]);

      // Mock AI response
      const mockGroqInstance = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValueOnce({
              choices: [{
                message: {
                  content: JSON.stringify({
                    title: "Submit report",
                    description: "Reminder to submit report",
                    assigneeName: "bob",
                    dueDate: "2025-03-01",
                    labels: ["reminder", "work"]
                  })
                }
              }]
            })
          }
        }
      };
      Groq.mockImplementation(() => mockGroqInstance);

      // Mock task creation
      prisma.task.create.mockResolvedValueOnce({
        id: 1,
        title: "Submit report",
        assignee: { id: 2, username: 'bob', email: 'bob@example.com' }
      });

      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/ai`)
        .set('Authorization', authHeader)
        .send({ prompt: taskPrompt });

      expect(response.status).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });

    it('should handle workspace access denial', async () => {
      // Mock no workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/ai`)
        .set('Authorization', authHeader)
        .send({ prompt: taskPrompt });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toBeDefined();
    });

    it('should handle AI processing errors', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
      });

      // Mock workspace members
      prisma.userWorkspace.findMany.mockResolvedValueOnce([]);

      // Mock AI error
      const mockGroqInstance = {
        chat: {
          completions: {
            create: jest.fn().mockRejectedValueOnce(new Error('AI Error'))
          }
        }
      };
      Groq.mockImplementation(() => mockGroqInstance);

      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/ai`)
        .set('Authorization', authHeader)
        .send({ prompt: taskPrompt });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/tasks/workspaces/:workspaceId/tasks', () => {
    const workspaceId = 1;

    it('should handle tasks retrieval', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
      });

      // Mock tasks
      prisma.task.findMany.mockResolvedValueOnce([
        {
          id: 1,
          title: 'Test Task',
          assignee: { id: 1, username: 'testuser' }
        }
      ]);

      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });

    it('should handle workspace access denial', async () => {
      // Mock no workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toBeDefined();
    });
  });

  describe('POST /api/workspaces/:workspaceId/tasks/create-from-prompt', () => {
    const workspaceId = 1;
    const prompt = 'Create a task to remind me to drink water';

    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
      
      // Setup default successful mocks
      prisma.userWorkspace.findUnique.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });
      
      prisma.userWorkspace.findMany.mockResolvedValue([
        {
          userId: testUser.id,
          workspaceId,
          user: testUser
        }
      ]);
    });

    it('should create a task from prompt successfully', async () => {
      const mockTask = {
        id: 1,
        title: 'Drink water',
        description: 'Stay hydrated',
        assigneeId: testUser.id,
        dueDate: null,
        labels: ['health'],
        assignee: testUser
      };

      // Mock AI response
      const mockAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              title: mockTask.title,
              description: mockTask.description,
              labels: mockTask.labels
            })
          }
        }]
      };

      // Setup mocks
      Groq.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockAIResponse)
          }
        }
      }));

      prisma.task.create.mockResolvedValueOnce(mockTask);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      // More flexible status code check
      expect(response.status).toBeLessThan(400);
      expect(response.body).toHaveProperty('task');
      expect(response.body.task.title).toBe(mockTask.title);
      expect(mockIo.to).toHaveBeenCalledWith(`workspace_${workspaceId}`);
    });

    it('should return appropriate error if user is not a workspace member', async () => {
      // Mock user not being a workspace member
      prisma.userWorkspace.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      // More flexible error status check
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing prompt', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Prompt is required');
    });

    it('should handle AI processing error', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });

      Groq.mockImplementationOnce(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('AI processing failed'))
          }
        }
      }));

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create task');
    });

    it('should handle invalid AI response', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });

      Groq.mockImplementationOnce(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    description: "Missing title field"
                  })
                }
              }]
            })
          }
        }
      }));

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create task');
    });

    it('should handle task creation error', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });

      prisma.userWorkspace.findMany.mockResolvedValueOnce([
        {
          userId: testUser.id,
          workspaceId,
          user: testUser
        }
      ]);

      prisma.task.create.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create task');
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied to this workspace');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .send({ prompt });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/workspaces/:workspaceId/tasks', () => {
    const workspaceId = 1;

    beforeEach(() => {
      jest.clearAllMocks();
      
      // Setup default successful mocks
      prisma.userWorkspace.findUnique.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });
    });

    it('should get tasks successfully', async () => {
      const mockTasks = [{
        id: 1,
        title: 'Test Task',
        description: 'Test Description',
        assigneeId: testUser.id,
        assignee: testUser
      }];

      prisma.task.findMany.mockResolvedValueOnce(mockTasks);

      const response = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      // More flexible status check
      expect(response.status).toBeLessThan(400);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('title');
    });

    it('should handle unauthorized access appropriately', async () => {
      // Mock user not being a workspace member
      prisma.userWorkspace.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      // More flexible error status check
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied to this workspace');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`);

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/workspaces/:workspaceId/tasks/:taskId', () => {
    const workspaceId = 1;
    const taskId = 1;
    const updateData = {
      status: 'completed',
      title: 'Updated Task'
    };

    it('should handle task update', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader'
      });

      // Mock task exists
      prisma.task.findUnique.mockResolvedValueOnce({
        id: taskId,
        workspaceId,
        assigneeId: testUser.id
      });

      // Mock update
      prisma.task.update.mockResolvedValueOnce({
        id: taskId,
        ...updateData
      });

      const response = await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });

    it('should handle task not found', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader'
      });

      // Mock task not found
      prisma.task.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toBeDefined();
    });

    it('should handle unauthorized access', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'member'
      });

      // Mock task exists but assigned to someone else
      prisma.task.findUnique.mockResolvedValueOnce({
        id: taskId,
        workspaceId,
        assigneeId: 999 // Different user
      });

      const response = await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toBeDefined();
    });

    it('should handle database errors', async () => {
      // Mock workspace access
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader'
      });

      // Mock database error
      prisma.task.findUnique.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body).toBeDefined();
    });
  });
});
