const request = require('supertest');
const { app } = require('../index');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock Groq
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
                assignee: "rob",
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

// Mock Prisma
jest.mock('../prisma-client');
const prisma = require('../prisma-client');

describe('Tasks API Tests', () => {
  let testUser;
  let authToken;
  let authHeader;

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

  describe('POST /api/tasks/workspaces/:workspaceId/tasks/create-from-prompt', () => {
    const workspaceId = 1;
    const prompt = 'Create a task to remind me to drink water';

    it('should create a task from prompt successfully', async () => {
      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });

      // Mock workspace members
      prisma.userWorkspace.findMany.mockResolvedValueOnce([
        {
          user: {
            id: 2,
            username: 'rob',
          },
        },
      ]);

      // Mock task creation
      const mockTask = {
        id: 1,
        title: 'Drink water',
        description: 'Stay hydrated',
        assigneeId: 2,
        dueDate: new Date('2024-03-01'),
        labels: ['health'],
      };
      prisma.task.create.mockResolvedValueOnce(mockTask);

      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Drink water');
      expect(response.body.description).toBe('Stay hydrated');
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .set('Authorization', authHeader)
        .send({ prompt });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post(`/api/tasks/workspaces/${workspaceId}/tasks/create-from-prompt`)
        .send({ prompt });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/tasks/workspaces/:workspaceId/tasks', () => {
    const workspaceId = 1;

    it('should get tasks successfully', async () => {
      const mockTasks = [
        {
          id: 1,
          title: 'Test Task',
          description: 'Test Description',
          progress: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'member',
      });

      prisma.task.findMany.mockResolvedValueOnce(mockTasks);

      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].title).toBe('Test Task');
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`);

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/tasks/workspaces/:workspaceId/tasks/:taskId', () => {
    const workspaceId = 1;
    const taskId = 1;
    const updateData = {
      progress: 50,
    };

    it('should update task progress successfully', async () => {
      const mockTask = {
        id: taskId,
        title: 'Test Task',
        description: 'Test Description',
        progress: updateData.progress,
        workspaceId,
      };

      // Mock workspace membership with leader role
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock task existence check
      prisma.task.findUnique.mockResolvedValueOnce({
        id: taskId,
        workspaceId,
      });

      prisma.task.update.mockResolvedValueOnce(mockTask);

      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.progress).toBe(updateData.progress);
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if task not found', async () => {
      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock task not found
      prisma.task.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 if task belongs to different workspace', async () => {
      // Mock workspace membership
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({ 
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock task from different workspace
      prisma.task.findUnique.mockResolvedValueOnce({
        id: taskId,
        workspaceId: workspaceId + 1,
      });

      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .send(updateData);

      expect(response.status).toBe(401);
    });
  });
});
