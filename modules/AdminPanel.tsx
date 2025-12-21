import React, { useState } from 'react';
import { useApp } from '../store';
import { UserRole, User, ProjectAccessLevel } from '../types';
import { Trash2, UserPlus, Shield, User as UserIcon, Settings, Lock, Search } from 'lucide-react';
import { Modal } from '../components/Modal';

export const AdminPanel: React.FC = () => {
  const { users, projects, addUser, updateUser, deleteUser, currentUser } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.MEMBER,
    projectAccess: {} as Record<string, ProjectAccessLevel>
  });

  if (currentUser?.role !== UserRole.ADMIN) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Access Denied. Admin privileges required.
      </div>
    );
  }

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      username: '',
      password: '',
      role: UserRole.MEMBER,
      projectAccess: projects.reduce((acc, p) => ({ ...acc, [p.id]: 'read' }), {})
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    // Ensure all projects have an entry, defaulting to 'none' if missing
    const access = { ...user.projectAccess };
    projects.forEach(p => {
      if (!access[p.id]) access[p.id] = 'none';
    });

    setFormData({
      name: user.name,
      username: user.username,
      password: user.password,
      role: user.role,
      projectAccess: access
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.password) return;

    if (editingUser) {
      updateUser({
        ...editingUser,
        name: formData.name,
        username: formData.username,
        password: formData.password,
        role: formData.role,
        projectAccess: formData.projectAccess
      });
    } else {
      addUser({
        id: crypto.randomUUID(),
        name: formData.name,
        username: formData.username,
        password: formData.password,
        role: formData.role,
        avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${formData.username}`,
        projectAccess: formData.projectAccess,
        isOnline: false
      });
    }
    setIsModalOpen(false);
  };

  const handleAccessChange = (projectId: string, level: ProjectAccessLevel) => {
    setFormData(prev => ({
      ...prev,
      projectAccess: { ...prev.projectAccess, [projectId]: level }
    }));
  };

  // Filter users based on search term
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 truncate">User Management</h1>
        
        <div className="flex w-full md:w-auto space-x-2">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search users..." 
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <button
            onClick={openAddModal}
            className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm shrink-0"
            >
            <UserPlus size={18} className="mr-0 md:mr-2" /> 
            <span className="hidden md:inline">Add User</span>
            <span className="md:hidden">Add</span>
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden w-full">
        <div className="w-full">
          <table className="w-full text-left text-sm table-fixed md:table-auto">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold text-slate-700 w-[45%] md:w-auto">User</th>
                <th className="hidden md:table-cell px-6 py-4 font-semibold text-slate-700">Username</th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold text-slate-700 w-[25%] md:w-auto">Role</th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold text-slate-700 text-right w-[30%] md:w-auto">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 md:px-6 md:py-4 overflow-hidden">
                    <div className="flex items-center">
                      <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full mr-2 md:mr-3 border border-slate-200 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{user.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 text-slate-500 font-mono text-xs">{user.username}</td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium ${
                      user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role === UserRole.ADMIN ? <Shield size={10} className="mr-1"/> : <UserIcon size={10} className="mr-1"/>}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                    <div className="flex justify-end space-x-1">
                       <button
                          onClick={() => openEditModal(user)}
                          className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                          title="Settings"
                        >
                          <Settings size={18} />
                        </button>
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                  <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                          {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingUser ? `Edit User` : "Create New User"}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Credentials</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                >
                  <option value={UserRole.MEMBER}>Member</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  placeholder="johndoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-8"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Secret123"
                  />
                  <Lock size={14} className="absolute right-3 top-3 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Project Permissions</h4>
            <div className="space-y-3 bg-slate-50 p-4 rounded-lg max-h-48 overflow-y-auto">
              {projects.map(project => (
                <div key={project.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="mb-1 sm:mb-0">
                    <div className="text-sm font-medium text-slate-800">{project.name}</div>
                    <div className="text-xs text-slate-500">ID: {project.id}</div>
                  </div>
                  <div className="flex bg-white rounded-md border border-slate-200 p-0.5 self-start sm:self-auto shrink-0">
                    {(['none', 'read', 'write'] as ProjectAccessLevel[]).map((level) => (
                       <button
                         key={level}
                         type="button"
                         onClick={() => handleAccessChange(project.id, level)}
                         className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                            formData.projectAccess[project.id] === level
                            ? level === 'none' ? 'bg-slate-200 text-slate-700' : 
                              level === 'read' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            : 'text-slate-400 hover:text-slate-600'
                         }`}
                       >
                         {level}
                       </button>
                    ))}
                  </div>
                </div>
              ))}
              {projects.length === 0 && <div className="text-sm text-slate-400 italic">No projects available</div>}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end space-x-3">
             <button
               type="button"
               onClick={() => setIsModalOpen(false)}
               className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg"
             >
               Cancel
             </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg"
            >
              {editingUser ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};