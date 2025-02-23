const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { isAuth } = require('../middleware/auth');
const { Groq } = require('groq-sdk');

const prisma = new PrismaClient();
const groq = new Groq();
groq.apiKey = process.env.GROQ_API_KEY;

// Create task from natural language
router.post('/api/workspaces/:workspaceId/tasks/create-from-prompt', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { prompt } = req.body;
    const userId = req.user.id;

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

    const memberIds = workspaceMembers.map(member => member.userId);

    // Define the task schema
    const taskSchema = {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (required)" },
        description: { type: "string", description: "Detailed task description" },
        dueDate: { type: "string", description: "Due date in ISO format (YYYY-MM-DD)" },
        labels: { 
          type: "array", 
          items: { type: "string" },
          description: "List of labels/tags for the task"
        },
        assigneeId: { 
          type: "number",
          description: "User ID of the assignee (must be a workspace member)",
          enum: memberIds
        }
      },
      required: ["title"]
    };

    const systemMessage = `You are a task creation assistant that responds in JSON format. Create a task based on the user's prompt.
The task must follow this schema: ${JSON.stringify(taskSchema)}
Available workspace member IDs are: ${memberIds.join(', ')}
If no specific assignee is mentioned, assign to the creator (ID: ${userId}).
If no due date is specified, leave it null.
If no labels are specified, provide an empty array.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" }
    });

    const response = chatCompletion.choices[0]?.message?.content;
    const taskData = JSON.parse(response);

    // Validate assigneeId is a workspace member
    if (taskData.assigneeId && !memberIds.includes(taskData.assigneeId)) {
      return res.status(400).json({ 
        error: 'Invalid assignee ID. Assignee must be a workspace member.' 
      });
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description || null,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        labels: taskData.labels || [],
        assigneeId: taskData.assigneeId || userId,
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
router.get('/api/workspaces/:workspaceId/tasks', isAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    // Check workspace access
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

    const tasks = await prisma.task.findMany({
      where: { workspaceId: parseInt(workspaceId) },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

module.exports = router;
