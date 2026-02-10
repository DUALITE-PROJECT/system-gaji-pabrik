import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Mail, Phone, MapPin, MoreHorizontal } from 'lucide-react';
import { mockTeamMembers } from '../../data/mockData';

export const TeamDirectory: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const filteredMembers = mockTeamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || member.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const departments = ['all', 'Design', 'Development', 'Management'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-header font-semibold text-charcoal-900 dark:text-white mb-2">Team Directory</h1>
          <p className="text-charcoal-600 dark:text-gray-400">Connect with your team members and view their availability</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-soft dark:shadow-dark-soft p-6 border border-transparent dark:border-dark-600">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-charcoal-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search team members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-80 bg-sand-50 dark:bg-dark-700 border border-sand-200 dark:border-dark-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-teal dark:focus:ring-accent-teal-dark focus:border-transparent transition-all text-charcoal-900 dark:text-white placeholder-charcoal-500 dark:placeholder-gray-400"
              />
            </div>
            
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-2 bg-sand-50 dark:bg-dark-700 border border-sand-200 dark:border-dark-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-teal dark:focus:ring-accent-teal-dark focus:border-transparent transition-all text-charcoal-900 dark:text-white"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept === 'all' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-charcoal-600 dark:text-gray-400">
            <span>Total: {filteredMembers.length} members</span>
          </div>
        </div>
      </div>

      {/* Team Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredMembers.map((member, index) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className="bg-white dark:bg-dark-800 rounded-2xl shadow-soft dark:shadow-dark-soft hover:shadow-hover dark:hover:shadow-dark-hover transition-all duration-300 p-6 text-center cursor-pointer border border-transparent dark:border-dark-600"
          >
            <div className="relative inline-block mb-4">
              <img
                src={member.avatar}
                alt={member.name}
                className="w-20 h-20 rounded-2xl object-cover mx-auto"
              />
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white dark:border-dark-800 ${getStatusColor(member.status)}`} />
            </div>
            
            <h3 className="font-semibold text-charcoal-900 dark:text-white mb-1">{member.name}</h3>
            <p className="text-charcoal-600 dark:text-gray-400 text-sm mb-2">{member.role}</p>
            <p className="text-charcoal-500 dark:text-gray-500 text-xs mb-4">{member.department}</p>
            
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-center space-x-2 text-sm text-charcoal-600 dark:text-gray-400">
                <Mail size={14} />
                <span className="truncate">{member.email}</span>
              </div>
            </div>
            
            <div className="flex items-center justify-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 bg-gradient-to-r from-accent-teal to-accent-teal-dark text-white rounded-lg hover:shadow-soft dark:hover:shadow-dark-soft transition-all"
              >
                <Mail size={16} />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 bg-sand-100 dark:bg-dark-700 text-charcoal-600 dark:text-gray-400 rounded-lg hover:bg-sand-200 dark:hover:bg-dark-600 transition-colors"
              >
                <Phone size={16} />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 bg-sand-100 dark:bg-dark-700 text-charcoal-600 dark:text-gray-400 rounded-lg hover:bg-sand-200 dark:hover:bg-dark-600 transition-colors"
              >
                <MoreHorizontal size={16} />
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-soft dark:shadow-dark-soft p-4 text-center border border-transparent dark:border-dark-600">
          <div className="text-2xl font-bold text-charcoal-900 dark:text-white mb-1">
            {filteredMembers.filter(m => m.status === 'online').length}
          </div>
          <div className="text-sm text-charcoal-600 dark:text-gray-400">Online</div>
        </div>
        
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-soft dark:shadow-dark-soft p-4 text-center border border-transparent dark:border-dark-600">
          <div className="text-2xl font-bold text-charcoal-900 dark:text-white mb-1">
            {filteredMembers.filter(m => m.status === 'away').length}
          </div>
          <div className="text-sm text-charcoal-600 dark:text-gray-400">Away</div>
        </div>
        
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-soft dark:shadow-dark-soft p-4 text-center border border-transparent dark:border-dark-600">
          <div className="text-2xl font-bold text-charcoal-900 dark:text-white mb-1">
            {filteredMembers.filter(m => m.department === 'Design').length}
          </div>
          <div className="text-sm text-charcoal-600 dark:text-gray-400">Designers</div>
        </div>
        
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-soft dark:shadow-dark-soft p-4 text-center border border-transparent dark:border-dark-600">
          <div className="text-2xl font-bold text-charcoal-900 dark:text-white mb-1">
            {filteredMembers.filter(m => m.department === 'Development').length}
          </div>
          <div className="text-sm text-charcoal-600 dark:text-gray-400">Developers</div>
        </div>
      </div>
    </div>
  );
};
