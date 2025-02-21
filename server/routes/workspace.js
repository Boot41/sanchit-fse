const express = require('express');
const router = express.Router();
const prisma = require('../prisma-client');
const { isAuth } = require('../middleware/auth');

// Create a new workspace
router.post('/', isAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    // Create workspace and set up creator as leader in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Create the workspace
      const workspace = await prisma.workspace.create({
        data: {
          name,
          creatorId: userId,
        },
      });

      // Add creator as a leader in UserWorkspace
      const userWorkspace = await prisma.userWorkspace.create({
        data: {
          userId,
          workspaceId: workspace.id,
          role: 'leader',
        },
        include: {
          workspace: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      return userWorkspace;
    });

    res.json(result);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Get all workspaces for the current user
router.get('/', isAuth, async (req, res) => {
  try {
    const workspaces = await prisma.userWorkspace.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        workspace: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Add a member to a workspace
router.post('/:workspaceId/members', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { userId } = req.body;
    const requestingUserId = req.user.id;

    // Check if the requesting user is a leader of the workspace
    const requesterRole = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: requestingUserId,
        role: 'leader',
      },
    });

    if (!requesterRole) {
      return res.status(403).json({ error: 'Only workspace leaders can add members' });
    }

    // Check if user is already a member
    const existingMember = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId,
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this workspace' });
    }

    // Add the new member
    const userWorkspace = await prisma.userWorkspace.create({
      data: {
        userId,
        workspaceId: parseInt(workspaceId),
        role: 'member',
      },
      include: {
        workspace: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    res.json(userWorkspace);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member to workspace' });
  }
});

// Get workspace members
router.get('/:workspaceId/members', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Check if user is a member of the workspace
    const userMembership = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: req.user.id,
      },
    });

    if (!userMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await prisma.userWorkspace.findMany({
      where: {
        workspaceId: parseInt(workspaceId),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to fetch workspace members' });
  }
});

module.exports = router;
