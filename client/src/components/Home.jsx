import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ChatRoom from './ChatRoom';
import AiChatBox from './AiChatBox';
import io from 'socket.io-client';
import KanbanBoard from './KanbanBoard'; // Import KanbanBoard component
import '../styles/home.css';

// Initialize socket with auth token
const initializeSocket = () => {
  const token = localStorage.getItem('token');
  return io('http://localhost:4000', {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true
  });
};

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
  const [newWorkspacePurpose, setNewWorkspacePurpose] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));
  const [socket, setSocket] = useState(null);
  const [showKanban, setShowKanban] = useState(false); // Add showKanban state

  // Initialize socket connection
  useEffect(() => {
    const newSocket = initializeSocket();
    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

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
          workspace: userWorkspace.workspace,
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

  useEffect(() => {
    if (socket && selectedWorkspace?.id) {
      // Join workspace room for real-time updates
      socket.emit('join_workspace', selectedWorkspace.id);
      
      return () => {
        socket.emit('leave_workspace', selectedWorkspace.id);
      };
    }
  }, [selectedWorkspace, socket]);

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
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:4000/api/workspaces', 
        { 
          name: newWorkspaceName,
          purpose: newWorkspacePurpose || "General Workspace"
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newWorkspace = response.data;
      setSelectedWorkspace(newWorkspace);
      setNewWorkspaceName('');
      setNewWorkspacePurpose('');
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating workspace:', err);
    }
  };

  const handleInviteMember = async (workspaceId) => {
    try {
      setInviteError('');
      const token = localStorage.getItem('token');
      
      // First find user by email
      const userResponse = await axios.get(`http://localhost:4000/api/users/by-email/${inviteEmail}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Then add them to the workspace
      const response = await axios.post(`http://localhost:4000/api/workspaces/${workspaceId}/members`, {
        userId: userResponse.data.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update members list
      await fetchWorkspaceMembers(workspaceId);
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (error) {
      console.error('Error inviting member:', error);
      setInviteError(error.response?.data?.error || 'Failed to invite member');
    }
  };

  const toggleKanban = () => {
    setShowKanban(!showKanban);
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
            <h1>DASHBOARD</h1>
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
              <input
                type="text"
                value={newWorkspacePurpose}
                onChange={(e) => setNewWorkspacePurpose(e.target.value)}
                placeholder="Workspace purpose"
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
                      <span className="workspace-name">{workspace.workspace.name}</span>
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
                        {workspaceMembers[workspace.id]?.map((member) => (
                          <li key={member.user.id} className="member-item">
                            <span className="member-avatar">
                              {member.user.username[0].toUpperCase()}
                            </span>
                            <span className="member-name">
                              {member.user.username}
                              {member.role === 'leader' && (
                                <span className="member-role">Leader</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {workspace.role === 'leader' && (
                        <div className="dropdown-actions">
                          {showInviteForm && activeDropdown === workspace.id ? (
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              handleInviteMember(workspace.id);
                            }} className="invite-form">
                              <input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="Enter email"
                                required
                              />
                              <div className="form-buttons">
                                <button type="submit">Send</button>
                                <button type="button" onClick={() => {
                                  setShowInviteForm(false);
                                  setInviteError('');
                                }}>Cancel</button>
                              </div>
                              {inviteError && <p className="error-message">{inviteError}</p>}
                            </form>
                          ) : (
                            <button 
                              className="dropdown-btn"
                              onClick={() => setShowInviteForm(true)}
                            >
                              Invite Members
                            </button>
                          )}
                          <button 
                            className="dropdown-btn"
                            onClick={toggleKanban}
                          >
                            Progress Board
                          </button>
                        </div>
                      )}
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
          showKanban ? (
            <KanbanBoard
              workspaceId={selectedWorkspace.id}
              socket={socket}
            />
          ) : (
            <ChatRoom
              roomId={selectedWorkspace.id}
              username={user?.username}
              socket={socket}
            />
          )
        ) : (
          <div className="welcome-message">
            <h2>Welcome to your workspace!</h2>
            <p>Select a workspace to start chatting or create a new one.</p>
          </div>
        )}
      </div>

      {/* Right Sidebar with AI Chat */}
      {selectedWorkspace && (
        <div className="right-sidebar">
          <div className="online-users-section">
            <h3>Online Users</h3>
            <div className="online-users-list">
              {workspaceMembers[selectedWorkspace.id]?.map((member) => (
                <div key={member.user.id} className="online-user-item">
                  <span className="user-avatar">{member.user.username[0].toUpperCase()}</span>
                  <span className="user-name">{member.user.username}</span>
                </div>
              ))}
            </div>
          </div>
          <AiChatBox key={selectedWorkspace.id} workspaceId={selectedWorkspace.id} />
        </div>
      )}
    </div>
  );
}

export default Home;
