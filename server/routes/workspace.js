const express = require('express');
const router = express.Router();
const prisma = require('../prisma-client');
const { isAuth } = require('../middleware/auth');

// Create a new workspace
router.post('/', isAuth, async (req, res) => {
  try {
    const { name, purpose } = req.body;
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
          purpose: purpose || "General Workspace",
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
        workspace: {
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
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

// Get a single workspace
router.get('/:workspaceId', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Get workspace with all related data
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: parseInt(workspaceId)
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10,
          include: {
            sender: {
              select: {
                id: true,
                username: true
              }
            }
          }
        },
        tasks: {
          include: {
            assignee: {
              select: {
                id: true,
                username: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user is a member
    const userMembership = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: req.user.id
      }
    });

    if (!userMembership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Transform the data to match the expected structure
    const response = {
      id: workspace.id,
      name: workspace.name,
      purpose: workspace.purpose,
      createdAt: workspace.createdAt,
      creator: workspace.creator,
      members: workspace.members.map(m => ({
        id: m.user.id,
        username: m.user.username,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      recentMessages: workspace.messages.map(m => ({
        id: m.id,
        content: m.content,
        sender: m.sender,
        createdAt: m.createdAt
      })),
      tasks: workspace.tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        progress: t.progress,
        dueDate: t.dueDate,
        assignee: t.assignee
      }))
    };

    console.log('Workspace response:', response);
    res.json(response);
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Failed to fetch workspace' });
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

    // Check if the user exists
    const userExists = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMember = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: parseInt(userId),
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this workspace' });
    }

    // Add the new member
    const userWorkspace = await prisma.userWorkspace.create({
      data: {
        userId: parseInt(userId),
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

// Remove a member from a workspace
router.delete('/:workspaceId/members/:userId', isAuth, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const requestingUserId = req.user.id;

    // Check if the requesting user is a leader
    const requesterRole = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: requestingUserId,
        role: 'leader',
      },
    });

    if (!requesterRole) {
      return res.status(403).json({ error: 'Only workspace leaders can remove members' });
    }

    // Check if member exists
    const memberToRemove = await prisma.userWorkspace.findFirst({
      where: {
        workspaceId: parseInt(workspaceId),
        userId: parseInt(userId),
      },
    });

    if (!memberToRemove) {
      return res.status(404).json({ error: 'Member not found in workspace' });
    }

    // Remove the member
    await prisma.userWorkspace.delete({
      where: {
        userId_workspaceId: {
          userId: parseInt(userId),
          workspaceId: parseInt(workspaceId),
        },
      },
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member from workspace' });
  }
});

module.exports = router;
