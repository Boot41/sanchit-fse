const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function initializeSocket(io) {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.userId) {
        return next(new Error('Authentication error: Invalid token'));
      }

      socket.user = decoded;
      console.log('Socket authenticated for user:', decoded.userId);
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: ' + error.message));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.user.username);

    // Join a room
    socket.on('join_room', async ({ roomId }) => {
      socket.join(roomId);
      await redis.hset(`room:${roomId}`, socket.id, socket.user.username);
      
      const users = await redis.hgetall(`room:${roomId}`);
      io.to(roomId).emit('room_users', Object.values(users));
    });

    // Leave a room
    socket.on('leave_room', async ({ roomId }) => {
      socket.leave(roomId);
      await redis.hdel(`room:${roomId}`, socket.id);
      
      const users = await redis.hgetall(`room:${roomId}`);
      io.to(roomId).emit('room_users', Object.values(users));
    });

    // Join a workspace
    socket.on('join_workspace', async (workspaceId) => {
      const room = `workspace_${workspaceId}`;
      socket.join(room);
      console.log(`User ${socket.user.username} joined workspace ${workspaceId}`);
    });

    // Leave a workspace
    socket.on('leave_workspace', async (workspaceId) => {
      const room = `workspace_${workspaceId}`;
      socket.leave(room);
      console.log(`User ${socket.user.username} left workspace ${workspaceId}`);
    });

    // Handle chat message
    socket.on('chat_message', ({ roomId, message }) => {
      io.to(roomId).emit('chat_message', {
        ...message,
        sender: socket.user.username
      });
    });

    // Handle workspace message
    socket.on('workspace_message', async ({ workspaceId, message }) => {
      try {
        const room = `workspace_${workspaceId}`;
        
        // Verify the socket is in the room
        const rooms = Array.from(socket.rooms);
        if (!rooms.includes(room)) {
          await socket.join(room);
        }
        
        // Broadcast to all clients in the room except the sender
        socket.to(room).emit('workspace_message', {
          ...message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    });

    // Handle task updates
    socket.on('task_update', async ({ workspaceId, task }) => {
      try {
        const room = `workspace_${workspaceId}`;
        
        // Verify the socket is in the room
        const rooms = Array.from(socket.rooms);
        if (!rooms.includes(room)) {
          await socket.join(room);
        }
        
        // Broadcast to all clients in the room except the sender
        socket.to(room).emit('task_updated', { task });
      } catch (error) {
        console.error('Error broadcasting task update:', error);
      }
    });

    // Handle task creation
    socket.on('task_create', async ({ workspaceId, task }) => {
      try {
        const room = `workspace_${workspaceId}`;
        
        // Verify the socket is in the room
        const rooms = Array.from(socket.rooms);
        if (!rooms.includes(room)) {
          await socket.join(room);
        }
        
        // Broadcast to all clients in the room except the sender
        socket.to(room).emit('task_created', { task });
      } catch (error) {
        console.error('Error broadcasting task creation:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.user.username);
      const rooms = [...socket.rooms];
      for (const room of rooms) {
        await redis.hdel(`room:${room}`, socket.id);
        const users = await redis.hgetall(`room:${room}`);
        io.to(room).emit('room_users', Object.values(users));
      }
    });
  });
}

module.exports = initializeSocket;
