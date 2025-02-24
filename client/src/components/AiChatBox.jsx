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

const AiChatBox = ({ workspaceId, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [mode, setMode] = useState('chat'); // 'chat' or 'task'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages([
      ...messages,
      { role: 'user', content: userMessage }
    ]);
    setIsLoading(true);

    try {
      if (mode === 'chat') {
        if (!conversationId) {
          // Start new conversation
          const response = await api.post('/api/groq/conversations', {
            initialMessage: userMessage
          });
          setConversationId(response.data.conversationId);
          setMessages(response.data.messages);
        } else {
          // Continue conversation
          const response = await api.post(`/api/groq/conversations/${conversationId}/messages`, {
            message: userMessage
          });
          setMessages(response.data.messages);
        }
      } else {
        // Create task
        const response = await api.post(`/api/workspaces/${workspaceId}/tasks/create-from-prompt`, {
          prompt: userMessage
        });
        
        if (response.data.error) {
          throw new Error(response.data.error);
        }
        
        setMessages([
          ...messages,
          { role: 'assistant', content: `Task created successfully!\n\nTitle: ${response.data.task.title}\nDescription: ${response.data.task.description || 'N/A'}\nDue Date: ${response.data.task.dueDate || 'Not set'}\nAssigned to: ${response.data.task.assignee.username}` }
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'An unexpected error occurred';
      const errorDetails = error.response?.data?.details ? `\n\nDetails: ${error.response.data.details}` : '';
      
      setMessages([
        ...messages,
        { role: 'assistant', content: `Error: ${errorMessage}${errorDetails}\n\nPlease try again.` }
      ]);
    }

    setIsLoading(false);
  };

  const toggleMode = () => {
    setMode(mode === 'chat' ? 'task' : 'chat');
    setMessages([]);
    setConversationId(null);
  };

  return (
    <div className={`ai-chat-container ${isOpen ? 'open' : ''}`}>
      <button 
        className="ai-chat-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '×' : 'AI'}
      </button>

      {isOpen && (
        <div className="ai-chat-box">
          <div className="ai-chat-header">
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
          </div>

          <div className="ai-chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="message-content">Thinking...</div>
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
              placeholder={mode === 'chat' ? "Ask anything..." : "Describe your task..."}
            />
            <button onClick={handleSend} disabled={isLoading}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiChatBox;
