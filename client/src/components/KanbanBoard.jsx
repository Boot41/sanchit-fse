import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import '../styles/kanban.css';

const KanbanBoard = ({ workspaceId, socket }) => {
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const currentUser = JSON.parse(localStorage.getItem('user'));

  // Add state for form fields
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    assigneeId: ''
  });

  const handleTaskClick = (task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description || '',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
      assigneeId: task.assigneeId
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTask(null);
    setEditForm({
      title: '',
      description: '',
      dueDate: '',
      assigneeId: ''
    });
  };

  const handleUpdateTask = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `http://localhost:4000/api/tasks/${editingTask.id}`,
        {
          ...editForm,
          status: editingTask.status,
          progress: editingTask.progress,
          labels: editingTask.labels
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update tasks state with the updated task
      setTasks(tasks.map(task => 
        task.id === editingTask.id ? response.data.task : task
      ));

      handleCloseDialog();
    } catch (error) {
      console.error('Failed to update task:', error);
      setError(error.response?.data?.error || 'Failed to update task');
    }
  };

  const [columns] = useState({
    tasks: {
      name: 'Tasks',
      items: []
    },
    in_progress: {
      name: 'In Progress',
      items: []
    },
    review: {
      name: 'For Review',
      items: []
    },
    completed: {
      name: 'Completed',
      items: []
    }
  });

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:4000/api/tasks/workspaces/${workspaceId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  // Fetch workspace members
  const fetchWorkspaceMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:4000/api/workspaces/${workspaceId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWorkspaceMembers(response.data);
    } catch (error) {
      console.error('Error fetching workspace members:', error);
      setError('Failed to fetch workspace members');
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchWorkspaceMembers();
  }, [workspaceId]);

  useEffect(() => {
    if (socket) {
      socket.on('task_created', fetchTasks);
      socket.on('task_updated', fetchTasks);

      return () => {
        socket.off('task_created');
        socket.off('task_updated');
      };
    }
  }, [socket, workspaceId]);

  const updateTaskProgress = async (taskId, progress) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `http://localhost:4000/api/tasks/workspaces/${workspaceId}/tasks/${taskId}`,
        { progress },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchTasks(); // Refresh tasks after update
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    if (source.droppableId !== destination.droppableId) {
      const taskId = parseInt(draggableId);
      const newProgress = destination.droppableId;
      await updateTaskProgress(taskId, newProgress);
    }
  };

  // Clear existing items before reorganizing
  const organizedColumns = { ...columns };
  Object.keys(organizedColumns).forEach(key => {
    organizedColumns[key].items = [];
  });

  // Now organize tasks into columns
  tasks.forEach(task => {
    const column = task.progress || 'tasks';
    organizedColumns[column].items.push(task);
  });

  return (
    <div className="kanban-board">
      <div className="kanban-header">
        <h2>Task Progress Board</h2>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-columns">
          {Object.entries(organizedColumns).map(([columnId, column]) => (
            <div key={columnId} className="kanban-column">
              <h3>{column.name}</h3>
              <Droppable droppableId={columnId}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`task-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {column.items.map((task, index) => (
                      <Draggable
                        key={task.id}
                        draggableId={task.id.toString()}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`task-card ${snapshot.isDragging ? 'dragging' : ''} ${
                              task.assignee?.id === currentUser?.id ? 'assigned-to-me' : ''
                            }`}
                            onClick={() => handleTaskClick(task)}
                          >
                            <h4 className={task.progress === 'completed' ? 'completed' : ''}>
                              {task.title}
                            </h4>
                            {task.description && (
                              <p>{task.description}</p>
                            )}
                            <div className="task-meta">
                              <span className="assignee">
                                {task.assignee.username}
                              </span>
                              {task.dueDate && (
                                <span className="due-date">
                                  Due: {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {task.labels && task.labels.length > 0 && (
                              <div className="task-labels">
                                {task.labels.map((label, i) => (
                                  <span key={i} className="label">{label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {isDialogOpen && (
        <div className="dialog-overlay" onClick={handleCloseDialog}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2 className="dialog-title">Edit Task</h2>
              <button className="dialog-close" onClick={handleCloseDialog}>&times;</button>
            </div>
            <div className="dialog-content">
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  placeholder="Enter task title"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  placeholder="Enter task description"
                ></textarea>
              </div>
              
              <div className="form-group">
                <label htmlFor="dueDate">Due Date</label>
                <input
                  id="dueDate"
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="assignee">Assignee</label>
                <select
                  id="assignee"
                  value={editForm.assigneeId || ''}
                  onChange={(e) => setEditForm({...editForm, assigneeId: e.target.value})}
                >
                  <option value="">Select assignee</option>
                  {workspaceMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.user.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={handleCloseDialog}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdateTask}>Update Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
