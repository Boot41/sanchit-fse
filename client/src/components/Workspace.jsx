import { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/workspace.css';

function Workspace() {
  const [workspaces, setWorkspaces] = useState([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchWorkspaceMembers(selectedWorkspace.workspace.id);
    }
  }, [selectedWorkspace]);

  const fetchWorkspaces = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:4000/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkspaces(response.data);
    } catch (error) {
      setError('Failed to fetch workspaces');
    }
  };

  const fetchWorkspaceMembers = async (workspaceId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:4000/api/workspaces/${workspaceId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMembers(response.data);
    } catch (error) {
      setError('Failed to fetch workspace members');
    }
  };

  const createWorkspace = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:4000/api/workspaces', 
        { name: newWorkspaceName },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setWorkspaces([...workspaces, response.data]);
      setNewWorkspaceName('');
      setSuccess('Workspace created successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to create workspace');
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!selectedWorkspace) return;

    try {
      const token = localStorage.getItem('token');
      // First, get user ID from email
      const userResponse = await axios.get(`http://localhost:4000/api/users/by-email/${newMemberEmail}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const userId = userResponse.data.id;
      const response = await axios.post(
        `http://localhost:4000/api/workspaces/${selectedWorkspace.workspace.id}/members`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      setMembers([...members, response.data]);
      setNewMemberEmail('');
      setSuccess('Member added successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to add member');
    }
  };

  return (
    <div className="workspace-container">
      <div className="workspace-section">
        <h2>Your Workspaces</h2>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        
        <form onSubmit={createWorkspace} className="workspace-form">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="New Workspace Name"
            required
          />
          <button type="submit">Create Workspace</button>
        </form>

        <div className="workspaces-list">
          {workspaces.map(workspace => (
            <div
              key={workspace.id}
              className={`workspace-item ${selectedWorkspace?.id === workspace.id ? 'selected' : ''}`}
              onClick={() => setSelectedWorkspace(workspace)}
            >
              <h3>{workspace.workspace.name}</h3>
              <p>Role: {workspace.role}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedWorkspace && (
        <div className="workspace-details">
          <h2>{selectedWorkspace.workspace.name}</h2>
          
          {selectedWorkspace.role === 'leader' && (
            <form onSubmit={addMember} className="add-member-form">
              <input
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="Member's Email"
                required
              />
              <button type="submit">Add Member</button>
            </form>
          )}

          <div className="members-list">
            <h3>Members</h3>
            {members.map(member => (
              <div key={member.id} className="member-item">
                <p>{member.user.username}</p>
                <span className="member-role">{member.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Workspace;
