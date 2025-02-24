const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');

// Mock socket.io initialization
jest.mock('../socket', () => {
  return jest.fn();
});

const { app } = require('../index');

// Mock Prisma
jest.mock('../prisma-client', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  post: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  workspaceMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
}));
const prisma = require('../prisma-client');

// Mock socket.io
jest.mock('socket.io', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };

  const mockServer = {
    on: jest.fn((event, callback) => {
      if (event === 'connection') {
        callback(mockSocket);
      }
    }),
    emit: jest.fn(),
    close: jest.fn(),
  };

  return {
    Server: jest.fn(() => mockServer),
  };
});

describe('Server API Tests', () => {
  const testUser = {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    password: 'password123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/signup', () => {
      it('should create a new user successfully', async () => {
        // Mock user doesn't exist
        prisma.user.findUnique.mockResolvedValueOnce(null);

        // Mock user creation
        const hashedPassword = await bcrypt.hash(testUser.password, 10);
        prisma.user.create.mockResolvedValueOnce({
          ...testUser,
          password: hashedPassword,
        });

        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            email: testUser.email,
            password: testUser.password,
            username: testUser.username,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.email).toBe(testUser.email);
        expect(response.body.user.username).toBe(testUser.username);
        expect(response.body.user).not.toHaveProperty('password');
      });

      it('should return 400 if user already exists', async () => {
        // Mock user exists
        prisma.user.findUnique.mockResolvedValueOnce(testUser);

        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            email: testUser.email,
            password: testUser.password,
            username: testUser.username,
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'User already exists');
      });

      it('should return 500 if database error occurs', async () => {
        // Mock database error
        prisma.user.findUnique.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            email: testUser.email,
            password: testUser.password,
            username: testUser.username,
          });

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Error creating user');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login user successfully with correct credentials', async () => {
        // Mock user exists
        const hashedPassword = await bcrypt.hash(testUser.password, 10);
        prisma.user.findUnique.mockResolvedValueOnce({
          ...testUser,
          password: hashedPassword,
        });

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.email).toBe(testUser.email);
        expect(response.body.user).not.toHaveProperty('password');
      });

      it('should return 401 with incorrect password', async () => {
        // Mock user exists
        const hashedPassword = await bcrypt.hash(testUser.password, 10);
        prisma.user.findUnique.mockResolvedValueOnce({
          ...testUser,
          password: hashedPassword,
        });

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Invalid credentials');
      });

      it('should return 401 if user not found', async () => {
        // Mock user not found
        prisma.user.findUnique.mockResolvedValueOnce(null);

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Invalid credentials');
      });

      it('should return 500 if database error occurs', async () => {
        // Mock database error
        prisma.user.findUnique.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Error logging in');
      });
    });
  });

  describe('API Routes', () => {
    it('should have workspace routes mounted', () => {
      expect(app._router.stack.some(layer => 
        layer.regexp.test('/api/workspaces')
      )).toBe(true);
    });

    it('should have message routes mounted', () => {
      expect(app._router.stack.some(layer => 
        layer.regexp.test('/api/messages')
      )).toBe(true);
    });

    it('should have groq routes mounted', () => {
      expect(app._router.stack.some(layer => 
        layer.regexp.test('/api/groq')
      )).toBe(true);
    });

    it('should have task routes mounted', () => {
      expect(app._router.stack.some(layer => 
        layer.regexp.test('/api/tasks')
      )).toBe(true);
    });
  });

  describe('Middleware', () => {
    it('should use JSON middleware', () => {
      expect(app._router.stack.some(layer => 
        layer.name === 'jsonParser'
      )).toBe(true);
    });

    it('should use CORS middleware', () => {
      expect(app._router.stack.some(layer => 
        layer.name === 'corsMiddleware'
      )).toBe(true);
    });
  });

  describe('User Routes', () => {
    describe('GET /me', () => {
      it('should return user data for authenticated request', async () => {
        const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'your-secret-key');
        
        prisma.user.findUnique.mockResolvedValueOnce(testUser);

        const response = await request(app)
          .get('/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('user');
      });

      it('should return 401 for unauthenticated request', async () => {
        const response = await request(app)
          .get('/me');

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/users/by-email/:email', () => {
      it('should find user by email', async () => {
        const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'your-secret-key');
        
        prisma.user.findUnique.mockResolvedValueOnce(testUser);
        prisma.user.findUnique.mockResolvedValueOnce({
          id: testUser.id,
          email: testUser.email,
          username: testUser.username
        });

        const response = await request(app)
          .get(`/api/users/by-email/${testUser.email}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('email', testUser.email);
        expect(response.body).toHaveProperty('username', testUser.username);
      });

      it('should return 404 if user not found', async () => {
        const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'your-secret-key');
        
        prisma.user.findUnique.mockResolvedValueOnce(testUser);
        prisma.user.findUnique.mockResolvedValueOnce(null);

        const response = await request(app)
          .get('/api/users/by-email/nonexistent@example.com')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'User not found');
      });

      it('should return 500 if database error occurs', async () => {
        const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'your-secret-key');
        
        prisma.user.findUnique.mockResolvedValueOnce(testUser);
        prisma.user.findUnique.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
          .get(`/api/users/by-email/${testUser.email}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Failed to find user');
      });
    });

    describe('GET /users', () => {
      it('should return all users', async () => {
        prisma.user.findMany.mockResolvedValueOnce([testUser]);

        const response = await request(app)
          .get('/users');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should return 500 if database error occurs', async () => {
        prisma.user.findMany.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
          .get('/users');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Failed to fetch users');
      });
    });

    describe('POST /users', () => {
      it('should create a new user', async () => {
        const newUser = {
          email: 'new@example.com',
          name: 'New User'
        };

        prisma.user.create.mockResolvedValueOnce(newUser);

        const response = await request(app)
          .post('/users')
          .send(newUser);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(newUser);
      });

      it('should return 400 if creation fails', async () => {
        const newUser = {
          email: 'new@example.com',
          name: 'New User'
        };

        prisma.user.create.mockRejectedValueOnce(new Error('Creation failed'));

        const response = await request(app)
          .post('/users')
          .send(newUser);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Failed to create user');
      });
    });
  });

  describe('Post Routes', () => {
    const testPost = {
      title: 'Test Post',
      content: 'Test Content',
      authorId: 1
    };

    describe('POST /posts', () => {
      it('should create a new post', async () => {
        prisma.post.create.mockResolvedValueOnce({
          ...testPost,
          id: 1,
          author: testUser
        });

        const response = await request(app)
          .post('/posts')
          .send(testPost);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('title', testPost.title);
        expect(response.body).toHaveProperty('content', testPost.content);
      });

      it('should return 400 if creation fails', async () => {
        prisma.post.create.mockRejectedValueOnce(new Error('Creation failed'));

        const response = await request(app)
          .post('/posts')
          .send(testPost);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Failed to create post');
      });
    });

    describe('GET /posts', () => {
      it('should return all posts', async () => {
        prisma.post.findMany.mockResolvedValueOnce([
          { ...testPost, id: 1, author: testUser }
        ]);

        const response = await request(app)
          .get('/posts');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should return 500 if fetch fails', async () => {
        prisma.post.findMany.mockRejectedValueOnce(new Error('Fetch failed'));

        const response = await request(app)
          .get('/posts');

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Failed to fetch posts');
      });
    });
  });

  describe('Basic Routes', () => {
    it('should return welcome message', async () => {
      const response = await request(app)
        .get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Welcome to the server!');
    });
  });

  describe('Socket.IO Integration', () => {
    let mockSocket;
    let mockHandler;
    let mockHandlers;

    beforeEach(() => {
      mockHandlers = {};
      mockSocket = {
        id: 'test-socket-id',
        handshake: {
          auth: {
            token: jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET || 'your-secret-key')
          }
        },
        on: jest.fn((event, handler) => {
          mockHandlers[event] = handler;
        }),
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn().mockReturnThis(),
        disconnect: jest.fn()
      };
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should handle user connection', () => {
      const io = new Server();
      const connectionHandler = jest.fn();
      io.on('connection', connectionHandler);
      io.emit('connection', mockSocket);

      expect(connectionHandler).toHaveBeenCalled();
    });

    it('should handle joining a room', async () => {
      const roomData = {
        roomId: '1',
        username: 'testuser'
      };

      prisma.workspaceMessage.findMany.mockResolvedValueOnce([]);
      
      const io = new Server();
      io.on('connection', (socket) => {
        socket.on('join_room', (data) => {
          socket.join(data.roomId);
          socket.to(data.roomId).emit('user_joined', {
            username: data.username,
            users: [data.username]
          });
        });
      });

      io.emit('connection', mockSocket);
      
      // Get the join_room handler and call it
      const handler = mockHandlers['join_room'];
      handler(roomData);

      expect(mockSocket.join).toHaveBeenCalledWith(roomData.roomId);
      expect(mockSocket.to).toHaveBeenCalledWith(roomData.roomId);
      expect(mockSocket.emit).toHaveBeenCalledWith('user_joined', expect.any(Object));
    });

    it('should handle leaving a room', () => {
      const roomData = {
        roomId: '1',
        username: 'testuser'
      };

      const io = new Server();
      io.on('connection', (socket) => {
        socket.on('leave_room', (data) => {
          socket.leave(data.roomId);
          socket.to(data.roomId).emit('user_left', {
            username: data.username,
            users: []
          });
        });
      });

      io.emit('connection', mockSocket);

      // Get the leave_room handler and call it
      const handler = mockHandlers['leave_room'];
      handler(roomData);

      expect(mockSocket.leave).toHaveBeenCalledWith(roomData.roomId);
      expect(mockSocket.to).toHaveBeenCalledWith(roomData.roomId);
      expect(mockSocket.emit).toHaveBeenCalledWith('user_left', expect.any(Object));
    });

    it('should handle sending messages', async () => {
      const messageData = {
        roomId: '1',
        message: 'test message',
        username: 'testuser'
      };

      prisma.user.findFirst.mockResolvedValueOnce(testUser);
      prisma.workspaceMessage.create.mockResolvedValueOnce({
        ...messageData,
        id: 1,
        createdAt: new Date(),
        sender: { username: messageData.username }
      });

      const io = new Server();
      io.on('connection', (socket) => {
        socket.on('send_message', async (data) => {
          const user = await prisma.user.findFirst({
            where: { username: data.username }
          });

          const message = await prisma.workspaceMessage.create({
            data: {
              content: data.message,
              workspaceId: parseInt(data.roomId),
              senderId: user.id
            },
            include: {
              sender: {
                select: {
                  username: true
                }
              }
            }
          });

          socket.to(data.roomId).emit('receive_message', {
            message: data.message,
            username: data.username,
            timestamp: message.createdAt
          });
        });
      });

      io.emit('connection', mockSocket);

      // Get the send_message handler and call it
      const handler = mockHandlers['send_message'];
      await handler(messageData);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { username: messageData.username }
      });
      expect(prisma.workspaceMessage.create).toHaveBeenCalled();
      expect(mockSocket.to).toHaveBeenCalledWith(messageData.roomId);
      expect(mockSocket.emit).toHaveBeenCalledWith('receive_message', expect.any(Object));
    });
  });
});
