const redis = require('../redis-client');

// Example: Caching user data
async function getUserFromCache(userId) {
  try {
    // Try to get user from cache
    const cachedUser = await redis.get(`user:${userId}`);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }
    return null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

async function cacheUser(user) {
  try {
    // Cache user data for 1 hour (3600 seconds)
    await redis.setex(`user:${user.id}`, 3600, JSON.stringify(user));
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

// Example: Rate limiting
async function checkRateLimit(userId, limit = 100, windowSec = 3600) {
  const key = `ratelimit:${userId}`;
  try {
    let requests = await redis.incr(key);
    if (requests === 1) {
      await redis.expire(key, windowSec);
    }
    return requests <= limit;
  } catch (error) {
    console.error('Rate limit error:', error);
    return true; // Allow request on error
  }
}

module.exports = {
  getUserFromCache,
  cacheUser,
  checkRateLimit
};
