import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import '../styles/chat.css';

function ChatRoom({ roomId, username }) {
  const socket = useSocket();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
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

    socket.on('previous_messages', (messages) => {
      setMessages(messages);
      scrollToBottom();
    });

    socket.on('receive_message', (data) => {
      setMessages((prev) => [...prev, data]);
      scrollToBottom();
    });

    // Listen for task_created events
    socket.on('task_created', async ({ task }) => {
      try {
        setTasks((prev) => [...prev, task]);
      } catch (error) {
        console.error('Error fetching tasks:', error);
      }
    });

    // Fetch initial messages and tasks
    const fetchData = async () => {
      try {
        socket.emit('get_previous_messages', { roomId });
        socket.emit('get_tasks', { roomId });
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();

    return () => {
      socket.emit('leave_room', { roomId, username });
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('receive_message');
      socket.off('previous_messages');
      socket.off('task_created');
    };
  }, [socket, roomId, username]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim() && socket) {
      try {
        socket.emit('send_message', {
          roomId,
          message: message.trim(),
          username
        });
        
        setMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
      }
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
        
        {/* <div className="users-sidebar">
           <div className="sidebar-section">
            <h3>Online Users</h3>
            <ul className="users-list">
              {users.map((user, index) => (
                <li key={index}>{user}</li>
              ))}
            </ul>
          </div> 

          <div className="sidebar-section">
            <h3>Tasks</h3>
            <ul className="tasks-list">
              {tasks.map((task) => (
                <li key={task.id} className={`task-item ${task.status}`}>
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    <span className="task-assignee">@{task.assignee.username}</span>
                    {task.dueDate && (
                      <span className="task-due-date">
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {task.labels.length > 0 && (
                    <div className="task-labels">
                      {task.labels.map((label, i) => (
                        <span key={i} className="task-label">{label}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div> */}
      </div>

      <form onSubmit={handleSendMessage} className="message-form grid grid-cols-2 gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="message-input col-span-1"
          required
        />
        <button type="submit" disabled={!message.trim()} className="send-button col-span-1">
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatRoom;
