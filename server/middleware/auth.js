const jwt = require('jsonwebtoken');
const prisma = require('../prisma-client');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const isAuth = async (req, res, next) => {
  try {
    console.log('Auth middleware - headers:', req.headers);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware - No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('Auth middleware - token:', token);
    
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Auth middleware - decoded:', decoded);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, username: true }
    });
    console.log('Auth middleware - user:', user);

    if (!user) {
      console.log('Auth middleware - User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('Auth middleware - Error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  isAuth
};
