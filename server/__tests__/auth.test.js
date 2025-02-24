const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { app } = require('../index');
const prisma = require('../prisma-client');

jest.mock('../prisma-client', () => ({
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
}));

describe('Authentication Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    const signupData = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    };

    it('should create a new user successfully', async () => {
      const hashedPassword = await bcrypt.hash(signupData.password, 10);
      prisma.user.create.mockResolvedValue({
        id: 1,
        email: signupData.email,
        username: signupData.username,
        password: hashedPassword,
      });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(signupData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', signupData.email);
      expect(response.body.user).toHaveProperty('username', signupData.username);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return error for existing email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: signupData.email });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(signupData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash(loginData.password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: loginData.email,
        password: hashedPassword,
        username: 'testuser',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', loginData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return error for invalid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });
});
