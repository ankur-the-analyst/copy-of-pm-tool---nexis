import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store';
import { Task, TaskStatus, SubTask, Attachment, Comment, User, UserRole, NotificationType, TaskCategory, Project } from '../types';
import { 
  Pencil, Plus, CheckSquare, Square, LockKeyhole, 
  X, Calendar, Clock, Paperclip, Trash2, Send, 
  Minus, FileText, Download, Share2, ChevronDown, ChevronUp, Eye,
  Bookmark, AlertTriangle, Bug, BookOpen, CheckCircle2, Check, User as UserIcon,
  LayoutGrid, List, Search, SlidersHorizontal, ArrowUpDown, MoreVertical, Settings
} from 'lucide-react';
import { Modal } from '../components/Modal';

// --- Category Helpers ---
const CATEGORY_STYLES = {
  [TaskCategory.TASK]: { label: 'Task', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  [TaskCategory.ISSUE]: { label: 'Issue', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle },
  [TaskCategory.BUG]: { label: 'Bug', color: 'bg-red-100 text-red-700 border-red-200', icon: Bug },
  [TaskCategory.STORY]: { label: 'Story', color: 'bg-green-100 text-green-700 border-green-200', icon: BookOpen },
};

// --- Helper for rendering text with mentions ---
const renderWithMentions = (text: string, users: User[]) => {
  const sortedUsers = [...users].sort((a, b) => b.name.length - a.name.length);
  const userNames = sortedUsers.map(u => u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (userNames.length === 0) return text;
  
  const pattern = new RegExp(`(@(?:${userNames.join('|')}))`, 'g');
  
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMention = sortedUsers.some(u => '@' + u.name === part);
        if (isMention) {
          return (
            <span key={i} className="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded mx-0.5 text-xs border border-indigo-100">
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

// --- Task Card Component (Defined Outside to preserve state) ---
const TaskCardItem: React.FC<{ 
  task: Task; 
  users: User[]; 
  canEdit: boolean;
  onEditTask: (task: Task) => void;
  onEditSubtask: (task: Task, subtask: SubTask) => void;
  onUpdateTask: (task: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}> = ({ task, users, canEdit, onEditTask, onEditSubtask, onUpdateTask, onDragStart }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const [assigningSubtaskId, setAssigningSubtaskId] = useState<string | null>(null);
  const subAssignRef = useRef<HTMLDivElement>(null);
  
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const assignee = users.find(u => u.id === task.assigneeId);
  const categoryConfig = CATEGORY_STYLES[task.category] || CATEGORY_STYLES[TaskCategory.TASK];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(event.target as Node)) {
        setIsAssigning(false);
      }
      if (subAssignRef.current && !subAssignRef.current.contains(event.target as Node)) {
        setAssigningSubtaskId(null);
      }
    };
    if (isAssigning) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAssigning]);

  const toggleSubtaskCompletion = (subtaskId: string) => {
    const updatedSubtasks = task.subtasks.map(s => 
      s.id === subtaskId ? { ...s, completed: !s.completed, status: !s.completed ? TaskStatus.DONE : TaskStatus.TODO } : s
    );
    onUpdateTask({ ...task, subtasks: updatedSubtasks });
  };

    const handleAssign = (userId: string | null) => {
      onUpdateTask({ ...task, assigneeId: userId });
      setIsAssigning(false);
    };

  const handleAssignSub = (subId: string, userId: string | null) => {
    const updatedSubtasks = task.subtasks.map(s => s.id === subId ? { ...s, assigneeId: userId } : s);
    onUpdateTask({ ...task, subtasks: updatedSubtasks });
    setAssigningSubtaskId(null);
  };

  return (
    <div
      draggable={true}
      onDragStart={(e) => onDragStart(e, task.id)}
      className={`bg-white p-4 rounded-lg shadow-sm border border-slate-100 transition-all group relative 
        ${canEdit ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:border-indigo-200' : 'cursor-default opacity-90'}
        ${isAssigning ? 'z-20 ring-1 ring-indigo-200 shadow-md' : 'z-0'}
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2">
           <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center ${categoryConfig.color}`}>
             {categoryConfig.label}
           </span>
           <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
             task.priority === 'high' ? 'bg-red-50 text-red-700 border-red-100' :
             task.priority === 'medium' ? 'bg-orange-50 text-orange-700 border-orange-100' :
             'bg-slate-50 text-slate-600 border-slate-100'
           }`}>
             {task.priority}
           </span>
        </div>
        
        <div className="flex items-center space-x-1">
          <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-50 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          <button
            onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
            className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-50 transition-colors"
            title={canEdit ? "Edit Task" : "View Details"}
          >
            {canEdit ? <Pencil size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between mb-1">
        <h4 className="font-medium text-slate-800 leading-snug mr-4">{task.title}</h4>
        <div className="flex items-center space-x-3">
          {task.dueDate ? <div className="flex items-center text-xs text-slate-500"><Clock size={14} className="mr-1 text-slate-400" />{new Date(task.dueDate).toLocaleDateString()}</div> : null}
          <div ref={assigneeRef} className="relative">
             <button 
               onClick={(e) => { e.stopPropagation(); setIsAssigning(!isAssigning); }}
               className={`flex items-center hover:bg-slate-50 rounded p-1 -ml-1 cursor-pointer transition-colors`}
               title={"Click to reassign"}
             >
               {assignee ? (
                 <img src={assignee.avatar} alt={assignee.name} className="w-6 h-6 rounded-full object-cover border border-slate-200" />
               ) : (
                 <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200"><UserIcon size={12} /></div>
               )}
             </button>

                  {isAssigning && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col p-1">
                     <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 mb-1">Assign To</div>
                     <button
                      onClick={(e) => { e.stopPropagation(); handleAssign(null); }}
                      className="w-full text-left flex items-center px-2 py-2 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs text-slate-500 transition-colors"
                    >
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-400 group-hover:bg-red-100 group-hover:text-red-500"><X size={14}/></div>
                        <span className="font-medium">Unassigned</span>
                        {!task.assigneeId && <Check size={14} className="ml-auto"/>}
                    </button>
                    {users.map(u => (
                  <button
                    key={u.id}
                    onClick={(e) => { e.stopPropagation(); handleAssign(u.id); }}
                    className={`w-full text-left flex items-center px-2 py-2 hover:bg-slate-50 rounded-lg transition-colors ${task.assigneeId === u.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
                  >
                            <div className="relative mr-3">
                               <img src={u.avatar} className="w-6 h-6 rounded-full object-cover" />
                               {u.isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></div>}
                            </div>
                            <span className="text-xs font-medium truncate flex-1">{u.name}</span>
                            {task.assigneeId === u.id && <Check size={14} className="ml-2 text-indigo-600"/>}
                        </button>
                    ))}
                </div>
             )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
         <p className="text-xs text-slate-600 mb-3 whitespace-pre-wrap">{task.description || "No description provided."}</p>
      )}
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {task.subtasks.length > 0 && (
             <div className="flex items-center text-xs text-slate-400">
               <CheckSquare size={14} className="mr-1" />
               <span>Subtasks {completedSubtasks}/{task.subtasks.length}</span>
             </div>
          )}
          {task.attachments?.length > 0 && (
            <div className="flex items-center text-xs text-slate-400">
              <Paperclip size={12} className="mr-1" />
              {task.attachments.length}
            </div>
          )}
        </div>
      </div>

      {isExpanded && task.subtasks.length > 0 && (
        <div className="mb-3 pt-2 border-t border-slate-50 space-y-2">
          {task.subtasks.map(sub => (
            <div key={sub.id} className="flex items-center justify-between group/sub">
              <div className="flex items-center flex-1 min-w-0">
                  <button
                  onClick={(e) => { e.stopPropagation(); toggleSubtaskCompletion(sub.id); }}
                  className={`mr-2 flex-shrink-0 ${sub.completed ? 'text-green-500' : 'text-slate-300'} hover:text-indigo-500 cursor-pointer`}
                >
                  {sub.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <div className="flex items-center min-w-0">
                  <span className={`text-xs truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                    {sub.title}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  sub.priority === 'high' ? 'bg-red-50 text-red-700 border border-red-100' : sub.priority === 'medium' ? 'bg-orange-50 text-orange-700 border border-orange-100' : 'bg-slate-50 text-slate-600 border border-slate-100'
                }`}>{sub.priority}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ml-2 ${
                  (CATEGORY_STYLES[sub.category] || CATEGORY_STYLES[TaskCategory.TASK]).color
                }`}>{(CATEGORY_STYLES[sub.category] || CATEGORY_STYLES[TaskCategory.TASK]).label}</span>

                <div ref={assigningSubtaskId === sub.id ? subAssignRef : undefined} className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setAssigningSubtaskId(prev => prev === sub.id ? null : sub.id); }}
                    className={`ml-1 hover:bg-slate-50 rounded p-1 cursor-pointer`}
                    title={'Reassign subtask'}
                  >
                    {users.find(u => u.id === sub.assigneeId) ? (
                      <img src={users.find(u => u.id === sub.assigneeId)!.avatar} alt="assignee" className="w-5 h-5 rounded-full border border-slate-100" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200"><UserIcon size={12} /></div>
                    )}
                  </button>

                  {assigningSubtaskId === sub.id && (
                    <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-64 overflow-y-auto p-1">
                      <button onClick={(e) => { e.stopPropagation(); handleAssignSub(sub.id, null); }} className="w-full text-left px-2 py-2 text-xs text-slate-500 hover:bg-red-50 rounded">Unassigned</button>
                      {users.map(u => (
                        <button key={u.id} onClick={(e) => { e.stopPropagation(); handleAssignSub(sub.id, u.id); }} className={`w-full text-left flex items-center px-2 py-2 hover:bg-slate-50 rounded ${sub.assigneeId === u.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}>
                          <img src={u.avatar} className="w-6 h-6 rounded-full mr-2" />
                          <span className="text-xs font-medium">{u.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); onEditSubtask(task, sub); }}
                  className={`text-slate-400 hover:text-indigo-600 ml-2 ${!canEdit ? 'cursor-default' : ''}`}
                  title={canEdit ? 'Edit subtask' : 'View subtask'}
                >
                  {canEdit ? <Pencil size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      
    </div>
  );
};

// --- KanbanColumn Component ---
interface ColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  canEdit: boolean;
  users: User[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onEditTask: (task: Task) => void;
  onEditSubtask: (task: Task, subtask: SubTask) => void;
  onUpdateTask: (task: Task) => void;
}

const KanbanColumn: React.FC<ColumnProps> = ({ 
  status, title, tasks, canEdit, users, 
  onDragOver, onDrop, onDragStart, onEditTask, onEditSubtask, onUpdateTask 
}) => {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, status)}
      className="bg-slate-50/50 p-4 rounded-xl min-h-[500px] flex flex-col border border-slate-100 h-full"
    >
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-50/50 backdrop-blur-sm p-1 z-10">
        <h3 className="font-semibold text-slate-700 flex items-center">
          <span className={`w-2 h-2 rounded-full mr-2 ${
            status === TaskStatus.TODO ? 'bg-slate-400' :
            status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' : 'bg-green-500'
          }`}></span>
          {title}
        </h3>
        <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-white rounded-md border border-slate-200">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-3 flex-1 overflow-y-auto pr-1 pb-2 custom-scrollbar">
        {tasks.map(task => (
          <TaskCardItem 
            key={task.id} 
            task={task} 
            users={users} 
            canEdit={canEdit}
            onEditTask={onEditTask}
            onEditSubtask={onEditSubtask}
            onUpdateTask={onUpdateTask}
            onDragStart={onDragStart}
          />
        ))}
        {tasks.length === 0 && canEdit && (
          <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-sm">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
};

// --- List View Components ---
interface ListViewProps {
  tasks: Task[];
  users: User[];
  onEditTask: (task: Task) => void;
  visibleColumns: string[];
}

const ListView: React.FC<ListViewProps> = ({ tasks, users, onEditTask, visibleColumns }) => {
    
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700 w-1/3">Title</th>
              {visibleColumns.includes('status') && <th className="px-6 py-4 font-semibold text-slate-700">Status</th>}
              {visibleColumns.includes('priority') && <th className="px-6 py-4 font-semibold text-slate-700">Priority</th>}
              {visibleColumns.includes('category') && <th className="px-6 py-4 font-semibold text-slate-700">Category</th>}
              {visibleColumns.includes('assignee') && <th className="px-6 py-4 font-semibold text-slate-700">Assignee</th>}
              {visibleColumns.includes('dueDate') && <th className="px-6 py-4 font-semibold text-slate-700">Due Date</th>}
              {visibleColumns.includes('created') && <th className="px-6 py-4 font-semibold text-slate-700 text-right">Created</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map(task => {
               const assignee = users.find(u => u.id === task.assigneeId);
               const categoryConfig = CATEGORY_STYLES[task.category] || CATEGORY_STYLES[TaskCategory.TASK];

               return (
                 <tr 
                   key={task.id} 
                   onClick={() => onEditTask(task)} 
                   className="hover:bg-slate-50 transition-colors cursor-pointer group"
                 >
                   <td className="px-6 py-3">
                      <div className="flex items-center">
                        <div className="font-medium text-slate-800">{task.title}</div>
                      </div>
                      {task.subtasks.length > 0 && (
                        <div className="text-xs text-slate-400 mt-1 flex items-center">
                           <CheckSquare size={10} className="mr-1" />
                           {task.subtasks.filter(s=>s.completed).length}/{task.subtasks.length} subtasks
                        </div>
                      )}
                   </td>
                   
                   {visibleColumns.includes('status') && (
                     <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          task.status === TaskStatus.TODO ? 'bg-slate-100 text-slate-600 border-slate-200' :
                          task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          'bg-green-50 text-green-700 border-green-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                             task.status === TaskStatus.TODO ? 'bg-slate-400' :
                             task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' :
                             'bg-green-500'
                          }`}></span>
                          {task.status === TaskStatus.TODO ? 'To Do' : task.status === TaskStatus.IN_PROGRESS ? 'In Progress' : 'Done'}
                        </span>
                     </td>
                   )}

                   {visibleColumns.includes('priority') && (
                     <td className="px-6 py-3">
                       <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${
                          task.priority === 'high' ? 'text-red-700 bg-red-50' : 
                          task.priority === 'medium' ? 'text-orange-700 bg-orange-50' : 
                          'text-slate-600 bg-slate-100'
                       }`}>
                         {task.priority}
                       </span>
                     </td>
                   )}

                   {visibleColumns.includes('category') && (
                     <td className="px-6 py-3">
                        <div className="flex items-center">
                           <span className={`w-6 h-6 rounded flex items-center justify-center mr-2 ${categoryConfig.color.split(' ')[0]} ${categoryConfig.color.split(' ')[1]}`}>
                             <categoryConfig.icon size={14} />
                           </span>
                           <span className="text-slate-600 text-sm">{categoryConfig.label}</span>
                        </div>
                     </td>
                   )}

                   {visibleColumns.includes('assignee') && (
                     <td className="px-6 py-3">
                        {assignee ? (
                          <div className="flex items-center">
                             <img src={assignee.avatar} className="w-6 h-6 rounded-full mr-2 border border-slate-200" />
                             <span className="text-sm text-slate-700">{assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 italic">Unassigned</span>
                        )}
                     </td>
                   )}

                   {visibleColumns.includes('dueDate') && (
                     <td className="px-6 py-3">
                       {task.dueDate ? (
                         <div className="flex items-center text-slate-600">
                           <Calendar size={14} className="mr-1.5 text-slate-400" />
                           {new Date(task.dueDate).toLocaleDateString()}
                         </div>
                       ) : <span className="text-slate-300">-</span>}
                     </td>
                   )}

                   {visibleColumns.includes('created') && (
                     <td className="px-6 py-3 text-right text-slate-500 text-xs font-mono">
                        {new Date(task.createdAt).toLocaleDateString()}
                     </td>
                   )}
                 </tr>
               );
            })}
             {tasks.length === 0 && (
                <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                        No tasks found matching criteria.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export const KanbanBoard: React.FC = () => {
  const { tasks, projects, moveTask, updateTask, users, currentUser, addProject, deleteProject } = useApp();
  
  // Ensure Admins can access ALL projects, otherwise respect projectAccess
  const accessibleProjects = projects.filter(p => 
    currentUser?.role === UserRole.ADMIN || (currentUser?.projectAccess[p.id] && currentUser.projectAccess[p.id] !== 'none')
  );

  const [activeProjectId, setActiveProjectId] = useState(accessibleProjects[0]?.id || '');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [editingSubtaskData, setEditingSubtaskData] = useState<{task: Task, subtask: SubTask} | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  
  // Project Editing State
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  // View & Filter State
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'priority', 'category', 'assignee', 'dueDate']);

  // Load per-user visible columns from localStorage if available
  useEffect(() => {
    try {
      if (currentUser) {
        const raw = localStorage.getItem('nexus_pm_visibleColumns_' + currentUser.id);
        if (raw) {
          const cols = JSON.parse(raw);
          if (Array.isArray(cols)) setVisibleColumns(cols);
        }
      }
    } catch (e) {
      console.error('Failed to load visibleColumns from storage', e);
    }
  }, [currentUser]);

  // Initial Project selection logic
  useEffect(() => {
     if (accessibleProjects.length > 0 && !accessibleProjects.find(p => p.id === activeProjectId)) {
       setActiveProjectId(accessibleProjects[0].id);
     }
  }, [accessibleProjects, activeProjectId]);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    addProject(newProjectName, newProjectDescription);
    setIsNewProjectModalOpen(false);
    setNewProjectName('');
    setNewProjectDescription('');
  };

  const handleEditProject = () => {
      const p = projects.find(p => p.id === activeProjectId);
      if (p) setEditingProject(p);
      setIsProjectMenuOpen(false);
  };

  const handleDeleteProject = async () => {
      if (!activeProjectId) {
        alert('No project selected to delete.');
        setIsProjectMenuOpen(false);
        return;
      }

      if (!window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
        setIsProjectMenuOpen(false);
        return;
      }

      try {
        await deleteProject(activeProjectId);
        // Clear selection; useEffect will pick a new active project from updated list
        setActiveProjectId('');
      } catch (err) {
        console.error('Failed to delete project:', err);
        alert('Failed to delete project. See console for details.');
      } finally {
        setIsProjectMenuOpen(false);
      }
  };

  const toggleColumn = (col: string) => {
      setVisibleColumns(prev => {
        const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
        try {
         if (currentUser) localStorage.setItem('nexus_pm_visibleColumns_' + currentUser.id, JSON.stringify(next));
        } catch (e) { console.error('Failed to save visibleColumns to storage', e); }
        return next;
      });
  };

  // Determine access level: Admins get 'write', others check map
  const currentAccess = currentUser?.role === UserRole.ADMIN 
      ? 'write' 
      : (currentUser?.projectAccess[activeProjectId] || 'none');
      
  const canEdit = currentAccess === 'write';
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  
  // Filter Tasks
  const projectTasks = tasks
    .filter(t => t.projectId === activeProjectId)
    .filter(t => 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      moveTask(taskId, status);
    }
    setDraggedTaskId(null);
  };

  if (accessibleProjects.length === 0 && currentUser?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
        <LockKeyhole size={48} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-600">No Projects Accessible</h2>
        <p>Contact your administrator to gain access to projects.</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col relative overflow-hidden">
      {/* Header Section */}
      <div className="flex flex-col space-y-4 mb-6 shrink-0">
        
        {/* Row 1: Title and Project Tabs */}
        <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {accessibleProjects.map(p => {
                        // Check explicit read-only status for non-admins
                        const isReadOnly = currentUser?.role !== UserRole.ADMIN && currentUser?.projectAccess[p.id] === 'read';
                        
                        return (
                        <button
                            key={p.id}
                            onClick={() => setActiveProjectId(p.id)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border flex items-center space-x-2 ${
                            activeProjectId === p.id 
                            ? 'bg-indigo-600 text-white border-indigo-600' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <span>{p.name}</span>
                            {isReadOnly && <LockKeyhole size={12} className="opacity-75" />}
                        </button>
                        );
                    })}
                    {currentUser?.role === UserRole.ADMIN && (
                    <button
                        onClick={() => setIsNewProjectModalOpen(true)}
                        className="px-3 py-1 rounded-full text-sm font-medium transition-colors border border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 bg-white flex items-center space-x-1"
                    >
                        <Plus size={14} />
                        <span>New Project</span>
                    </button>
                    )}
                    
                    {/* Project Menu Button (3 Dots) */}
                    {activeProjectId && (
                        <div className="relative ml-2">
                             <button 
                                onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                                className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-colors"
                             >
                                 <MoreVertical size={16} />
                             </button>
                             {isProjectMenuOpen && (
                                 <>
                                     <div className="fixed inset-0 z-10" onClick={() => setIsProjectMenuOpen(false)}></div>
                                     <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 py-1">
                                         <button 
                                            onClick={handleEditProject}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center"
                                         >
                                             <Settings size={14} className="mr-2" /> Project Details
                                         </button>
                                         {isAdmin && (
                                            <button 
                                                onClick={handleDeleteProject}
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                                            >
                                                <Trash2 size={14} className="mr-2" /> Delete Project
                                            </button>
                                         )}
                                     </div>
                                 </>
                             )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Action Buttons */}
            {canEdit && (
            <button 
                onClick={() => setIsNewTaskModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm shrink-0"
            >
                <Plus size={18} className="mr-2" /> New Task
            </button>
            )}
        </div>

        {/* Row 2: Controls (Search, View Toggle, Columns) */}
        {accessibleProjects.length > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                
                {/* Search Box */}
                <div className="relative w-full max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search tasks..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
                    />
                </div>

                <div className="flex items-center space-x-2">
                     {/* View Switcher */}
                     <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                        <button 
                            onClick={() => setViewMode('kanban')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Kanban Board"
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                            title="List View"
                        >
                            <List size={18} />
                        </button>
                     </div>

                     {/* Column Customizer (List View Only) */}
                     {viewMode === 'list' && (
                         <div className="relative">
                             <button 
                                onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isColumnMenuOpen ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                             >
                                 <SlidersHorizontal size={16} />
                                 <span className="hidden sm:inline">Columns</span>
                             </button>
                             
                             {isColumnMenuOpen && (
                                 <>
                                 <div className="fixed inset-0 z-10" onClick={() => setIsColumnMenuOpen(false)}></div>
                                 <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 p-2 animate-in fade-in zoom-in-95 duration-150">
                                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Show Columns</div>
                                     <div className="space-y-1">
                                         {['status', 'priority', 'category', 'assignee', 'dueDate', 'created'].map(col => (
                                             <button 
                                                key={col}
                                                onClick={() => toggleColumn(col)}
                                                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 text-sm flex items-center justify-between"
                                             >
                                                 <span className="capitalize">{col.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                 {visibleColumns.includes(col) && <Check size={14} className="text-indigo-600"/>}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                                 </>
                             )}
                         </div>
                     )}
                </div>
            </div>
        )}
      </div>

      {accessibleProjects.length === 0 && currentUser?.role === UserRole.ADMIN ? (
         <div className="flex flex-col items-center justify-center flex-1 text-slate-400 p-8 text-center border-2 border-dashed border-slate-200 rounded-xl m-4 bg-slate-50/50">
           <div className="p-4 bg-white rounded-full shadow-sm mb-4">
              <Plus size={32} className="text-indigo-500" />
           </div>
           <h2 className="text-lg font-semibold text-slate-700 mb-2">Start your first project</h2>
           <p className="max-w-md mb-6 text-sm">Create a project to start tracking tasks and collaborating with your team.</p>
           <button
             onClick={() => setIsNewProjectModalOpen(true)}
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all"
           >
             Create Project
           </button>
         </div>
      ) : (
        <div className="flex-1 min-h-0 relative">
            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-x-auto pb-2">
                    <KanbanColumn 
                        title="To Do" 
                        status={TaskStatus.TODO}
                        tasks={projectTasks.filter(t => t.status === TaskStatus.TODO)}
                        canEdit={canEdit}
                        users={users}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragStart={onDragStart}
                        onEditTask={setEditingTask}
                        onEditSubtask={(t, s) => setEditingSubtaskData({ task: t, subtask: s })}
                        onUpdateTask={updateTask}
                    />
                    <KanbanColumn 
                        title="In Progress" 
                        status={TaskStatus.IN_PROGRESS}
                        tasks={projectTasks.filter(t => t.status === TaskStatus.IN_PROGRESS)}
                        canEdit={canEdit}
                        users={users}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragStart={onDragStart}
                        onEditTask={setEditingTask}
                        onEditSubtask={(t, s) => setEditingSubtaskData({ task: t, subtask: s })}
                        onUpdateTask={updateTask}
                    />
                    <KanbanColumn 
                        title="Done" 
                        status={TaskStatus.DONE}
                        tasks={projectTasks.filter(t => t.status === TaskStatus.DONE)}
                        canEdit={canEdit}
                        users={users}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragStart={onDragStart}
                        onEditTask={setEditingTask}
                        onEditSubtask={(t, s) => setEditingSubtaskData({ task: t, subtask: s })}
                        onUpdateTask={updateTask}
                    />
                </div>
            ) : (
                <ListView 
                    tasks={projectTasks} 
                    users={users} 
                    onEditTask={setEditingTask}
                    visibleColumns={visibleColumns}
                />
            )}
        </div>
      )}

      {(editingTask || isNewTaskModalOpen) && (
        <TaskEditor 
          task={editingTask} 
          onClose={() => { setEditingTask(null); setIsNewTaskModalOpen(false); }}
          projectId={activeProjectId}
          readOnly={!canEdit}
        />
      )}

      {editingSubtaskData && (
        <SubtaskEditor
          task={editingSubtaskData.task}
          subtask={editingSubtaskData.subtask}
          onClose={() => setEditingSubtaskData(null)}
          readOnly={!canEdit}
        />
      )}

      {editingProject && (
        <ProjectEditor
            project={editingProject}
            onClose={() => setEditingProject(null)}
            readOnly={!canEdit && !isAdmin}
        />
      )}

      <Modal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        title="Create New Project"
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
            <input
              required
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. Q4 Marketing Campaign"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={newProjectDescription}
              onChange={(e) => setNewProjectDescription(e.target.value)}
              placeholder="Briefly describe the project goals..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] resize-none"
            />
          </div>
          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsNewProjectModalOpen(false)}
              className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg"
            >
              Create Project
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ... Rest of the file (Editor Components) remains unchanged ...
// TaskEditor, SubtaskEditor, ProjectEditor follow...
// (Included here for completeness if needed by the XML parser to replace full file, otherwise truncated)
const TaskEditor: React.FC<{
  task: Task | null;
  onClose: () => void;
  projectId: string;
  readOnly: boolean;
}> = ({ task, onClose, projectId, readOnly }) => {
  const { addTask, updateTask, users, triggerNotification, currentUser } = useApp();
  const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[projectId] === 'write');
  const [formData, setFormData] = useState<Task>(task || {
    id: 't-' + Date.now(),
    projectId,
    title: '',
    description: '',
    status: TaskStatus.TODO,
    category: TaskCategory.TASK,
    priority: 'medium',
    subtasks: [],
    attachments: [],
    comments: [],
    createdAt: Date.now()
  });

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [expandedSections, setExpandedSections] = useState({ attachments: false, subtasks: false, comments: true });
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionPosProject, setMentionPosProject] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // allow attachments for all users
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const newAttachment: Attachment = {
        id: 'a-' + Date.now() + Math.random(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        url: URL.createObjectURL(file),
        ownerId: currentUser?.id
      };
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
      setExpandedSections(prev => ({ ...prev, attachments: true }));
    }
  };

  const deleteAttachment = (id: string) => {
    const att = formData.attachments.find(a => a.id === id);
    const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[projectId] === 'write');
    if (!att) return;
    if (!userHasWrite && currentUser?.id !== att.ownerId) return;
    setFormData(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task) {
      updateTask(formData);
    } else {
      addTask(formData);
      // Notify assignee if set on creation
      if (formData.assigneeId) {
         triggerNotification(
           formData.assigneeId, 
           NotificationType.ASSIGNMENT, 
           'New Task Assigned', 
           `${currentUser?.name} assigned you to "${formData.title}"`,
           formData.id
         );
      }
    }
    onClose();
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSub: SubTask = {
      id: 'st-' + Date.now(),
      title: newSubtaskTitle,
      completed: false,
      status: TaskStatus.TODO,
      category: TaskCategory.TASK,
      description: '',
      priority: 'medium',
      attachments: [],
      comments: [],
      createdAt: Date.now()
    };
    setFormData(prev => ({ ...prev, subtasks: [...prev.subtasks, newSub] }));
    setNewSubtaskTitle('');
  };

  const deleteComment = (id: string) => {
    const comment = formData.comments.find(c => c.id === id);
    const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[projectId] === 'write');
    if (!comment) return;
    if (!userHasWrite && currentUser?.id !== comment.userId) return;
    setFormData(prev => {
      const updated = { ...prev, comments: prev.comments.filter(c => c.id !== id) };
      if (task) updateTask(updated);
      return updated;
    });
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));

  const insertMention = (name: string) => {
    const cursor = commentInputRef.current?.selectionStart || newComment.length;
    const textBefore = newComment.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    const textAfter = newComment.slice(cursor);
    const newText = textBefore.slice(0, lastAt) + '@' + name + ' ' + textAfter;
    setNewComment(newText);
    setShowMentions(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ')) {
       setMentionQuery(textBefore.slice(lastAt + 1));
       setShowMentions(true);
       // compute dropdown position
       const inp = commentInputRef.current;
       if (inp) {
         const r = inp.getBoundingClientRect();
         setMentionPos({ top: r.bottom + 6, left: r.left, width: r.width });
       }
    } else {
       setShowMentions(false);
       setMentionPos(null);
    }
  };

  useEffect(() => {
    const onScroll = () => {
      if (!showMentions) return;
      const inp = commentInputRef.current;
      if (inp) {
        const r = inp.getBoundingClientRect();
        setMentionPos({ top: r.bottom + 6, left: r.left, width: r.width });
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [showMentions]);

  const addComment = () => {
      if (!newComment.trim() || !currentUser) return;
      const comment: Comment = {
          id: Date.now().toString(),
          userId: currentUser.id,
          text: newComment,
          timestamp: Date.now()
      };
      setFormData(prev => {
        const updated = { ...prev, comments: [...prev.comments, comment] };
        if (task) updateTask(updated);
        return updated;
      });
      // Notify mentioned users
      const lowered = newComment.toLowerCase();
      const mentioned = users.filter(u => lowered.includes('@' + u.name.toLowerCase()));
      mentioned.forEach(mu => {
        if (mu.id === currentUser.id) return;
        triggerNotification(
          mu.id,
          NotificationType.MENTION,
          'You were mentioned',
          `${currentUser?.name} mentioned you in a comment: "${newComment.slice(0, 80)}"`,
          formData.id
        );
      });
      setNewComment('');
      setShowMentions(false);
  };

  // ProjectEditor comment delete helper (reused when editing a project)
  const deleteProjectComment = (id: string) => {
    if (readOnly) return;
    setFormData(prev => ({ ...prev, comments: prev.comments.filter(c => c.id !== id) }));
  };

  const footer = (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 bg-white border rounded">Cancel</button>
      <button type="submit" form="task-edit-form" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded">{task ? 'Save Changes' : 'Create Task'}</button>
    </div>
  );

  return (
    <Modal isOpen={true} onClose={onClose} title={task ? 'Edit Task' : 'New Task'} footer={footer}>
      <form id="task-edit-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - main content */}
          <div className="md:col-span-2 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500 mb-1">TITLE</label>
                <button type="button" onClick={() => { if (!readOnly) setIsTitleEditing(v => !v); }} className="text-slate-400 hover:text-indigo-600 px-2">
                  {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                </button>
              </div>
              <input
                required
                readOnly={readOnly || !isTitleEditing}
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-semibold ${readOnly || !isTitleEditing ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-900 border-slate-200'}`}
                placeholder="Task title"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500 mb-1">DESCRIPTION</label>
                <button type="button" onClick={() => { if (!readOnly) setIsDescriptionEditing(v => !v); }} className="text-slate-400 hover:text-indigo-600 px-2">
                  {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                </button>
              </div>
              <textarea
                readOnly={readOnly || !isDescriptionEditing}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-indigo-500 outline-none min-h-[160px] text-sm ${readOnly || !isDescriptionEditing ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-900 border-slate-200'}`}
                placeholder="Add details about this task..."
              />
            </div>

            

            {/* Subtasks moved to right column (below attachments) */}

              <div className="border-t border-slate-100 pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">COMMENTS ({formData.comments.length})</label>
              {/* Allow comments for all users; deletion controlled by permissions */}
              <div className="mb-3">
                <div className="flex items-start space-x-2 mb-2">
                  <img src={currentUser?.avatar} className="w-8 h-8 rounded-full" />
                  <div className="relative flex-1">
                    <input
                      ref={commentInputRef}
                      type="text"
                      value={newComment}
                      onChange={handleCommentChange}
                      placeholder="Write a comment... (use @ to mention)"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComment())}
                    />
                    <button type="button" onClick={addComment} className="absolute right-2 top-2 text-indigo-600 hover:text-indigo-700"><Send size={16} /></button>
                    {showMentions && mentionPos && (
                      <div style={{ top: mentionPos.top, left: mentionPos.left, width: mentionPos.width }} className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[1200] max-h-48 overflow-y-auto">
                        {filteredUsers.map(u => (
                          <button key={u.id} onClick={() => insertMention(u.name)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 border-b border-slate-50 last:border-0"><img src={u.avatar} className="w-6 h-6 rounded-full" /><span className="text-sm text-slate-700 font-medium">{u.name}</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2">
                {[...formData.comments].reverse().map(c => {
                  const u = users.find(user => user.id === c.userId);
                  const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[projectId] === 'write');
                  return (
                    <div key={c.id} className="text-sm bg-slate-50 p-3 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold text-xs text-slate-600">{u?.name} <span className="font-normal text-slate-400 ml-2 text-[11px]">{new Date(c.timestamp).toLocaleString()}</span></div>
                          {(userHasWrite || currentUser?.id === c.userId) && (
                            <button onClick={() => deleteComment(c.id)} className="text-red-400 hover:text-red-600 ml-2 p-1 rounded"><Trash2 size={14} /></button>
                          )}
                        </div>
                      <div className="text-slate-800 text-sm">{renderWithMentions(c.text, users)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Column - sidebar */}
          <div className="md:col-span-1 bg-slate-50 p-4 rounded-md">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">CATEGORY</label>
                <select
                  disabled={readOnly}
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value as TaskCategory })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value={TaskCategory.TASK}>Task</option>
                  <option value={TaskCategory.STORY}>Story</option>
                  <option value={TaskCategory.ISSUE}>Issue</option>
                  <option value={TaskCategory.BUG}>Bug</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">STATUS</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value={TaskStatus.TODO}>To Do</option>
                  <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                  <option value={TaskStatus.DONE}>Done</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ASSIGNEE</label>
                <select
                  value={formData.assigneeId || ''}
                  onChange={e => setFormData({ ...formData, assigneeId: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">PRIORITY</label>
                <select
                  disabled={!userHasWrite}
                  value={formData.priority}
                  onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">DUE DATE</label>
                <input
                  disabled={!userHasWrite}
                  type="date"
                  value={formData.dueDate || ''}
                  onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>

              {/* Attachments moved here (right column) */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => toggleSection('attachments')}
                    className="flex items-center text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors"
                  >
                    {expandedSections.attachments ? <Minus size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
                    ATTACHMENTS ({formData.attachments.length})
                  </button>
                  {/* Allow attachments for all users; delete controlled by permissions */}
                  <>
                    <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Add attachment" className="flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 p-2 rounded-full transition-colors">
                      <Paperclip size={16} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  </>
                </div>
                {expandedSections.attachments && (
                <div className="grid grid-cols-1 gap-3">
                  {formData.attachments.map(att => (
                    <div key={att.id} className="flex items-center p-3 border border-slate-200 rounded-lg bg-slate-50 group hover:border-indigo-200 transition-colors">
                      <div className="w-10 h-10 bg-white rounded-lg border border-slate-100 flex items-center justify-center text-indigo-500 mr-3"><FileText size={20} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{att.name}</p>
                        <p className="text-xs text-slate-400">{att.size}</p>
                      </div>
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={att.url} download className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-indigo-600"><Download size={14} /></a>
                        {(currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[projectId] === 'write') || currentUser?.id === att.ownerId) && (
                          <button type="button" onClick={() => deleteAttachment(att.id)} className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-red-500"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                  {formData.attachments.length === 0 && <div className="col-span-full text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">No attachments yet.</div>}
                </div>
                )}
              </div>

              {/* Subtasks (moved below attachments in right column) */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <button type="button" onClick={() => toggleSection('subtasks')} className="flex items-center text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors">
                    {expandedSections.subtasks ? <Minus size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
                    SUBTASKS ({formData.subtasks.length})
                  </button>
                  {!readOnly && (
                    <div className="text-sm text-slate-500">&nbsp;</div>
                  )}
                </div>
                {expandedSections.subtasks && (
                  <div className="space-y-2 mb-2">
                    {formData.subtasks.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center bg-slate-50 p-2 rounded">
                        <button type="button" onClick={() => {
                          const newSubtasks = [...formData.subtasks];
                          newSubtasks[idx].completed = !newSubtasks[idx].completed;
                          const updated = { ...formData, subtasks: newSubtasks };
                          setFormData(updated);
                          if (task) updateTask(updated as unknown as Task);
                        }} className={`mr-2 ${sub.completed ? 'text-green-500' : 'text-slate-400'} hover:text-indigo-500 cursor-pointer`}>
                          {sub.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                        <span className={`flex-1 text-sm ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{sub.title}</span>
                        {!readOnly && (
                          <button type="button" onClick={() => setFormData({ ...formData, subtasks: formData.subtasks.filter(s => s.id !== sub.id) })} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={14} /></button>
                        )}
                      </div>
                    ))}
                    {!readOnly && (
                      <div className="flex gap-2">
                        <input type="text" value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} placeholder="Add subtask..." className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())} />
                        <button type="button" onClick={addSubtask} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-sm font-medium">Add</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};

// --- Subtask Editor Component ---
const SubtaskEditor: React.FC<{
  task: Task;
  subtask: SubTask;
  onClose: () => void;
  readOnly: boolean;
}> = ({ task, subtask, onClose, readOnly }) => {
    const { updateTask, users, currentUser, triggerNotification } = useApp();
    const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[task.projectId] === 'write');
    const [formData, setFormData] = useState<SubTask>({ ...subtask });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const commentInputRef = useRef<HTMLInputElement>(null);
    const [newComment, setNewComment] = useState('');
    const [isTitleEditingSub, setIsTitleEditingSub] = useState(false);
    const [isDescriptionEditingSub, setIsDescriptionEditingSub] = useState(false);
    const [expandedSections, setExpandedSections] = useState({ attachments: false, comments: true });
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    const [mentionPosSub, setMentionPosSub] = useState<{ top: number; left: number; width: number } | null>(null);

    const toggleSection = (section: keyof typeof expandedSections) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

    const handleFileUploadSub = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        const newAttachment: Attachment = {
          id: 'a-' + Date.now() + Math.random(),
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type,
          url: URL.createObjectURL(file),
          ownerId: currentUser?.id
        };
        setFormData(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
        setExpandedSections(prev => ({ ...prev, attachments: true }));
      }
    };

    const deleteAttachmentSub = (id: string) => {
      const att = formData.attachments.find(a => a.id === id);
      const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[task.projectId] === 'write');
      if (!att) return;
      if (!userHasWrite && currentUser?.id !== att.ownerId) return;
      setFormData(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
    };

    const handleCommentChangeSub = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setNewComment(val);
      const cursor = e.target.selectionStart || 0;
      const textBefore = val.slice(0, cursor);
      const lastAt = textBefore.lastIndexOf('@');
      if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ')) {
        setMentionQuery(textBefore.slice(lastAt + 1));
        setShowMentions(true);
        const inp = commentInputRef.current;
        if (inp) {
          const r = inp.getBoundingClientRect();
          setMentionPosSub({ top: r.bottom + 6, left: r.left, width: r.width });
        }
      } else {
        setShowMentions(false);
        setMentionPosSub(null);
      }
    };

    const filteredUsersSub = users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));
    const insertMentionSub = (name: string) => {
      const cursor = commentInputRef.current?.selectionStart || newComment.length;
      const textBefore = newComment.slice(0, cursor);
      const lastAt = textBefore.lastIndexOf('@');
      const textAfter = newComment.slice(cursor);
      const newText = textBefore.slice(0, lastAt) + '@' + name + ' ' + textAfter;
      setNewComment(newText);
      setShowMentions(false);
      setTimeout(() => commentInputRef.current?.focus(), 0);
    };

    const addCommentSub = () => {
      if (!newComment.trim() || !currentUser) return;
      const comment: Comment = { id: Date.now().toString(), userId: currentUser.id, text: newComment, timestamp: Date.now() };
      setFormData(prev => {
        const updated = { ...prev, comments: [...prev.comments, comment] };
        // Update parent task immediately so comments are persisted
        const updatedTask = { ...task, subtasks: task.subtasks.map(s => s.id === subtask.id ? updated : s) } as Task;
        updateTask(updatedTask);
        return updated;
      });
      // notify mentioned users
      const lowered = newComment.toLowerCase();
      const mentioned = users.filter(u => lowered.includes('@' + u.name.toLowerCase()));
      mentioned.forEach(mu => {
        if (mu.id === currentUser.id) return;
        triggerNotification(mu.id, NotificationType.MENTION, 'You were mentioned', `${currentUser?.name} mentioned you in a subtask comment: "${newComment.slice(0,80)}"`, subtask.id);
      });
      setNewComment('');
      setShowMentions(false);
    };

    const deleteCommentSub = (id: string) => {
      const comment = formData.comments.find(c => c.id === id);
      const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[task.projectId] === 'write');
      if (!comment) return;
      if (!userHasWrite && currentUser?.id !== comment.userId) return;
      setFormData(prev => {
        const updated = { ...prev, comments: prev.comments.filter(c => c.id !== id) };
        const updatedTask = { ...task, subtasks: task.subtasks.map(s => s.id === subtask.id ? updated : s) } as Task;
        updateTask(updatedTask);
        return updated;
      });
    };

    useEffect(() => {
      const onScroll = () => {
        if (!showMentions) return;
        const inp = commentInputRef.current;
        if (inp) {
          const r = inp.getBoundingClientRect();
          setMentionPosSub({ top: r.bottom + 6, left: r.left, width: r.width });
        }
      };
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
    }, [showMentions]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const updatedSubtasks = task.subtasks.map(s => s.id === subtask.id ? formData : s);
        updateTask({ ...task, subtasks: updatedSubtasks });
        onClose();
    };

    const footer = (
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 bg-white border rounded">Cancel</button>
        <button type="submit" form="subtask-edit-form" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded">Save</button>
      </div>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title="Edit Subtask" footer={footer}>
            <form id="subtask-edit-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                      <button type="button" onClick={() => { if (!readOnly) setIsTitleEditingSub(v => !v); }} className="text-slate-400 hover:text-indigo-600 px-2">
                        {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                      </button>
                    </div>
                    <input
                        required
                        readOnly={readOnly || !isTitleEditingSub}
                        type="text"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${readOnly || !isTitleEditingSub ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-900 border-slate-300'}`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                      <button type="button" onClick={() => { if (!readOnly) setIsDescriptionEditingSub(v => !v); }} className="text-slate-400 hover:text-indigo-600 px-2">
                        {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                      </button>
                    </div>
                    <textarea
                        readOnly={readOnly || !isDescriptionEditingSub}
                        value={formData.description || ''}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] ${readOnly || !isDescriptionEditingSub ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-900 border-slate-300'}`}
                    />
                  </div>


                  {/* Comments */}
                  <div className="border-t border-slate-100 pt-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">COMMENTS ({formData.comments.length})</label>
                    <div className="mb-3">
                      <div className="flex items-start space-x-2 mb-2">
                        <img src={currentUser?.avatar} className="w-8 h-8 rounded-full" />
                        <div className="relative flex-1">
                          <input ref={commentInputRef} type="text" value={newComment} onChange={handleCommentChangeSub} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCommentSub())} placeholder="Write a comment... (use @ to mention)" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                          <button type="button" onClick={addCommentSub} className="absolute right-2 top-2 text-indigo-600 hover:text-indigo-700"><Send size={16} /></button>
                          {showMentions && mentionPosSub && (
                            <div style={{ top: mentionPosSub.top, left: mentionPosSub.left, width: mentionPosSub.width }} className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[1200] max-h-48 overflow-y-auto">
                              {filteredUsersSub.map(u => (
                                <button key={u.id} onClick={() => insertMentionSub(u.name)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 border-b border-slate-50 last:border-0"><img src={u.avatar} className="w-6 h-6 rounded-full" /><span className="text-sm text-slate-700 font-medium">{u.name}</span></button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-4">
                      {[...formData.comments].reverse().map(c => {
                        const u = users.find(user => user.id === c.userId);
                        return (
                          <div key={c.id} className="text-sm bg-slate-50 p-3 rounded">
                            <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-700">{u?.name}</span><div className="flex items-center space-x-2"><span className="text-[10px] text-slate-400">{new Date(c.timestamp).toLocaleString()}</span>{((currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[task.projectId] === 'write')) || currentUser?.id === c.userId) && <button onClick={() => deleteCommentSub(c.id)} className="text-red-400 hover:text-red-600 p-1 rounded"><Trash2 size={14} /></button>}</div></div>
                            <div className="text-slate-800 text-sm">{renderWithMentions(c.text, users)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Right column - sidebar */}
                <div className="md:col-span-1 bg-slate-50 p-4 rounded-md">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">ASSIGNEE</label>
                      <select
                        value={formData.assigneeId || ''}
                        onChange={e => setFormData({ ...formData, assigneeId: e.target.value || undefined })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">PRIORITY</label>
                      <select
                        disabled={!userHasWrite}
                        value={formData.priority}
                        onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">CATEGORY</label>
                      <select
                        disabled={!userHasWrite}
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value={TaskCategory.TASK}>Task</option>
                        <option value={TaskCategory.STORY}>Story</option>
                        <option value={TaskCategory.ISSUE}>Issue</option>
                        <option value={TaskCategory.BUG}>Bug</option>
                      </select>
                    </div>

                    {/* Attachments moved here (right column for SubtaskEditor) */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => toggleSection('attachments')} className="flex items-center text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors">
                          {expandedSections.attachments ? <Minus size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />} ATTACHMENTS ({formData.attachments.length})
                        </button>
                        <>
                          <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Add attachment" className="flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 p-2 rounded-full transition-colors">
                            <Paperclip size={16} />
                          </button>
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUploadSub} />
                        </>
                      </div>
                      {expandedSections.attachments && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {formData.attachments.map(att => (
                            <div key={att.id} className="flex items-center p-3 border border-slate-200 rounded-lg bg-slate-50 group hover:border-indigo-200 transition-colors">
                              <div className="w-10 h-10 bg-white rounded-lg border border-slate-100 flex items-center justify-center text-indigo-500 mr-3"><FileText size={20} /></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{att.name}</p>
                                <p className="text-xs text-slate-400">{att.size}</p>
                              </div>
                              <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={att.url} download className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-indigo-600"><Download size={14} /></a>
                                {(currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[task.projectId] === 'write') || currentUser?.id === att.ownerId) && (
                                  <button type="button" onClick={() => deleteAttachmentSub(att.id)} className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                )}
                              </div>
                            </div>
                          ))}
                          {formData.attachments.length === 0 && <div className="col-span-full text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">No attachments yet.</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              
            </form>
        </Modal>
    );
};

// --- Project Editor Component ---
const ProjectEditor: React.FC<{
  project: Project;
  onClose: () => void;
  readOnly?: boolean;
}> = ({ project, onClose, readOnly }) => {
  const { updateProject, users, currentUser } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Project>({ ...project });
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ attachments: false, comments: true });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSave = () => {
    if (readOnly) return;
    if (!formData.name) return;
    updateProject(formData);
    onClose();
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // allow attachments for all users; deletion controlled by permissions
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const newAttachment: Attachment = {
        id: Date.now().toString(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        url: URL.createObjectURL(file),
        ownerId: currentUser?.id
      };
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
      setExpandedSections(prev => ({ ...prev, attachments: true }));
    }
  };

  const deleteAttachment = (id: string) => {
    const att = formData.attachments.find(a => a.id === id);
    const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[project.id] === 'write');
    if (!att) return;
    if (!userHasWrite && currentUser?.id !== att.ownerId) return;
    setFormData(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
  };

  const addComment = () => {
    if (!newComment || !currentUser) return;
    const comment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.id,
      text: newComment,
      timestamp: Date.now()
    };
    setFormData(prev => ({ ...prev, comments: [...prev.comments, comment] }));
    setNewComment('');
  };

  const deleteProjectComment = (id: string) => {
    const comment = formData.comments.find(c => c.id === id);
    const userHasWrite = currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[project.id] === 'write');
    if (!comment) return;
    if (!userHasWrite && currentUser?.id !== comment.userId) return;
    setFormData(prev => ({ ...prev, comments: prev.comments.filter(c => c.id !== id) }));
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ')) {
       setMentionQuery(textBefore.slice(lastAt + 1));
       setShowMentions(true);
       const inp = commentInputRef.current;
       if (inp) {
         const r = inp.getBoundingClientRect();
         setMentionPosProject({ top: r.bottom + 6, left: r.left, width: r.width });
       }
    } else {
       setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const cursor = commentInputRef.current?.selectionStart || newComment.length;
    const textBefore = newComment.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    const textAfter = newComment.slice(cursor);
    const newText = textBefore.slice(0, lastAt) + '@' + name + ' ' + textAfter;
    setNewComment(newText);
    setShowMentions(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };
  
  const filteredUsers = users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));

  useEffect(() => {
    const onScroll = () => {
      if (!showMentions) return;
      const inp = commentInputRef.current;
      if (inp) {
        const r = inp.getBoundingClientRect();
        setMentionPosProject({ top: r.bottom + 6, left: r.left, width: r.width });
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [showMentions]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 h-[85vh] flex flex-col">
          {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
           <div className="flex items-center space-x-2">
             <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded uppercase">
               Project Details {readOnly && '(View Only)'}
             </span>
             <span className="text-sm text-slate-500 font-mono">#{project.id.slice(-4)}</span>
           </div>
           <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-full">
             <X size={20} />
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
            <div className="space-y-8">
                {/* Title & Desc */}
                <div className="space-y-4">
                    <div>
                       <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Project Name</label>
                       <input
                        readOnly={readOnly}
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full text-2xl font-bold text-slate-800 placeholder-slate-300 border-none focus:ring-0 p-0 focus:outline-none bg-transparent"
                        placeholder="Project Name"
                      />
                    </div>
                     <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                        Description 
                        {!readOnly && (
                          <button 
                            onClick={() => setIsDescriptionEditing(!isDescriptionEditing)}
                            className={`hover:text-indigo-600 transition-colors ${isDescriptionEditing ? 'text-indigo-600' : 'text-slate-400'}`}
                            title={isDescriptionEditing ? "Done Editing" : "Edit Description"}
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </label>
                      <textarea
                        readOnly={readOnly || !isDescriptionEditing}
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className={`w-full min-h-[120px] text-slate-600 leading-relaxed border border-slate-200 rounded-lg p-3 outline-none resize-none ${
                          readOnly || !isDescriptionEditing 
                            ? 'bg-slate-50 focus:ring-0' 
                            : 'bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        }`}
                        placeholder="Project description..."
                      />
                     </div>
                </div>

                {/* Attachments */}
                <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <button 
                            onClick={() => toggleSection('attachments')}
                            className="flex items-center text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors"
                        >
                            {expandedSections.attachments ? <Minus size={16} className="mr-2"/> : <Plus size={16} className="mr-2"/>}
                            ATTACHMENTS ({formData.attachments.length})
                        </button>
                        {/* Allow attachments for all users; deletion controlled by permissions */}
                        <>
                        <button onClick={() => fileInputRef.current?.click()} aria-label="Upload attachment" className="flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 p-2 rounded-full transition-colors">
                          <Paperclip size={16} />
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        </>
                    </div>
                    {expandedSections.attachments && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {formData.attachments.map(att => (
                            <div key={att.id} className="flex items-center p-3 border border-slate-200 rounded-lg bg-slate-50 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 bg-white rounded-lg border border-slate-100 flex items-center justify-center text-indigo-500 mr-3"><FileText size={20} /></div>
                                <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{att.name}</p>
                                <p className="text-xs text-slate-400">{att.size}</p>
                                </div>
                                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-indigo-600"><Download size={14} /></button>
                                {(currentUser?.role === UserRole.ADMIN || (currentUser && currentUser.projectAccess[project.id] === 'write') || currentUser?.id === att.ownerId) && (
                                  <button onClick={() => deleteAttachment(att.id)} className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                )}
                                </div>
                            </div>
                            ))}
                            {formData.attachments.length === 0 && <div className="col-span-full text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">No attachments yet.</div>}
                        </div>
                    )}
                </div>

                {/* Comments */}
                 <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-bold text-slate-700 mb-4">COMMENTS ({formData.comments.length})</h4>
                     {/* Allow comments for all users */}
                     <div className="flex items-start space-x-3 mb-6">
                        <img src={currentUser?.avatar} className="w-8 h-8 rounded-full" />
                        <div className="flex-1 relative">
                           <input ref={commentInputRef} value={newComment} onChange={handleCommentChange} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Write a comment..." className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                           <button type="button" onClick={addComment} className="absolute right-2 top-2 text-indigo-600 hover:text-indigo-700"><Send size={16} /></button>
                           {showMentions && mentionPosProject && (
                             <div style={{ top: mentionPosProject.top, left: mentionPosProject.left, width: mentionPosProject.width }} className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[1200] max-h-48 overflow-y-auto">
                               {filteredUsers.map(u => (
                                 <button key={u.id} onClick={() => insertMention(u.name)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 border-b border-slate-50 last:border-0"><img src={u.avatar} className="w-6 h-6 rounded-full" /><span className="text-sm text-slate-700 font-medium">{u.name}</span></button>
                               ))}
                             </div>
                           )}
                        </div>
                     </div>
                     <div className="max-h-72 overflow-y-auto space-y-4">
                        {[...formData.comments].reverse().map(comment => {
                          const commentUser = users.find(u => u.id === comment.userId);
                          return (
                            <div key={comment.id} className="flex space-x-3">
                               <img src={commentUser?.avatar} className="w-8 h-8 rounded-full" />
                               <div className="flex-1 bg-slate-50 p-3 rounded-lg rounded-tl-none">
                                          <div className="flex justify-between items-center mb-1">
                                            <div className="text-xs font-bold text-slate-700">{commentUser?.name}</div>
                                            <div className="flex items-center space-x-2">
                                              <span className="text-[10px] text-slate-400">{new Date(comment.timestamp).toLocaleString()}</span>
                                              {!readOnly && currentUser?.id === comment.userId && (
                                                <button onClick={() => deleteProjectComment(comment.id)} className="text-red-400 hover:text-red-600 p-1 rounded"><Trash2 size={14} /></button>
                                              )}
                                            </div>
                                          </div>
                                            <p className="text-sm text-slate-600">{renderWithMentions(comment.text, users)}</p>
                               </div>
                            </div>
                          )
                        })}
                     </div>
                 </div>
            </div>
        </div>
        
         {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button onClick={handleSave} className="px-8 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98]">Save Changes</button>}
        </div>
      </div>
    </div>
  );
};