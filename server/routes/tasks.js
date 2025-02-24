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

    let parsedTask;
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a task parser that extracts structured information from natural language prompts.

Follow these rules:
1. Title should be concise (2-5 words) and action-oriented
2. If someone is mentioned with "remind" or "tell", they should be identified as the assignee
3. Any dates mentioned should be set as the due date in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
4. Extract relevant labels from the context

Example:
User: "remind rob to drink water tomorrow"
Response: {
  "title": "Drink water",
  "description": "Reminder to drink water",
  "assigneeName": "rob",
  "dueDate": "2025-02-26T00:00:00.000Z",
  "labels": ["reminder", "health"]
}

Current prompt: "${prompt}"`
          }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI');
      }

      console.log('AI Response:', response);
      parsedTask = JSON.parse(response);
      console.log('Parsed Task:', parsedTask);
      if (!parsedTask.title) {
        throw new Error('AI response missing required title field');
      }
    } catch (error) {
      console.error('AI processing error:', error);
      return res.status(400).json({ 
        error: 'Failed to process task with AI',
        details: error.message
      });
    }

    // Find assignee by username if specified
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
    try {
      const task = await prisma.task.create({
        data: {
          title: parsedTask.title,
          description: parsedTask.description || '',
          assigneeId,
          workspaceId: parseInt(workspaceId),
          dueDate: parsedTask.dueDate ? new Date(parsedTask.dueDate) : null,
          labels: parsedTask.labels || [],
          status: "pending",
          progress: "tasks"
        },
        include: {
          assignee: true,
          workspace: true
        }
      });

      // Emit socket event if io is available
      if (req.io) {
        req.io.to(`workspace_${workspaceId}`).emit('task_created', { task });
      }

      return res.status(201).json({ 
        task,
        message: 'Task created successfully'
      });
    } catch (error) {
      console.error('Database error:', error);
      return res.status(400).json({ 
        error: 'Failed to create task',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get tasks
router.get('/workspaces/:workspaceId/tasks', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const tasks = await prisma.task.findMany({
      where: { workspaceId: parseInt(workspaceId) },
      include: {
        assignee: true,
        workspace: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(tasks);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tasks',
      details: error.message
    });
  }
});

// Update task progress
router.patch('/workspaces/:workspaceId/tasks/:taskId', isAuth, async (req, res) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { progress } = req.body;

    // Verify workspace membership
    const userWorkspace = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: parseInt(workspaceId),
        },
      },
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Check if task exists and belongs to the workspace
    const existingTask = await prisma.task.findUnique({
      where: { id: parseInt(taskId) },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.workspaceId !== parseInt(workspaceId)) {
      return res.status(403).json({ error: 'Task does not belong to this workspace' });
    }

    // Update task
    const task = await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: { progress },
      include: {
        assignee: true,
        workspace: true
      }
    });

    // Emit task_updated event if io is available
    if (req.io) {
      req.io.to(`workspace_${workspaceId}`).emit('task_updated', { task });
    }

    res.json(task);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Failed to update task',
      details: error.message
    });
  }
});

// Update task details
router.put('/:taskId', isAuth, async (req, res) => {
  const { taskId } = req.params;
  const { title, description, dueDate, labels, status, progress, assigneeId } = req.body;

  try {
    // Verify task exists and user has access
    const task = await prisma.task.findUnique({
      where: { id: parseInt(taskId) },
      include: { workspace: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is a member of the workspace
    const userWorkspace = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: task.workspaceId
        }
      }
    });

    if (!userWorkspace) {
      return res.status(403).json({ error: 'Not authorized to update this task' });
    }

    const updatedTask = await prisma.task.update({
      where: {
        id: parseInt(taskId)
      },
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        labels,
        status,
        progress,
        assigneeId: assigneeId ? parseInt(assigneeId) : undefined
      },
      include: {
        assignee: true,
        workspace: true
      }
    });

    // Emit socket event if io is available
    if (req.io) {
      req.io.to(`workspace_${task.workspaceId}`).emit('task_updated', { task: updatedTask });
    }

    res.json({ 
      task: updatedTask,
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Failed to update task',
      details: error.message 
    });
  }
});

module.exports = router;
