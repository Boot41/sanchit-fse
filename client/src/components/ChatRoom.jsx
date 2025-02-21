import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import '../styles/chat.css';

function ChatRoom({ roomId, username }) {
  const socket = useSocket();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!socket) return;

    socket.emit('join_room', { roomId, username });

    socket.on('user_joined', ({ users }) => {
      setUsers(users);
    });

    socket.on('user_left', ({ users }) => {
      setUsers(users);
    });

    socket.on('receive_message', (data) => {
      setMessages((prev) => [...prev, data]);
      scrollToBottom();
    });

    return () => {
      socket.emit('leave_room', { roomId, username });
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('receive_message');
    };
  }, [socket, roomId, username]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && socket) {
      socket.emit('send_message', {
        roomId,
        message: message.trim(),
        username
      });
      setMessage('');
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-main">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.username === username ? 'own-message' : ''}`}
            >
              <div className="message-header">
                <span className="username">{msg.username}</span>
                <span className="timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="users-sidebar">
          <h3>Online Users</h3>
          <ul>
            {users.map((user, index) => (
              <li key={index}>{user}</li>
            ))}
          </ul>
        </div>
      </div>

      <form onSubmit={handleSendMessage} className="message-form">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          required
        />
        <button type="submit" disabled={!message.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatRoom;
