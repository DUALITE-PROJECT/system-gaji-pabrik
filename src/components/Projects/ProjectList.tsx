import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, Search, Plus, Calendar, DollarSign, Users, Grid, List } from 'lucide-react';
import { mockProjects } from '../../data/mockData';

export const ProjectList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredProjects = mockProjects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
      case 'completed': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400';
      case 'on-hold': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
      case 'draft': return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-header font-semibold text-charcoal-900 dark:text-white mb-2">Projects</h1>
          <p className="text-charcoal-600 dark:text-gray-400">Manage and track all your creative projects</p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-r from-accent-teal to-accent-teal-dark text-white px-6 py-3 rounded-xl font-medium hover:shadow-hover dark:hover:shadow-dark-hover transition-all shadow-soft dark:shadow-dark-soft flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>New Project</span>
        </motion.button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-soft dark:shadow-dark-soft p-6 border border-transparent dark:border-dark-600">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-charcoal-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-80 bg-sand-50 dark:bg-dark-700 border border-sand-200 dark:border-dark-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-teal dark:focus:ring-accent-teal-dark focus:border-transparent transition-all text-charcoal-900 dark:text-white placeholder-charcoal-500 dark:placeholder-gray-400"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-sand-50 dark:bg-dark-700 border border-sand-200 dark:border-dark-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-teal dark:focus:ring-accent-teal-dark focus:border-transparent transition-all text-charcoal-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-gradient-to-r from-accent-teal to-accent-teal-dark text-white' 
                  : 'text-charcoal-600 dark:text-gray-400 hover:bg-sand-100 dark:hover:bg-dark-700'
              }`}
            >
              <Grid size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list' 
                  ? 'bg-gradient-to-r from-accent-teal to-accent-teal-dark text-white' 
                  : 'text-charcoal-600 dark:text-gray-400 hover:bg-sand-100 dark:hover:bg-dark-700'
              }`}
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -4 }}
            className="bg-white dark:bg-dark-800 rounded-2xl shadow-soft dark:shadow-dark-soft hover:shadow-hover dark:hover:shadow-dark-hover transition-all duration-300 cursor-pointer overflow-hidden border border-transparent dark:border-dark-600"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-charcoal-900 dark:text-white mb-2">{project.name}</h3>
                  <p className="text-charcoal-600 dark:text-gray-400 text-sm mb-3">{project.description}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(project.status)}`}>
                  {project.status}
                </span>
              </div>
              
              <div className="space-y-3 mb-4">
                <div className="flex items-center text-sm text-charcoal-600 dark:text-gray-400">
                  <Users size={14} className="mr-2" />
                  <span>{project.client}</span>
                </div>
                
                <div className="flex items-center text-sm text-charcoal-600 dark:text-gray-400">
                  <Calendar size={14} className="mr-2" />
                  <span>Due {new Date(project.deadline).toLocaleDateString()}</span>
                </div>
                
                <div className="flex items-center text-sm text-charcoal-600 dark:text-gray-400">
                  <DollarSign size={14} className="mr-2" />
                  <span>${project.budget.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-charcoal-600 dark:text-gray-400">Progress</span>
                  <span className="text-sm font-medium text-charcoal-900 dark:text-white">{project.progress}%</span>
                </div>
                <div className="w-full h-2 bg-sand-200 dark:bg-dark-600 rounded-full">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 1, delay: index * 0.1 }}
                    className="h-full bg-gradient-to-r from-accent-teal to-accent-teal-dark rounded-full"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {project.team.map((member) => (
                    <img
                      key={member.id}
                      src={member.avatar}
                      alt={member.name}
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-dark-800"
                      title={member.name}
                    />
                  ))}
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {project.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-sand-100 dark:bg-dark-700 text-charcoal-600 dark:text-gray-400 text-xs rounded-lg"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
