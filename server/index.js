const express = require('express');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const workspaceRoutes = require('./routes/workspace');
const messageRoutes = require('./routes/messages');
const groqRoutes = require('./routes/groq');
const taskRoutes = require('./routes/tasks');
const { isAuth } = require('./middleware/auth');
const initializeSocket = require('./socket');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(express.json());

// CORS middleware
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));

// Initialize socket.io
app.set('io', io);
initializeSocket(io);

// Use routes
app.use('/api/workspaces', workspaceRoutes);
app.use('/', messageRoutes);
app.use('/', groqRoutes);
app.use('/', taskRoutes);

// Public routes
app.post('/signup', async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    const { email, username, password } = req.body;

    // Validate input
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword
      },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    console.log('User created successfully:', { user, token });
    res.json({ user, token });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        password: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Protected routes
app.get('/me', isAuth, (req, res) => {
  res.json({ user: req.user });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the server!' });
});

// User routes
app.get('/api/users/by-email/:email', isAuth, async (req, res) => {
  try {
    const { email } = req.params;
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Find user by email error:', error);
    res.status(500).json({ error: 'Failed to find user' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    const user = await prisma.user.create({
      data: {
        email,
        name,
      },
    });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create user' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        posts: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Post routes
app.post('/posts', async (req, res) => {
  try {
    const { title, content, authorId } = req.body;
    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId,
      },
      include: {
        author: true,
      },
    });
    res.json(post);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create post' });
  }
});

app.get('/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: true,
      },
    });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Socket.IO
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', async ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(username);
    
    // Fetch previous messages
    try {
      const messages = await prisma.workspaceMessage.findMany({
        where: { workspaceId: parseInt(roomId) },
        include: {
          sender: {
            select: {
              username: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Send previous messages to the joining user
      socket.emit('previous_messages', messages.map(msg => ({
        message: msg.content,
        username: msg.sender.username,
        timestamp: msg.createdAt
      })));
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
    
    // Broadcast to room that user joined
    io.to(roomId).emit('user_joined', {
      username,
      users: Array.from(rooms.get(roomId))
    });
  });

  socket.on('leave_room', ({ roomId, username }) => {
    socket.leave(roomId);
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(username);
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('user_left', {
          username,
          users: Array.from(rooms.get(roomId))
        });
      }
    }
  });

  socket.on('send_message', async ({ roomId, message, username }) => {
    try {
      // Store message in database
      const user = await prisma.user.findFirst({
        where: { username }
      });

      if (!user) {
        console.error('User not found:', username);
        return;
      }

      const storedMessage = await prisma.workspaceMessage.create({
        data: {
          content: message,
          workspaceId: parseInt(roomId),
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

      // Broadcast message to room
      io.to(roomId).emit('receive_message', {
        message,
        username,
        timestamp: storedMessage.createdAt
      });
    } catch (error) {
      console.error('Error storing message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
