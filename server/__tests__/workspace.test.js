const request = require('supertest');
const { app } = require('../index');
const prisma = require('../prisma-client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../prisma-client', () => ({
  user: {
    findUnique: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
  },
  userWorkspace: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
}));

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

      prisma.workspace.create.mockResolvedValue(mockWorkspace);
      prisma.userWorkspace.create.mockResolvedValue({
        userId: testUser.id,
        workspaceId: mockWorkspace.id,
        role: 'leader',
      });

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
});
