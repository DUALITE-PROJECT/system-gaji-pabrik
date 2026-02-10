import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, MoreHorizontal, Calendar, Flag, User } from 'lucide-react';
import { mockTasks, mockTeamMembers } from '../../data/mockData';

const columns = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-100 dark:bg-gray-900/30', dotColor: 'bg-gray-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-yellow-100 dark:bg-yellow-900/30', dotColor: 'bg-yellow-500' },
  { id: 'review', title: 'Review', color: 'bg-blue-100 dark:bg-blue-900/30', dotColor: 'bg-blue-500' },
  { id: 'completed', title: 'Completed', color: 'bg-green-100 dark:bg-green-900/30', dotColor: 'bg-green-500' },
];

export const TaskBoard: React.FC = () => {
  const [tasks, setTasks] = useState(mockTasks);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      case 'low': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (draggedTask) {
      setTasks(prev => 
        prev.map(task => 
          task.id === draggedTask 
            ? { ...task, status: newStatus as any }
            : task
        )
      );
      setDraggedTask(null);
    }
  };

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-header font-semibold text-charcoal-900 dark:text-white mb-2">Task Board</h1>
          <p className="text-charcoal-600 dark:text-gray-400">Manage your team's workflow with drag-and-drop simplicity</p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-r from-accent-teal to-accent-teal-dark text-white px-6 py-3 rounded-xl font-medium hover:shadow-hover dark:hover:shadow-dark-hover transition-all shadow-soft dark:shadow-dark-soft flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>New Task</span>
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full">
        {columns.map((column) => (
          <div
            key={column.id}
            className="bg-white dark:bg-dark-800 rounded-2xl shadow-soft dark:shadow-dark-soft p-4 flex flex-col border border-transparent dark:border-dark-600"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${column.dotColor}`} />
                <h2 className="font-semibold text-charcoal-900 dark:text-white">{column.title}</h2>
                <span className="bg-sand-100 dark:bg-dark-700 text-charcoal-600 dark:text-gray-400 text-xs px-2 py-1 rounded-lg">
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
              <button className="p-1 hover:bg-sand-100 dark:hover:bg-dark-700 rounded-lg transition-colors">
                <MoreHorizontal size={16} className="text-charcoal-500 dark:text-gray-500" />
              </button>
            </div>

            <div className="space-y-3 flex-1">
              {getTasksByStatus(column.id).map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  className="bg-sand-50 dark:bg-dark-700 rounded-xl p-4 cursor-move hover:shadow-soft dark:hover:shadow-dark-soft transition-shadow border border-sand-200 dark:border-dark-600 hover:border-accent-teal dark:hover:border-accent-teal-dark"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-medium text-charcoal-900 dark:text-white text-sm">{task.title}</h3>
                    <span className={`px-2 py-1 text-xs rounded-lg ${getPriorityColor(task.priority)}`}>
                      <Flag size={10} className="inline mr-1" />
                      {task.priority}
                    </span>
                  </div>
                  
                  <p className="text-charcoal-600 dark:text-gray-400 text-xs mb-3 line-clamp-2">{task.description}</p>
                  
                  <div className="flex items-center justify-between text-xs text-charcoal-500 dark:text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar size={12} />
                      <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <img
                        src={task.assignee.avatar}
                        alt={task.assignee.name}
                        className="w-5 h-5 rounded-full border border-white dark:border-dark-700"
                      />
                      <span className="text-xs">{task.assignee.name.split(' ')[0]}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full border-2 border-dashed border-sand-200 dark:border-dark-600 rounded-xl p-4 text-charcoal-500 dark:text-gray-500 hover:border-accent-teal dark:hover:border-accent-teal-dark hover:text-accent-teal dark:hover:text-accent-teal-dark transition-colors flex items-center justify-center space-x-2"
              >
                <Plus size={16} />
                <span className="text-sm">Add Task</span>
              </motion.button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
