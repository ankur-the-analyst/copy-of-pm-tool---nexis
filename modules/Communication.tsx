import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { 
  Send, Phone, Video, Mic, MicOff, VideoOff, 
  Monitor, PhoneOff, Search, Users, ChevronLeft, 
  Paperclip, FileText, Image as ImageIcon, X, Plus, Check, BellRing,
  Maximize2, Minimize2, PictureInPicture, UserPlus, Layout, MoreVertical, Trash2,
  PhoneMissed
} from 'lucide-react';
import { User, Attachment, Group, NotificationType } from '../types';
import { Modal } from '../components/Modal';

export const Communication: React.FC = () => {
  const { 
    messages, addMessage, currentUser, users, groups, createGroup, markChatRead, getUnreadCount, 
    startCall, startGroupCall, addToCall, endCall, isInCall, activeCallData, localStream, remoteStreams, isScreenSharing, toggleScreenShare,
    isMicOn, isCameraOn, toggleMic, toggleCamera, deletedMessageIds, clearChatHistory,
    // incoming call helpers
    incomingCall, acceptIncomingCall, rejectIncomingCall
  } = useApp();
  
  // UI State
  const [selectedChat, setSelectedChat] = useState<User | Group | null>(null); 
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false); 
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [viewMode, setViewMode] = useState<'default' | 'fullscreen' | 'pip'>('default');

  // Chat Visibility State
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const [manualChatIds, setManualChatIds] = useState<string[]>([]); // Chats manually opened via "New Chat"
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null); // For the 3-dot menu
  const [activeHeaderMenu, setActiveHeaderMenu] = useState(false); // For header 3-dot menu

  // Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatSearchTerm, setNewChatSearchTerm] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedUserIdsForGroup, setSelectedUserIdsForGroup] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');

  // Video Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGroup = (chat: any): chat is Group => {
    return chat && 'memberIds' in chat;
  };

  const isUser = (chat: any): chat is User => {
    return chat && 'username' in chat;
  };

  // Switch chat view if an active call exists for a specific user and it's 1:1
  useEffect(() => {
    if (activeCallData && !selectedChat && activeCallData.invitedIds.length === 1) {
       const partner = users.find(u => u.id === activeCallData.invitedIds[0]);
       if (partner) setSelectedChat(partner);
    }
  }, [activeCallData, users]);

  // Handle auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isInCall, attachments, selectedChat, deletedMessageIds]);

  // Restore hidden chats if a new message arrives
  useEffect(() => {
    if (!currentUser) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !deletedMessageIds.has(lastMessage.id)) {
       // If I receive a message from someone I hid, unhide them
       if (lastMessage.senderId !== currentUser.id && hiddenChatIds.includes(lastMessage.senderId)) {
          setHiddenChatIds(prev => prev.filter(id => id !== lastMessage.senderId));
       }
       // If I receive a group message for a hidden group, unhide it
       if (lastMessage.recipientId && hiddenChatIds.includes(lastMessage.recipientId) && lastMessage.senderId !== currentUser.id) {
           setHiddenChatIds(prev => prev.filter(id => id !== lastMessage.recipientId));
       }
    }
  }, [messages, currentUser, hiddenChatIds, deletedMessageIds]);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current) {
        if (!localStream) {
            localVideoRef.current.srcObject = null;
        } else {
            localVideoRef.current.srcObject = localStream;
        }
    }
  }, [localStream, isInCall, viewMode, isCameraOn]);

  // Reset view mode when call ends
  useEffect(() => {
    if (!isInCall) setViewMode('default');
  }, [isInCall]);

  // Close menu on click outside (simple implementation)
  useEffect(() => {
    const closeMenu = () => {
        setActiveMenuId(null);
        setActiveHeaderMenu(false);
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);


  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() || attachments.length > 0) {
      addMessage(inputText, selectedChat?.id, attachments);
      setInputText('');
      setAttachments([]);
      
      // Ensure the chat remains visible if it was manual
      if (selectedChat) {
          setManualChatIds(prev => [...prev, selectedChat.id]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAttachments: Attachment[] = Array.from(e.target.files).map((file: File) => ({
        id: Date.now().toString() + Math.random(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        url: URL.createObjectURL(file)
      }));
      setAttachments(prev => [...prev, ...newAttachments]);
      e.target.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleChatSelect = (chat: User | Group | null) => {
    setSelectedChat(chat);
    setShowMobileChat(true);
    
    // Mark as read
    const chatId = chat ? chat.id : 'general';
    markChatRead(chatId);
  };

  const handleHideChat = (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation();
      setHiddenChatIds(prev => [...prev, chatId]);
      if (selectedChat?.id === chatId) {
          setSelectedChat(null);
      }
      setActiveMenuId(null);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation();
      await clearChatHistory(chatId);
      // Optional: Hide after delete
      // setHiddenChatIds(prev => [...prev, chatId]);
      setActiveMenuId(null);
      setActiveHeaderMenu(false);
  };

    const handleStartCall = async (video: boolean) => {
      try {
      if (selectedChat && isUser(selectedChat)) {
        await startCall(selectedChat.id, video);
      } else {
        // Team Chat or Group Chat
        let recipients: string[] = [];
        
        if (!selectedChat) {
            // Team Chat: Invite all other users
            recipients = users.filter(u => u.id !== currentUser?.id).map(u => u.id);
        } else if (isGroup(selectedChat)) {
            // Group Chat: Invite all other group members
            recipients = selectedChat.memberIds.filter(id => id !== currentUser?.id);
        }

        if (recipients.length > 0) {
            await startGroupCall(recipients, video);
        }
     }
     } catch (e) {
       console.error('Failed to start call:', e);
       alert('Failed to start call. See console for details.');
     }
  };

  const handleInviteUser = (userId: string) => {
      addToCall(userId);
      setIsInviteModalOpen(false);
  };

  const handleCreateChat = () => {
    if (selectedUserIdsForGroup.length === 0) return;

    if (selectedUserIdsForGroup.length === 1) {
      // 1:1 Chat
      const user = users.find(u => u.id === selectedUserIdsForGroup[0]);
      if (user) {
          // Unhide if hidden
          setHiddenChatIds(prev => prev.filter(id => id !== user.id));
          // Mark as manually opened
          setManualChatIds(prev => [...prev, user.id]);
          handleChatSelect(user);
      }
    } else {
      // Group Chat
      if (!newGroupName.trim()) return;
      createGroup(newGroupName, selectedUserIdsForGroup);
    }
    setIsNewChatModalOpen(false);
    setNewChatSearchTerm('');
    setSelectedUserIdsForGroup([]);
    setNewGroupName('');
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIdsForGroup.includes(userId)) {
      setSelectedUserIdsForGroup(prev => prev.filter(id => id !== userId));
    } else {
      setSelectedUserIdsForGroup(prev => [...prev, userId]);
    }
  };

  // Helper to get last message timestamp for sorting, IGNORING deleted messages
  const getLastMsgTimestamp = (chatId: string, isGroupChat: boolean) => {
    const relevantMsgs = messages.filter(m => {
      if (deletedMessageIds.has(m.id)) return false; // Ignore deleted
      if (isGroupChat) {
        return m.recipientId === chatId;
      } else {
        return (m.senderId === currentUser?.id && m.recipientId === chatId) ||
               (m.senderId === chatId && m.recipientId === currentUser?.id);
      }
    });
    return relevantMsgs.length > 0 ? relevantMsgs[relevantMsgs.length - 1].timestamp : 0;
  };

  // Logic to determine if a user/group should be shown in sidebar
  const isChatVisible = (id: string, isGroupChat: boolean) => {
    if (hiddenChatIds.includes(id)) return false;
    if (manualChatIds.includes(id)) return true; // Explicitly opened

    // Check history (excluding deleted)
    const hasHistory = messages.some(m => {
        if (deletedMessageIds.has(m.id)) return false;
        if (isGroupChat) return m.recipientId === id;
        return (m.senderId === currentUser?.id && m.recipientId === id) ||
               (m.senderId === id && m.recipientId === currentUser?.id);
    });

    return hasHistory;
  };

  // Filter messages based on selection and deleted status
  const currentMessages = messages.filter(msg => {
    if (deletedMessageIds.has(msg.id)) return false;

    if (!selectedChat) {
      return !msg.recipientId;
    } else if (isGroup(selectedChat)) {
      return msg.recipientId === selectedChat.id;
    } else {
      return (msg.senderId === currentUser?.id && msg.recipientId === selectedChat.id) ||
             (msg.senderId === selectedChat.id && msg.recipientId === currentUser?.id);
    }
  });

  const filteredUsers = users
    .filter(u => 
      u.id !== currentUser?.id && 
      (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.username.toLowerCase().includes(searchTerm.toLowerCase())) &&
       isChatVisible(u.id, false)
    )
    .sort((a, b) => getLastMsgTimestamp(b.id, false) - getLastMsgTimestamp(a.id, false));

  const filteredGroups = groups
    .filter(g => 
      g.memberIds.includes(currentUser?.id || '') && 
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      isChatVisible(g.id, true)
    )
    .sort((a, b) => getLastMsgTimestamp(b.id, true) - getLastMsgTimestamp(a.id, true));

  // --- Call Interface Component ---
  const CallInterface = () => {
    // Determine the main "Spotlight" user (default to first remote participant)
    const spotlightUserId = activeCallData?.invitedIds[0];
    const spotlightStream = spotlightUserId ? remoteStreams.get(spotlightUserId) : null;
    const spotlightUser = users.find(u => u.id === spotlightUserId);

    // Sidebar Users: Local + Remote participants excluding spotlight
    const sidebarParticipantIds = activeCallData?.invitedIds.slice(1) || [];

    return (
      <div className={`
        ${viewMode === 'fullscreen' ? 'fixed inset-0 z-[100] bg-slate-900' : ''}
        ${viewMode === 'pip' ? 'fixed bottom-4 right-4 z-[100] w-80 h-auto bg-slate-800 rounded-xl shadow-2xl border border-slate-700' : ''}
        ${viewMode === 'default' ? 'absolute inset-0 z-20 bg-slate-900' : ''}
        flex flex-col overflow-hidden transition-all duration-300
      `}>
         {/* ... Call Header & Content ... (No changes here mostly) */}
         <div className={`
           absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start 
           bg-gradient-to-b from-black/60 to-transparent pointer-events-none
           ${viewMode === 'pip' ? 'p-2' : ''}
         `}>
            {/* ... */}
            <div className="flex items-center text-white pointer-events-auto">
                   {activeCallData && !viewMode.includes('pip') && (
                 <div className="bg-red-500/80 px-3 py-1 rounded-full text-xs font-semibold animate-pulse mr-3 flex items-center">
                   <div className="w-2 h-2 bg-white rounded-full mr-2"></div>
                   {activeCallData.isVideo ? 'Video Call' : 'Audio Call'}
                   {activeCallData.invitedIds.length > 0 && <span className="ml-2 text-[10px] opacity-80">({activeCallData.invitedIds.length + 1} People)</span>}
                 </div>
               )}
            </div>
            
            <div className="flex space-x-2 pointer-events-auto">
              {viewMode !== 'pip' && (
                <button 
                  onClick={() => setViewMode('pip')}
                  className="p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg transition-colors backdrop-blur-sm"
                  title="Picture in Picture"
                >
                  <PictureInPicture size={20} />
                </button>
              )}
              
              <button 
                onClick={() => setViewMode(viewMode === 'fullscreen' ? 'default' : 'fullscreen')}
                className="p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg transition-colors backdrop-blur-sm"
                title={viewMode === 'fullscreen' ? "Exit Full Screen" : "Full Screen"}
              >
                {viewMode === 'fullscreen' ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>
         </div>
  
         {/* Main Layout Area */}
         <div className={`flex-1 flex overflow-hidden ${viewMode === 'pip' ? 'block' : 'flex-col md:flex-row'}`}>
             
             {viewMode === 'pip' ? (
               // --- PiP View ---
               <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
                  {spotlightUserId ? (
                     <RemoteVideoPlayer stream={spotlightStream || new MediaStream()} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs">Waiting...</div>
                  )}
                  <button 
                    onClick={() => setViewMode('default')}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Maximize2 className="text-white" size={24} />
                  </button>
               </div>
             ) : (
               // --- Standard/Fullscreen View ---
               <>
                 {/* 1. Main Stage (Spotlight) */}
                 <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
                    {spotlightUserId ? (
                        <div className="w-full h-full relative">
                           {spotlightStream ? (
                             <RemoteVideoPlayer stream={spotlightStream} isMainStage={true} />
                           ) : (
                             <div className="w-full h-full flex flex-col items-center justify-center animate-pulse">
                               <img src={spotlightUser?.avatar} className="w-24 h-24 rounded-full border-4 border-slate-700 opacity-50 mb-4" />
                               <span className="text-slate-400 text-lg">Connecting to {spotlightUser?.name}...</span>
                             </div>
                           )}
                           <div className="absolute bottom-6 left-6 text-white font-medium flex items-center bg-black/40 px-4 py-2 rounded-full text-base backdrop-blur-sm z-20">
                              {spotlightUser?.name || 'Unknown'}
                           </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500">
                           <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
                              <Users size={32} className="opacity-50" />
                           </div>
                           <p>Waiting for others to join...</p>
                        </div>
                    )}
                 </div>

                 {/* 2. Sidebar (Sideways Column) */}
                 <div className="w-full md:w-64 bg-slate-900 border-l border-slate-800 flex flex-row md:flex-col p-3 space-x-3 md:space-x-0 md:space-y-3 overflow-x-auto md:overflow-y-auto shrink-0 z-10">
                    
                    {/* Local User Card */}
                    <div className="relative shrink-0 w-40 md:w-full aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-md group">
                       <video 
                         ref={localVideoRef} 
                         autoPlay 
                         muted 
                         playsInline 
                         className={`w-full h-full object-cover transform scale-x-[-1] ${!isCameraOn ? 'hidden' : ''}`} 
                       />
                       {!isCameraOn && (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800">
                             <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mb-1">
                                <span className="text-white text-xs font-bold">YOU</span>
                             </div>
                          </div>
                       )}
                       <div className="absolute bottom-2 left-2 text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                           You {!isMicOn && <MicOff size={10} className="inline ml-1 text-red-400"/>}
                       </div>
                    </div>

                    {/* Other Remote Users in Sidebar */}
                    {sidebarParticipantIds.map(userId => {
                       const user = users.find(u => u.id === userId);
                       const stream = remoteStreams.get(userId);
                       return (
                          <div key={userId} className="relative shrink-0 w-40 md:w-full aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-md">
                             {stream ? (
                               <RemoteVideoPlayer stream={stream} />
                             ) : (
                               <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 animate-pulse">
                                  <img src={user?.avatar} className="w-8 h-8 rounded-full opacity-50 mb-1" />
                                  <span className="text-[10px] text-slate-400">Connecting...</span>
                               </div>
                             )}
                             <div className="absolute bottom-2 left-2 text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm truncate max-w-[90%]">
                               {user?.name}
                             </div>
                          </div>
                       );
                    })}
                    
                    {/* Invite Placeholder if few people */}
                    {activeCallData && activeCallData.invitedIds.length < 3 && (
                       <button 
                         onClick={() => setIsInviteModalOpen(true)}
                         className="shrink-0 w-40 md:w-full aspect-video bg-slate-800/50 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-slate-800 transition-all"
                       >
                          <UserPlus size={20} className="mb-2" />
                          <span className="text-xs font-medium">Add Member</span>
                       </button>
                    )}

                 </div>
               </>
             )}
         </div>
  
         {/* Call Controls (same as before) */}
         {viewMode !== 'pip' && (
           <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 z-50">
             <div className="bg-slate-900/90 backdrop-blur-md rounded-full px-6 py-3 border border-slate-700 shadow-2xl flex items-center space-x-4">
                  <button onClick={toggleMic} className={`p-3 rounded-full transition-transform hover:scale-110 ${!isMicOn ? 'bg-red-50 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{!isMicOn ? <MicOff size={20} /> : <Mic size={20} />}</button>
                  {/* Hide camera and screen-share controls for audio-only calls */}
                  {activeCallData?.isVideo && (
                    <>
                      <button onClick={toggleCamera} className={`p-3 rounded-full transition-transform hover:scale-110 ${!isCameraOn ? 'bg-red-50 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{!isCameraOn ? <VideoOff size={20} /> : <Video size={20} />}</button>
                      <button onClick={toggleScreenShare} className={`p-3 rounded-full transition-transform hover:scale-110 ${isScreenSharing ? 'bg-blue-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}><Monitor size={20} /></button>
                    </>
                  )}
                <div className="w-px h-8 bg-slate-700 mx-2"></div>
                <button onClick={() => setIsInviteModalOpen(true)} className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg transition-transform hover:scale-110"><UserPlus size={20} /></button>
                <button onClick={endCall} className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg transition-transform hover:scale-110"><PhoneOff size={20} /></button>
             </div>
           </div>
         )}
      </div>
    );
  };
  
  // --- Invite Modal ---
  const InviteModal = () => (
      <Modal 
         isOpen={isInviteModalOpen}
         onClose={() => setIsInviteModalOpen(false)}
         title="Add Member to Call"
      >
          {/* ... Invite Modal Content ... */}
           <div className="space-y-4">
              <div className="relative">
                 <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                 <input type="text" placeholder="Search members..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                 {users.filter(u => u.id !== currentUser?.id && !activeCallData?.invitedIds.includes(u.id)).map(user => (
                     <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100">
                         <div className="flex items-center"><div className="relative mr-3"><img src={user.avatar} className="w-10 h-10 rounded-full" /><div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${user.isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div></div><span className="font-medium text-slate-800">{user.name}</span></div>
                         <button onClick={() => handleInviteUser(user.id)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-2 rounded-lg transition-colors"><Phone size={18} /></button>
                     </div>
                 ))}
                 {users.filter(u => u.id !== currentUser?.id && !activeCallData?.invitedIds.includes(u.id)).length === 0 && <div className="text-center text-slate-400 py-4 text-sm">No other users available to add.</div>}
              </div>
          </div>
      </Modal>
  );

  // --- Incoming Call Modal ---
  const IncomingCallModal = () => {
    if (!incomingCall) return null;
    const caller = users.find(u => u.id === incomingCall.callerId);
    return (
      <Modal isOpen={true} onClose={() => rejectIncomingCall()} title="Incoming Call">
        <div className="space-y-4 text-center">
          <div className="flex items-center justify-center">
            <img src={caller?.avatar} className="w-16 h-16 rounded-full mr-3" />
          </div>
          <div className="text-lg font-semibold">{caller?.name || 'Unknown'}</div>
          <div className="text-sm text-slate-500">{incomingCall.isVideo ? 'Video Call' : 'Audio Call'}</div>
          <div className="pt-4 flex items-center justify-center space-x-4">
            <button onClick={async () => { await acceptIncomingCall(); }} className="px-4 py-2 bg-green-600 text-white rounded-lg">Accept</button>
            <button onClick={() => rejectIncomingCall()} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg border">Reject</button>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="flex flex-1 bg-white md:rounded-xl md:shadow-sm md:border md:border-slate-200 overflow-hidden md:m-6 m-0 relative">
      
      {/* Call Interface Injection */}
      {isInCall && <CallInterface />}
      <InviteModal />

      {/* --- LEFT SIDEBAR (User List) --- */}
      <div className={`
        w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col
        ${showMobileChat ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex justify-between items-center mb-3">
             <div className="flex items-center space-x-2">
                 <h2 className="text-lg font-bold text-slate-800">Messages</h2>
             </div>
             <button 
               onClick={() => setIsNewChatModalOpen(true)}
               className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
               title="New Chat / Group"
             >
               <Plus size={20} />
             </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search people & groups..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-lg py-2.5 pl-9 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Team Chat Option */}
          <button
            onClick={() => handleChatSelect(null)}
            className={`w-full flex items-center p-3 rounded-lg transition-colors ${
              selectedChat === null ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 relative ${selectedChat === null ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
              <Users size={20} />
              {getUnreadCount('general') > 0 && (
                <span className="absolute -top-2 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" aria-hidden></span>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Team Chat</div>
              <div className="text-xs opacity-70 truncate">General channel</div>
            </div>
          </button>

          {/* Groups Section */}
          {filteredGroups.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Groups</div>
              {filteredGroups.map(group => (
                <div key={group.id} className="relative group/item">
                    <button
                    onClick={() => handleChatSelect(group)}
                    className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                        isGroup(selectedChat) && selectedChat.id === group.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
                    }`}
                    >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 border border-blue-200 relative">
                        <span className="font-bold text-xs">{group.name.substring(0,2).toUpperCase()}</span>
                        {getUnreadCount(group.id) > 0 && (
                        <span className="absolute -top-2 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" aria-hidden></span>
                        )}
                    </div>
                    <div className="flex-1 text-left min-w-0 pr-6">
                        <div className="flex justify-between items-baseline">
                        <div className="font-semibold text-sm truncate">{group.name}</div>
                        {getLastMsgTimestamp(group.id, true) > 0 && (
                            <span className="text-[10px] opacity-60 ml-2 whitespace-nowrap">
                            {new Date(getLastMsgTimestamp(group.id, true)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </span>
                        )}
                        </div>
                        <div className="text-xs opacity-70 truncate">{group.memberIds.length} members</div>
                    </div>
                    </button>
                    {/* Context Menu Button */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === group.id ? null : group.id); }}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover/item:opacity-100 transition-opacity"
                    >
                        <MoreVertical size={16} />
                    </button>
                    {activeMenuId === group.id && (
                        <div className="absolute right-0 top-8 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-36 py-1">
                            <button 
                                onClick={(e) => handleHideChat(e, group.id)}
                                className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center"
                            >
                                <X size={12} className="mr-2" /> Hide Chat
                            </button>
                            <button 
                                onClick={(e) => handleDeleteChat(e, group.id)}
                                className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                            >
                                <Trash2 size={12} className="mr-2" /> Delete Chat
                            </button>
                        </div>
                    )}
                </div>
              ))}
            </>
          )}

          {/* DMs Section */}
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Direct Messages</div>
          
          {filteredUsers.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
                  No active conversations. <br/>Start a new chat!
              </div>
          )}

          {filteredUsers.map(user => {
            const lastMsg = messages.filter(m => 
              !deletedMessageIds.has(m.id) &&
              ((m.senderId === user.id && m.recipientId === currentUser?.id) || 
               (m.senderId === currentUser?.id && m.recipientId === user.id))
            ).pop();
            const unread = getUnreadCount(user.id);

            return (
              <div key={user.id} className="relative group/item">
                <button
                    onClick={() => handleChatSelect(user)}
                    className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                    isUser(selectedChat) && selectedChat.id === user.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
                    }`}
                >
                    <div className="relative mr-3">
                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full border border-slate-200" />
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${user.isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                    {unread > 0 && (
                      <span className="absolute -top-2 -right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden></span>
                    )}
                    </div>
                    <div className="flex-1 text-left min-w-0 pr-6">
                    <div className="flex justify-between items-baseline">
                        <div className={`text-sm truncate ${unread > 0 ? 'font-bold text-slate-900' : 'font-semibold'}`}>{user.name}</div>
                        {lastMsg && (
                        <span className="text-[10px] opacity-60 ml-2 whitespace-nowrap">
                            {new Date(lastMsg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                        </span>
                        )}
                    </div>
                    <div className={`text-xs truncate ${unread > 0 ? 'font-medium text-slate-800' : 'opacity-70'}`}>
                        {lastMsg 
                        ? (lastMsg.type === 'missed_call' ? '📞 Missed Call' : lastMsg.attachments?.length ? `📎 ${lastMsg.attachments.length} attachment(s)` : lastMsg.text) 
                        : 'Start a conversation'}
                    </div>
                    </div>
                </button>
                 {/* Context Menu Button */}
                 <button 
                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === user.id ? null : user.id); }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover/item:opacity-100 transition-opacity"
                >
                    <MoreVertical size={16} />
                </button>
                {activeMenuId === user.id && (
                    <div className="absolute right-0 top-8 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-36 py-1">
                        <button 
                            onClick={(e) => handleHideChat(e, user.id)}
                            className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center"
                        >
                            <X size={12} className="mr-2" /> Hide Chat
                        </button>
                        <button 
                            onClick={(e) => handleDeleteChat(e, user.id)}
                            className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                        >
                            <Trash2 size={12} className="mr-2" /> Delete Chat
                        </button>
                    </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- RIGHT CHAT AREA --- */}
      <div className={`
        flex-1 flex flex-col bg-white relative h-full min-h-0
        ${showMobileChat ? 'flex' : 'hidden md:flex'}
      `}>
        {/* Chat Header */}
        <div className="h-16 px-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-10 shadow-sm relative">
          <div className="flex items-center">
            <button 
              onClick={() => setShowMobileChat(false)}
              className="md:hidden mr-2 p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full"
            >
              <ChevronLeft size={20} />
            </button>
            
            {selectedChat ? (
              <div className="flex items-center">
                {isUser(selectedChat) ? (
                  <img src={selectedChat.avatar} className="w-9 h-9 rounded-full mr-3" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 font-bold text-xs">
                     {selectedChat.name.substring(0,2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{selectedChat.name}</h3>
                  {isUser(selectedChat) ? (
                    <div className="flex items-center text-xs text-green-500">
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${selectedChat.isOnline ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                      {selectedChat.isOnline ? 'Online' : 'Offline'}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {(selectedChat as Group).memberIds.length} members
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Team Chat</h3>
                  <p className="text-xs text-slate-500">{users.length} members</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <button 
              onClick={() => handleStartCall(false)} 
              className={`p-2 rounded-full transition-colors ${isInCall ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
              title="Start Audio Call"
            >
               <Phone size={20} />
            </button>
            <button 
              onClick={() => handleStartCall(true)}
              className={`p-2 rounded-full transition-colors ${isInCall ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
              title="Start Video Call"
            >
               <Video size={20} />
            </button>
            
            {selectedChat && (
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setActiveHeaderMenu(!activeHeaderMenu); }}
                        className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                    >
                        <MoreVertical size={20} />
                    </button>
                    {activeHeaderMenu && (
                        <div className="absolute right-0 top-10 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-40 py-1">
                             <button 
                                onClick={(e) => handleDeleteChat(e, selectedChat.id)}
                                className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                            >
                                <Trash2 size={14} className="mr-2" /> Delete Chat
                            </button>
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>

        {/* Main Content Area (Messages OR Call Interface Placeholder) */}
        {/* Messages List - using ref for container */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 min-h-0"
        >
          {currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Send size={24} />
              </div>
              <p>No messages yet.</p>
              <p className="text-xs">Say hello to start the conversation!</p>
            </div>
          )}
          
          {currentMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser?.id;
            const sender = users.find(u => u.id === msg.senderId);
            const isMissedCall = msg.type === 'missed_call';
            
            // Logic for grouping
            const isLastInSequence = idx === currentMessages.length - 1 || currentMessages[idx + 1].senderId !== msg.senderId;
            const isFirstInSequence = idx === 0 || currentMessages[idx - 1].senderId !== msg.senderId;

            return (
              <div
                key={msg.id}
                onClick={() => markChatRead(selectedChat ? selectedChat.id : 'general')}
                className={`cursor-pointer flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1 animate-in slide-in-from-bottom-1 duration-200`}
              >
                <div className={`flex max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                  
                  {/* Avatar Column */}
                  <div className={`w-6 h-6 shrink-0 flex flex-col justify-end ${isMe ? 'ml-2' : 'mr-2'}`}>
                    {isLastInSequence ? (
                      <img src={sender?.avatar} className="w-6 h-6 rounded-full shadow-sm border border-slate-100 object-cover" title={sender?.name} />
                    ) : (
                      <div className="w-6 h-6" /> 
                    )}
                  </div>

                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} min-w-0`}>
                    {/* Sender Name (Only for first message in sequence, and not me, and in group context) */}
                    {isFirstInSequence && !isMe && (selectedChat || isGroup(selectedChat)) && (
                      <span className="text-[10px] text-slate-400 mb-0.5 ml-1">{sender?.name}</span>
                    )}
                    
                    {/* Message Bubble */}
                    <div className={`px-4 py-2 shadow-sm text-sm leading-relaxed max-w-full break-words ${
                      isMissedCall
                       ? 'bg-red-50 border border-red-100 text-red-800 rounded-2xl'
                       : isMe 
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' 
                        : 'bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm'
                    }`}>
                      {isMissedCall ? (
                          <div className="flex items-center space-x-2">
                              <div className="p-1.5 bg-red-100 rounded-full shrink-0">
                                  <PhoneMissed size={16} className="text-red-600"/>
                              </div>
                              <span className="font-medium">Missed Call</span>
                          </div>
                      ) : (
                        <>
                            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                            
                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className={`grid grid-cols-2 gap-2 ${msg.text ? 'mt-3 pt-2 border-t ' + (isMe ? 'border-indigo-500' : 'border-slate-100') : ''}`}>
                                {msg.attachments.map(att => (
                                    <a 
                                    key={att.id} 
                                    href={att.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={`flex flex-col p-2 rounded ${isMe ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}
                                    >
                                    {att.type.startsWith('image/') ? (
                                        <img src={att.url} alt={att.name} className="w-full h-24 object-cover rounded mb-1 bg-black/10" />
                                    ) : (
                                        <div className="w-full h-24 flex items-center justify-center bg-black/5 rounded mb-1">
                                        <FileText size={24} className="opacity-50"/>
                                        </div>
                                    )}
                                    <span className="text-[10px] truncate w-full block opacity-80">{att.name}</span>
                                    </a>
                                ))}
                                </div>
                            )}
                        </>
                      )}
                    </div>

                    {/* Timestamp Below */}
                    <span className={`text-[10px] text-slate-300 mt-1 ${isMe ? 'mr-1' : 'ml-1'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Area (Same as before) */}
        <div className="p-4 bg-white border-t border-slate-100 flex-shrink-0">
          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3 pb-2">
              {attachments.map(att => (
                <div key={att.id} className="relative flex-shrink-0 group">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                    {att.type.startsWith('image/') ? (
                      <img src={att.url} className="w-full h-full object-cover" />
                    ) : (
                      <FileText size={24} className="text-slate-400" />
                    )}
                  </div>
                  <button 
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-end space-x-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"
                title="Add attachments"
              >
                <Paperclip size={20} />
              </button>
              <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileSelect}
              />
              
              <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Message ${selectedChat ? selectedChat.name.split(' ')[0] : 'Team'}...`}
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-slate-800 placeholder-slate-400 py-3 max-h-32"
            />
            
            <button 
              type="submit" 
              disabled={!inputText.trim() && attachments.length === 0}
              className={`p-3 rounded-xl transition-all flex-shrink-0 ${
                inputText.trim() || attachments.length > 0
                ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105 active:scale-95' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* New Chat Modal (No changes here) */}
      <Modal
        isOpen={isNewChatModalOpen}
        onClose={() => { setIsNewChatModalOpen(false); setNewChatSearchTerm(''); }}
        title="Start New Chat"
      >
        <div className="space-y-4">
          <div className="relative">
             <Search size={16} className="absolute left-3 top-3 text-slate-400" />
             <input
               type="text"
               placeholder="Search users..."
               className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
               value={newChatSearchTerm}
               onChange={(e) => setNewChatSearchTerm(e.target.value)}
             />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2">
             {users
                .filter(u => u.id !== currentUser?.id)
                .filter(u => u.name.toLowerCase().includes(newChatSearchTerm.toLowerCase()) || u.username.toLowerCase().includes(newChatSearchTerm.toLowerCase()))
                .map(user => (
               <div 
                 key={user.id} 
                 onClick={() => toggleUserSelection(user.id)}
                 className={`flex items-center p-2 rounded-lg cursor-pointer border ${selectedUserIdsForGroup.includes(user.id) ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}
               >
                 <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${selectedUserIdsForGroup.includes(user.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                    {selectedUserIdsForGroup.includes(user.id) && <Check size={12} />}
                 </div>
                 <img src={user.avatar} className="w-8 h-8 rounded-full mr-3" />
                 <span className="text-sm font-medium text-slate-700">{user.name}</span>
               </div>
             ))}
          </div>
          
          {selectedUserIdsForGroup.length > 1 && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Group Name</label>
              <input
                type="text"
                placeholder="e.g. Marketing Team"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2">
            <button 
              onClick={() => { setIsNewChatModalOpen(false); setNewChatSearchTerm(''); }}
              className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateChat}
              disabled={selectedUserIdsForGroup.length === 0 || (selectedUserIdsForGroup.length > 1 && !newGroupName.trim())}
              className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                selectedUserIdsForGroup.length === 0 || (selectedUserIdsForGroup.length > 1 && !newGroupName.trim())
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {selectedUserIdsForGroup.length > 1 ? 'Create Group' : 'Start Chat'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Helper component for remote videos to handle refs
const RemoteVideoPlayer: React.FC<{ stream: MediaStream; isMainStage?: boolean }> = ({ stream, isMainStage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  const [userRequestedAudio, setUserRequestedAudio] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    try {
      // Mute by default so browsers allow autoplay of the video element.
      videoRef.current.muted = true;
      videoRef.current.srcObject = stream;
      const p = videoRef.current.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setPlayBlocked(false)).catch(e => {
          console.debug('Remote video play blocked (autoplay):', e);
          setPlayBlocked(true);
        });
      }
    } catch (e) {
      console.debug('Failed to assign remote stream to video element', e);
      setPlayBlocked(true);
    }
  }, [stream]);

  const enableAudio = async () => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = false;
      await videoRef.current.play();
      setUserRequestedAudio(true);
      setPlayBlocked(false);
    } catch (e) {
      console.debug('Failed to enable audio/play on user gesture', e);
    }
  };

  return (
    <div className={`w-full h-full relative ${isMainStage ? '' : ''}`}>
      <video ref={videoRef} autoPlay playsInline className={`w-full h-full ${isMainStage ? 'object-contain bg-black' : 'object-cover'}`} />
      {playBlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <button onClick={enableAudio} className="px-3 py-2 bg-indigo-600 text-white rounded">Enable Audio / Play</button>
        </div>
      )}
      {!playBlocked && !userRequestedAudio && (
        <div className="absolute top-2 right-2">
          <button onClick={enableAudio} className="px-2 py-1 bg-black/40 text-white rounded text-xs">Unmute</button>
        </div>
      )}
    </div>
  );
};