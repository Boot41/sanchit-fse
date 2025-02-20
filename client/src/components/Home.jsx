import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/home.css';

function Home() {
  const navigate = useNavigate();
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

  return (
    <div className="home-container">
      <header className="header">
        <span>Welcome, {user?.username || 'User'}</span>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </header>
    </div>
  );
}

export default Home;
