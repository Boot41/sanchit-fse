const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { isAuth } = require('../middleware/auth');
const { Groq } = require('groq-sdk');

const prisma = new PrismaClient();
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Create task from natural language
router.post('/workspaces/:workspaceId/tasks/create-from-prompt', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { prompt } = req.body;
    const userId = req.user.id;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Check if user is a member of the workspace
    const userWorkspace = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: parseInt(workspaceId)
        }
      }
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Get workspace members for validation
    const workspaceMembers = await prisma.userWorkspace.findMany({
      where: { workspaceId: parseInt(workspaceId) },
      include: { user: true }
    });

    const systemMessage = `You are a task creation assistant. Extract task information from the user's prompt and respond in JSON format.
Follow these rules:
1. Title should be concise (2-5 words) and action-oriented
2. If someone is mentioned with "remind" or "tell", they should be identified as the assignee
3. Any dates mentioned should be set as the due date
4. Extract relevant labels from the context

Example:
User: "remind rob to drink water"
Response: {
  "title": "Drink water",
  "description": "Reminder to drink water",
  "assigneeName": "rob",
  "dueDate": null,
  "labels": ["reminder", "health"]
}

Current prompt: "${prompt}"`;

    let parsedTask;
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemMessage
          }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" }
      });

      const response = chatCompletion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI');
      }
      
      parsedTask = JSON.parse(response);
      if (!parsedTask.title) {
        throw new Error('AI response missing required title field');
      }
    } catch (error) {
      console.error('AI processing error:', error);
      return res.status(500).json({ 
        error: 'Failed to process task with AI',
        details: error.message
      });
    }

    // Find assignee by username
    let assigneeId = userId; // Default to creator
    if (parsedTask.assigneeName) {
      const assignee = workspaceMembers.find(
        member => member.user.username.toLowerCase() === parsedTask.assigneeName.toLowerCase()
      );
      if (assignee) {
        assigneeId = assignee.userId;
      }
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        title: parsedTask.title,
        description: parsedTask.description || null,
        dueDate: parsedTask.dueDate ? new Date(parsedTask.dueDate) : null,
        labels: parsedTask.labels || [],
        assigneeId: assigneeId,
        workspaceId: parseInt(workspaceId),
        status: "pending"
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    // Get io instance and emit event
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace_${workspaceId}`).emit('task_created', { task });
    } else {
      console.warn('Socket.io instance not found');
    }

    res.json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create task',
      details: error.message
    });
  }
});

// Get workspace tasks
router.get('/workspaces/:workspaceId/tasks', isAuth, async (req, res) => {
  try {
    const workspaceId = parseInt(req.params.workspaceId);
    const userId = req.user.id;

    // Check workspace access
    const userWorkspace = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const tasks = await prisma.task.findMany({
      where: { workspaceId },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Update task progress
router.patch('/workspaces/:workspaceId/tasks/:taskId', isAuth, async (req, res) => {
  try {
    const workspaceId = parseInt(req.params.workspaceId);
    const taskId = parseInt(req.params.taskId);
    const userId = req.user.id;
    const { progress } = req.body;

    // Verify workspace membership
    const userWorkspace = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Check if task exists and belongs to the workspace
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Task does not belong to this workspace' });
    }

    // Update task
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { progress },
    });

    // Emit task_updated event
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace_${workspaceId}`).emit('task_updated', { task });
    }

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ 
      error: 'Failed to update task',
      details: error.message
    });
  }
});

module.exports = router;
