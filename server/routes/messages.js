const express = require('express');
const router = express.Router();
const prisma = require('../prisma-client');
const { isAuth } = require('../middleware/auth');

// Get messages for a workspace
router.get('/api/workspaces/:workspaceId/messages', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Check if user is a member of the workspace
    const membership = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: req.user.id
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.workspaceMessage.findMany({
      where: {
        workspaceId: parseInt(workspaceId)
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new message
router.post('/api/workspaces/:workspaceId/messages', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { content } = req.body;

    // Check if user is a member of the workspace
    const membership = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: req.user.id
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = await prisma.workspaceMessage.create({
      data: {
        content,
        workspaceId: parseInt(workspaceId),
        senderId: req.user.id
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    res.json(message);
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

module.exports = router;
