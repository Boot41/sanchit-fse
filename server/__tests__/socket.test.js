const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis-mock');
const initializeSocket = require('../socket');

jest.mock('ioredis', () => require('ioredis-mock'));

describe('Socket.IO Tests', () => {
  let io;
  let serverSocket;
  let clientSocket;
  let httpServer;
  let redis;
  let port;
  let token;
  let testUser;

  beforeAll(() => {
    httpServer = createServer();
    io = new Server(httpServer);
    initializeSocket(io);
    port = 3001;
    httpServer.listen(port);
    redis = new Redis();

    // Create test user and token
    testUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
    };
    token = jwt.sign(
      { userId: testUser.id, username: testUser.username },
      process.env.JWT_SECRET || 'your-secret-key'
    );
  });

  afterAll(() => {
    io.close();
    httpServer.close();
    redis.disconnect();
  });

  beforeEach((done) => {
    clientSocket = new Client(`http://localhost:${port}`, {
      auth: { token },
      'force new connection': true,
    });
    
    io.on('connection', (socket) => {
      serverSocket = socket;
    });

    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Authentication', () => {
    it('should connect with valid token', (done) => {
      expect(clientSocket.connected).toBe(true);
      done();
    }, 15000);

    it('should reject connection without token', (done) => {
      const unauthSocket = new Client(`http://localhost:${port}`, {
        'force new connection': true,
      });

      unauthSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        unauthSocket.disconnect();
        done();
      });
    });
  });

  describe('Room Management', () => {
    const testRoomId = 'test-room-1';

    it('should join a room and receive room users', (done) => {
      clientSocket.emit('join_room', { roomId: testRoomId });

      clientSocket.on('room_users', (users) => {
        expect(Array.isArray(users)).toBe(true);
        expect(users).toContain(testUser.username);
        done();
      });
    });
  });

  describe('Workspace Management', () => {
    const testWorkspaceId = '123';

    it('should join a workspace', (done) => {
      clientSocket.emit('join_workspace', testWorkspaceId);
      
      // Wait a bit to ensure the join operation completes
      setTimeout(() => {
        expect(Array.from(serverSocket.rooms)).toContain(`workspace_${testWorkspaceId}`);
        done();
      }, 100);
    });

    it('should leave a workspace', (done) => {
      // First join the workspace
      clientSocket.emit('join_workspace', testWorkspaceId);

      setTimeout(() => {
        // Then leave
        clientSocket.emit('leave_workspace', testWorkspaceId);
        
        // Check if socket left the room
        setTimeout(() => {
          expect(Array.from(serverSocket.rooms)).not.toContain(`workspace_${testWorkspaceId}`);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Messaging', () => {
    const testRoomId = 'test-room-2';
    const testMessage = {
      content: 'Hello, World!',
      type: 'text',
    };

    it('should broadcast chat messages to room', (done) => {
      clientSocket.emit('join_room', { roomId: testRoomId });

      // Create a second client to receive the message
      const clientSocket2 = new Client(`http://localhost:${port}`, {
        auth: { token },
        'force new connection': true,
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('join_room', { roomId: testRoomId });

        setTimeout(() => {
          // Send message from first client
          clientSocket.emit('chat_message', {
            roomId: testRoomId,
            message: testMessage,
          });
        }, 100);
      });

      clientSocket2.on('chat_message', (message) => {
        expect(message.content).toBe(testMessage.content);
        expect(message.sender).toBe(testUser.username);
        clientSocket2.disconnect();
        done();
      });
    });

    it('should broadcast workspace messages', (done) => {
      const workspaceId = '456';
      
      clientSocket.emit('join_workspace', workspaceId);

      // Create a second client to receive the message
      const clientSocket2 = new Client(`http://localhost:${port}`, {
        auth: { token },
        'force new connection': true,
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('join_workspace', workspaceId);

        setTimeout(() => {
          // Send message from first client
          clientSocket.emit('workspace_message', {
            workspaceId,
            message: testMessage,
          });
        }, 100);
      });

      clientSocket2.on('workspace_message', (message) => {
        expect(message.content).toBe(testMessage.content);
        expect(message.timestamp).toBeDefined();
        clientSocket2.disconnect();
        done();
      });
    });
  });
});
