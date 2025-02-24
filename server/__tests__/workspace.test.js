const request = require('supertest');
const { app } = require('../index');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock Prisma
jest.mock('../prisma-client');
const prisma = require('../prisma-client');

describe('Workspace API Tests', () => {
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

  describe('POST /api/workspaces', () => {
    const workspaceData = {
      name: 'Test Workspace',
      purpose: 'Testing',
    };

    it('should create a new workspace successfully', async () => {
      const mockWorkspace = {
        id: 1,
        name: workspaceData.name,
        purpose: workspaceData.purpose,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUserWorkspace = {
        userId: testUser.id,
        workspaceId: mockWorkspace.id,
        role: 'leader',
        workspace: mockWorkspace,
      };

      // Mock transaction to return userWorkspace result
      prisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prisma);
        }
        return mockUserWorkspace;
      });

      prisma.workspace.create.mockResolvedValue(mockWorkspace);
      prisma.userWorkspace.create.mockResolvedValue(mockUserWorkspace);

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', authHeader)
        .send(workspaceData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspace');
      expect(response.body.workspace.name).toBe(workspaceData.name);
      expect(response.body.role).toBe('leader');
    });

    it('should return 400 if workspace name is missing', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', authHeader)
        .send({ purpose: 'Testing' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .send(workspaceData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/workspaces', () => {
    it('should get user workspaces successfully', async () => {
      const mockWorkspaces = [
        {
          workspace: {
            id: 1,
            name: 'Workspace 1',
            purpose: 'Testing',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          role: 'leader',
        },
      ];

      prisma.userWorkspace.findMany.mockResolvedValue(mockWorkspaces);

      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].workspace.name).toBe('Workspace 1');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get('/api/workspaces');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/workspaces/:workspaceId/members', () => {
    const workspaceId = 1;
    const newMemberId = 2;

    it('should add a new member successfully', async () => {
      // Mock workspace leader check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock existing member check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      // Mock new member
      const mockNewMember = {
        id: newMemberId,
        username: 'newuser',
        email: 'new@example.com',
      };
      prisma.user.findUnique.mockResolvedValueOnce(mockNewMember);

      // Mock userWorkspace creation
      const mockUserWorkspace = {
        userId: newMemberId,
        workspaceId,
        role: 'member',
        user: mockNewMember,
      };
      prisma.userWorkspace.create.mockResolvedValueOnce(mockUserWorkspace);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', authHeader)
        .send({ userId: newMemberId });

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(newMemberId);
      expect(response.body.role).toBe('member');
    });

    it('should return 403 if user is not a workspace leader', async () => {
      // Mock workspace membership check - user is member but not leader
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', authHeader)
        .send({ userId: newMemberId });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if user to add not found', async () => {
      // Mock workspace leader check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock existing member check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      // Mock user not found
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', authHeader)
        .send({ userId: newMemberId });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .send({ userId: newMemberId });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/workspaces/:workspaceId/members/:userId', () => {
    const workspaceId = 1;
    const memberIdToRemove = 2;

    it('should remove a member successfully', async () => {
      // Mock workspace leader check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock member existence
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: memberIdToRemove,
        workspaceId,
        role: 'member',
      });

      // Mock member removal
      prisma.userWorkspace.delete.mockResolvedValueOnce({
        userId: memberIdToRemove,
        workspaceId,
      });

      const response = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${memberIdToRemove}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 403 if user is not a workspace leader', async () => {
      // Mock workspace membership check - user is member but not leader
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${memberIdToRemove}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if member to remove not found', async () => {
      // Mock workspace leader check
      prisma.userWorkspace.findFirst.mockResolvedValueOnce({
        userId: testUser.id,
        workspaceId,
        role: 'leader',
      });

      // Mock member not found
      prisma.userWorkspace.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${memberIdToRemove}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${memberIdToRemove}`);

      expect(response.status).toBe(401);
    });
  });
});
