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
    findUnique: jest.fn(),
  },
  task: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}));

describe('Tasks API Tests', () => {
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

  describe('GET /api/tasks/workspaces/:workspaceId/tasks', () => {
    it('should get workspace tasks successfully', async () => {
      const mockTasks = [
        {
          id: 1,
          title: 'Test task',
          description: 'Test description',
          status: 'TODO',
          workspaceId,
          assigneeId: testUser.id,
          createdAt: new Date(),
          dueDate: new Date(),
          assignee: {
            id: testUser.id,
            username: testUser.username,
          },
        },
      ];

      // Mock workspace membership
      prisma.userWorkspace.findUnique.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'member'
      });
      prisma.task.findMany.mockResolvedValue(mockTasks);

      const response = await request(app)
        .get(`/api/tasks/workspaces/${workspaceId}/tasks`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].title).toBe('Test task');
      expect(response.body[0].assignee.username).toBe(testUser.username);
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValue(null);

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
    const taskId = 1;
    const updateData = {
      progress: 50,
    };

    it('should update task progress successfully', async () => {
      const mockTask = {
        id: taskId,
        workspaceId,
        title: 'Test task',
        progress: updateData.progress,
      };

      // Mock workspace membership with leader role
      prisma.userWorkspace.findUnique.mockResolvedValue({ 
        userId: testUser.id,
        workspaceId,
        role: 'leader'
      });
      prisma.task.update.mockResolvedValue(mockTask);

      const response = await request(app)
        .patch(`/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Authorization', authHeader)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.progress).toBe(updateData.progress);
    });

    it('should return 403 if user is not a workspace member', async () => {
      prisma.userWorkspace.findUnique.mockResolvedValue(null);

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
