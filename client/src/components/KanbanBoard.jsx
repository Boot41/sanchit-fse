import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import '../styles/kanban.css';

const KanbanBoard = ({ workspaceId, socket }) => {
  const [tasks, setTasks] = useState([]);
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
      const response = await axios.get(`http://localhost:4000/api/workspaces/${workspaceId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
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
        `http://localhost:4000/api/workspaces/${workspaceId}/tasks/${taskId}`,
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
                            className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
                          >
                            <h4>{task.title}</h4>
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
    </div>
  );
};

export default KanbanBoard;
