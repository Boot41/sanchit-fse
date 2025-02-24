import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '../styles/aichat.css';

// Create axios instance with base URL and auth header
const api = axios.create({
  baseURL: 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AiChatBox = ({ workspaceId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceContext, setWorkspaceContext] = useState(null);
  const [isContextLoading, setIsContextLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const [mode, setMode] = useState('chat'); // 'chat' or 'task'

  // Fetch workspace context when workspace changes
  useEffect(() => {
    const fetchWorkspaceContext = async () => {
      setIsContextLoading(true);
      try {
        // Fetch workspace details with all related data
        const workspaceRes = await api.get(`/api/workspaces/${workspaceId}`);
        const workspace = workspaceRes.data;
        console.log('Workspace data:', workspace);

        if (!workspace) {
          throw new Error('Workspace not found');
        }

        // Format active members
        const activeMembers = (workspace.members || [])
          .filter(m => m?.username)
          .map(m => ({
            username: m.username,
            role: m.role || 'member'
          }));

        // Format recent messages with sender info
        const recentMessages = (workspace.recentMessages || [])
          .filter(m => m?.content && m?.sender?.username)
          .map(m => ({
            content: m.content,
            username: m.sender.username,
            timestamp: new Date(m.createdAt).toLocaleString()
          }));

        // Format active tasks with details
        const activeTasks = (workspace.tasks || [])
          .filter(t => t?.status !== 'completed' && t?.title)
          .map(t => ({
            title: t.title,
            description: t.description || '',
            status: t.status || 'pending',
            progress: t.progress || 'tasks',
            assignee: t.assignee?.username || 'Unassigned',
            dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No due date'
          }));

        // Generate system message with detailed workspace context
        const systemMessage = `You are an AI assistant for the workspace "${workspace.name || 'Unnamed'}". Your role is to help manage and coordinate activities in this workspace.

Workspace Details:
- Name: ${workspace.name || 'Unnamed'}
- Purpose: ${workspace.purpose || 'Not specified'}
- Created: ${workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : 'Unknown date'}
- Creator: ${workspace.creator?.username || 'Unknown'}

Team Structure (${activeMembers.length} members):
${activeMembers.length > 0 
  ? activeMembers.map(m => `- ${m.username} (${m.role})`).join('\n')
  : '- No active members'}

Current Active Tasks (${activeTasks.length} tasks):
${activeTasks.length > 0 
  ? activeTasks.map(t => 
    `- ${t.title}
  Status: ${t.status} (${t.progress})
  Due: ${t.dueDate}
  Assigned to: ${t.assignee}
  ${t.description ? `Description: ${t.description}` : ''}`
  ).join('\n\n')
  : 'No active tasks'}

Recent Discussions:
${recentMessages.length > 0 
  ? recentMessages.map(m => `[${m.timestamp}] ${m.username}: ${m.content}`).join('\n')
  : 'No recent messages'}

Instructions:
1. Provide workspace-specific assistance based on the purpose: "${workspace.purpose || 'General collaboration'}"
2. Reference team members by their roles when suggesting task assignments
3. Consider existing tasks and their status when providing recommendations
4. Keep track of ongoing discussions and their context
5. Help maintain workspace organization and task management

Please provide assistance while keeping this detailed workspace context in mind.`;

        console.log('Setting workspace context:', systemMessage);
        setWorkspaceContext(systemMessage);
      } catch (error) {
        console.error('Error fetching workspace context:', error);
        // Set a basic context if we can't get the workspace details
        const basicContext = `You are an AI assistant helping with workspace tasks and questions. ${
          workspaceId ? 'This workspace exists but we couldn\'t fetch its details.' : 'No workspace is currently selected.'
        } Please provide general assistance.`;
        setWorkspaceContext(basicContext);
      } finally {
        setIsContextLoading(false);
      }
    };

    if (workspaceId) {
      fetchWorkspaceContext();
    } else {
      setIsContextLoading(false);
      setWorkspaceContext('You are an AI assistant. No workspace is currently selected. Please provide general assistance.');
    }

    setMessages([{
      role: 'assistant',
      content: 'Hello! How can I help you today? I\'m your workspace assistant and I\'ll help you with any questions or tasks you have.'
    }]);
    setConversationId(null);
    setInput('');
    setIsLoading(false);
  }, [workspaceId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText) => {
    setIsLoading(true);
    try {
      let response;
      const userMessage = { role: 'user', content: messageText };
      
      if (!conversationId) {
        // Start new conversation
        response = await api.post('/api/groq/conversations', {
          initialMessage: messageText,
          systemMessage: workspaceContext
        });
        
        setConversationId(response.data.conversationId);
        
        // Update messages with both user message and assistant response
        const assistantMessage = response.data.messages.find(m => m.role === 'assistant');
        if (assistantMessage) {
          setMessages(prev => [...prev, userMessage, assistantMessage]);
        }
      } else {
        // Continue existing conversation
        response = await api.post(`/api/groq/conversations/${conversationId}/messages`, {
          message: messageText
        });
        
        // Update messages with both user message and assistant response
        const assistantMessage = response.data.messages.find(m => m.role === 'assistant');
        if (assistantMessage) {
          setMessages(prev => [...prev, userMessage, assistantMessage]);
        }
      }
      
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send message';
      setMessages(prev => [
        ...prev,
        userMessage,
        {
          role: 'system',
          content: `Error: ${errorMessage}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isContextLoading) return;

    const userMessage = input;
    setInput('');
    
    // Add user message immediately
    setIsLoading(true);

    try {
      if (mode === 'chat') {
        await sendMessage(userMessage);
      } else {
        // Create task
        const response = await api.post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`, {
          prompt: userMessage
        });
        
        if (response.data.error) {
          throw new Error(response.data.error);
        }
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Task created successfully!\n\nTitle: ${response.data.task.title}\nDescription: ${response.data.task.description || 'N/A'}\nDue Date: ${response.data.task.dueDate || 'Not set'}\nAssigned to: ${response.data.task.assignee.username}`
        }]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'An unexpected error occurred';
      const errorDetails = error.response?.data?.details ? `\n\nDetails: ${error.response.data.details}` : '';
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errorMessage}${errorDetails}\n\nPlease try again.`
      }]);
    }

    setIsLoading(false);
  };

  const toggleMode = () => {
    setMode(mode === 'chat' ? 'task' : 'chat');
    setMessages([{
      role: 'assistant',
      content: mode === 'chat' 
        ? 'I\'ll help you create a task. Just describe what needs to be done!'
        : 'Hello! How can I help you today?'
    }]);
    setConversationId(null);
  };

  return (
    <div className="ai-chat-section">
      <h3>AI Assistant</h3>
      <div className="mode-toggle">
        <button 
          className={mode === 'chat' ? 'active' : ''} 
          onClick={() => mode !== 'chat' && toggleMode()}
        >
          Chat
        </button>
        <button 
          className={mode === 'task' ? 'active' : ''} 
          onClick={() => mode !== 'task' && toggleMode()}
        >
          Create Task
        </button>
      </div>

      <div className="ai-chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {(isLoading || isContextLoading) && (
          <div className="message assistant">
            <div className="message-content">{isContextLoading ? "Loading workspace context..." : "Thinking..."}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isContextLoading ? "Loading workspace context..." : (mode === 'chat' ? "Ask anything..." : "Describe your task...")}
          disabled={isContextLoading}
        />
        <button onClick={handleSend} disabled={isLoading || isContextLoading}>
          Send
        </button>
      </div>
    </div>
  );
};

export default AiChatBox;
