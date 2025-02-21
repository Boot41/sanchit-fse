import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ChatRoom from './ChatRoom';
import '../styles/home.css';

function Home() {
  const navigate = useNavigate();
  const { roomId: routeRoomId } = useParams();
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [workspaceMembers, setWorkspaceMembers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }

    const fetchWorkspaces = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:4000/api/workspaces', {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Map the response to get workspace objects with correct structure
        const workspacesData = response.data.map(userWorkspace => ({
          id: userWorkspace.workspace.id,
          name: userWorkspace.workspace.name,
          role: userWorkspace.role
        }));
        setWorkspaces(workspacesData);
        
        // Fetch members for each workspace
        workspacesData.forEach(workspace => {
          fetchWorkspaceMembers(workspace.id);
        });
        setError('');
      } catch (err) {
        console.error('Error fetching workspaces:', err);
        setError('Failed to load workspaces');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaces();
  }, [navigate]);

  const fetchWorkspaceMembers = async (workspaceId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:4000/api/workspaces/${workspaceId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkspaceMembers(prev => ({
        ...prev,
        [workspaceId]: response.data
      }));
    } catch (err) {
      console.error(`Error fetching members for workspace ${workspaceId}:`, err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleWorkspaceClick = (workspace) => {
    setSelectedWorkspace(workspace);
    setActiveDropdown(activeDropdown === workspace.id ? null : workspace.id);
  };

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:4000/api/workspaces', 
        { name: newWorkspaceName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newWorkspace = response.data;
      setWorkspaces(prev => [...prev, newWorkspace]);
      setSelectedWorkspace(newWorkspace);
      setNewWorkspaceName('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating workspace:', err);
      alert('Failed to create workspace');
    }
  };

  if (routeRoomId) {
    return <ChatRoom roomId={routeRoomId} username={user?.username} />;
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="workspace-title">
            <span className="workspace-icon">Ac</span>
            <h1>A1 Company Ltd.</h1>
          </div>
        </div>
        
        <div className="sidebar-section">
          <div className="workspaces-header">
            <h2>My Workspaces</h2>
            <button 
              className="add-workspace-btn"
              onClick={() => setShowCreateForm(!showCreateForm)}
              title="Create new workspace"
            >
              +
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateWorkspace} className="create-workspace-form">
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                required
              />
              <div className="form-buttons">
                <button type="submit">Create</button>
                <button type="button" onClick={() => setShowCreateForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="loading-state">Loading workspaces...</div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="no-workspaces">
              <p>No workspaces found</p>
              <button onClick={() => setShowCreateForm(true)}>Create your first workspace</button>
            </div>
          ) : (
            <ul className="workspace-list">
              {workspaces.map(workspace => (
                <li key={workspace.id} className="workspace-item-container">
                  <div 
                    className={`workspace-item ${selectedWorkspace?.id === workspace.id ? 'active' : ''}`}
                    onClick={() => handleWorkspaceClick(workspace)}
                  >
                    <div className="workspace-item-main">
                      <span className="workspace-name">{workspace.name}</span>
                      {workspace.role === 'leader' && (
                        <span className="workspace-role">Leader</span>
                      )}
                    </div>
                  </div>
                  {activeDropdown === workspace.id && (
                    <div className="workspace-dropdown">
                      <div className="dropdown-header">
                        <h3>Members</h3>
                      </div>
                      <ul className="member-list">
                        {workspaceMembers[workspace.id]?.map((member, index) => (
                          <li key={index} className="member-item">
                            <span className="member-avatar">
                              {member.username?.[0]?.toUpperCase()}
                            </span>
                            <span className="member-name">
                              {member.username}
                              {member.role === 'leader' && (
                                <span className="member-role">Leader</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="dropdown-actions">
                        <button className="dropdown-btn">Invite Members</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile" onClick={handleLogout}>
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <span className="user-name">{user?.username}</span>
          </div>
        </div>
      </div>

      <div className="main-content">
        {selectedWorkspace ? (
          <ChatRoom 
            roomId={selectedWorkspace.id.toString()} 
            username={user?.username}
          />
        ) : (
          <div className="empty-state">
            <h2>Welcome to your workspace!</h2>
            <p>Select a workspace to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
