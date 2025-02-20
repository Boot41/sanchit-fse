import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatRoom from './ChatRoom';
import '../styles/home.css';

function Home() {
  const navigate = useNavigate();
  const { roomId: routeRoomId } = useParams();
  const [roomId, setRoomId] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  if (routeRoomId) {
    return <ChatRoom roomId={routeRoomId} username={user?.username} />;
  }

  return (
    <div className="home-container">
      <header className="header">
        <span>Welcome, {user?.username || 'User'}</span>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </header>
      <div className="join-room-container">
        <h2>Join a Chat Room</h2>
        <form onSubmit={handleJoinRoom} className="join-room-form">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Room ID"
            required
          />
          <button type="submit">Join Room</button>
        </form>
      </div>
    </div>
  );
}

export default Home;
