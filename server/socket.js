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
    socket.on('join_workspace', async ({ workspaceId }) => {
      try {
        const workspaceRoom = `workspace:${workspaceId}`;
        
        // Leave any existing workspace rooms
        const rooms = socket.rooms;
        for (const room of rooms) {
          if (room.startsWith('workspace:') && room !== workspaceRoom) {
            socket.leave(room);
            console.log(`User ${socket.user.userId} left room ${room}`);
          }
        }
        
        // Join the new room
        await socket.join(workspaceRoom);
        console.log(`User ${socket.user.userId} joined workspace ${workspaceId}`);
        
        // Store user in Redis with workspace info
        const userInfo = {
          userId: socket.user.userId,
          socketId: socket.id,
          workspaceId: workspaceId,
          joinedAt: Date.now()
        };
        
        await redis.hset(
          'workspace_users',
          socket.id,
          JSON.stringify(userInfo)
        );
        
        // Get all sockets in the room
        const socketsInRoom = await io.in(workspaceRoom).allSockets();
        console.log(`Sockets in room ${workspaceRoom}:`, Array.from(socketsInRoom));
        
        // Get all users in the workspace
        const allUsers = await redis.hgetall('workspace_users');
        const workspaceUsers = Object.values(allUsers)
          .map(u => JSON.parse(u))
          .filter(u => u.workspaceId === workspaceId);
        
        console.log(`Users in workspace ${workspaceId}:`, workspaceUsers);
        
        // Notify all clients in the workspace
        io.to(workspaceRoom).emit('workspace_users', workspaceUsers);
      } catch (error) {
        console.error('Error joining workspace:', error);
      }
    });

    // Leave a workspace
    socket.on('leave_workspace', async ({ workspaceId }) => {
      const workspaceRoom = `workspace:${workspaceId}`;
      socket.leave(workspaceRoom);
      await redis.hdel(workspaceRoom, socket.id);
      
      const users = await redis.hgetall(workspaceRoom);
      io.to(workspaceRoom).emit('workspace_users', Object.values(users));
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
        const room = `workspace:${workspaceId}`;
        
        // Verify the socket is in the room
        const rooms = Array.from(socket.rooms);
        console.log(`Socket ${socket.id} is in rooms:`, rooms);
        
        if (!rooms.includes(room)) {
          console.log(`Socket ${socket.id} is not in room ${room}, rejoining...`);
          await socket.join(room);
        }
        
        // Get all sockets in the room
        const socketsInRoom = await io.in(room).allSockets();
        console.log(`Broadcasting message to ${socketsInRoom.size} clients in room ${room}`);
        
        // Broadcast to all clients in the room except the sender
        socket.to(room).emit('workspace_message', {
          ...message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.user.username);
      
      // Clean up Redis for all rooms
      const rooms = await redis.keys('room:*');
      for (const room of rooms) {
        await redis.hdel(room, socket.id);
        const users = await redis.hgetall(room);
        io.to(room.replace('room:', '')).emit('room_users', Object.values(users));
      }

      // Clean up Redis for all workspaces
      const workspaces = await redis.keys('workspace:*');
      for (const workspace of workspaces) {
        await redis.hdel(workspace, socket.id);
        const users = await redis.hgetall(workspace);
        io.to(workspace).emit('workspace_users', Object.values(users));
      }
    });
  });
}

module.exports = initializeSocket;
