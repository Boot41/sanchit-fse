import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import '../styles/workspaceChat.css';

function WorkspaceChat({ workspace, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const socket = useSocket();
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!socket || !workspace) return;

    const workspaceId = workspace.workspace.id;
    let mounted = true;
    
    const joinWorkspace = async () => {
      try {
        // Join the workspace room
        socket.emit('join_workspace', { workspaceId });
        
        // Load messages after joining
        if (mounted) {
          await loadMessages();
        }
      } catch (error) {
        console.error('Error joining workspace:', error);
        if (mounted) {
          setError('Failed to join workspace chat');
        }
      }
    };

    joinWorkspace();
    
    // Cleanup: leave room on unmount
    return () => {
      mounted = false;
      socket.emit('leave_workspace', { workspaceId });
    };
  }, [socket, workspace]);

  useEffect(() => {
    if (!socket || !workspace) return;

    const handleMessage = (data) => {
      console.log('Received message:', data);
      const message = data.message || data; // Handle both formats
      
      setMessages(prev => {
        // Check if message already exists
        const exists = prev.some(m => m.id === message.id);
        if (exists) return prev;
        
        // Add new message and sort by createdAt
        const newMessages = [...prev, message].sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
        
        return newMessages;
      });
      
      scrollToBottom();
    };

    // Listen for messages in this workspace
    const workspaceRoom = `workspace:${workspace.workspace.id}`;
    socket.on('workspace_message', handleMessage);
    
    // Join the workspace room
    console.log('Joining workspace room:', workspaceRoom);
    socket.emit('join_workspace', { workspaceId: workspace.workspace.id });

    return () => {
      console.log('Leaving workspace room:', workspaceRoom);
      socket.off('workspace_message', handleMessage);
      socket.emit('leave_workspace', { workspaceId: workspace.workspace.id });
    };
  }, [socket, workspace]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };



  const loadMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:4000/api/workspaces/${workspace.workspace.id}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(response.data);
    } catch (error) {
      setError('Failed to load messages');
    }
  };



  const sendMessage = async (e) => {
    e.preventDefault();
    const messageContent = newMessage.trim();
    if (!messageContent) return;

    if (!socket?.connected) {
      console.error('Socket not connected');
      setError('Connection lost. Please refresh the page.');
      return;
    }

    if (!workspace?.workspace?.id) {
      console.error('No workspace selected');
      setError('No workspace selected');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token missing');
        return;
      }

      console.log('Sending message to workspace:', workspace.workspace.id);
      
      const response = await axios.post(
        `http://localhost:4000/api/workspaces/${workspace.workspace.id}/messages`,
        { content: messageContent },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const sentMessage = response.data;
      console.log('Message saved:', sentMessage);
      
      // Add the message locally first for instant feedback
      setMessages(prev => [...prev, sentMessage]);
      scrollToBottom();
      
      // Then broadcast to others via socket
      socket.emit('workspace_message', {
        workspaceId: workspace.workspace.id,
        message: sentMessage
      });
      
      setNewMessage('');
      setError(''); // Clear any previous errors
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(error.response?.data?.error || 'Failed to send message');
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="workspace-chat">
      <div className="chat-header">
        <h3>{workspace.workspace.name}</h3>
        <button onClick={onClose} className="close-button">&times;</button>
      </div>

      <div className="messages-container">
        {error && <div className="error">{error}</div>}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.senderId === user.id ? 'sent' : 'received'}`}
          >
            <div className="message-content">
              <div className="message-header">
                <span className="sender-name">{message.sender.username}</span>
                <span className="message-time">{formatTime(message.createdAt)}</span>
              </div>
              <p>{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="message-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          required
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default WorkspaceChat;
