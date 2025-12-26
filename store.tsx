import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Project, Task, ChatMessage, UserRole, TaskStatus, Attachment, Group, ProjectAccessLevel, Notification, NotificationType, IncomingCall, SignalData } from './types';
import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  projects: Project[];
  tasks: Task[];
  messages: ChatMessage[];
  groups: Group[];
  notifications: Notification[];
  incomingCall: IncomingCall | null;
  isInCall: boolean;
  activeCallData: { invitedIds: string[], joinedIds: string[], isVideo: boolean } | null;
  activeCallId: string | null;
  
  // Chat History Management
  deletedMessageIds: Set<string>;
  clearChatHistory: (targetId: string) => Promise<void>;

  // Media Streams for UI
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // Map of userId -> MediaStream
  isScreenSharing: boolean;
  
  // Media Controls
  isMicOn: boolean;
  isCameraOn: boolean;
  toggleMic: () => void;
  toggleCamera: () => void;

  login: (u: User) => void;
  logout: () => void;
  addUser: (u: User) => void;
  updateUser: (u: User) => void;
  deleteUser: (id: string) => void;
  addTask: (t: Task) => void;
  updateTask: (t: Task) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => void;
  addMessage: (text: string, recipientId?: string, attachments?: Attachment[]) => void;
  createGroup: (name: string, memberIds: string[]) => void;
  addProject: (name: string, description: string) => void;
  updateProject: (p: Project) => void;
  deleteProject: (id: string) => Promise<void>;
  
  // Notification & Unread Logic
  triggerNotification: (recipientId: string, type: NotificationType, title: string, message: string, linkTo?: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  markChatRead: (chatId: string) => void;
  getUnreadCount: (chatId: string) => number;
  totalUnreadChatCount: number;

  // Call Logic
  startCall: (recipientId: string, isVideo: boolean) => Promise<void>;
  startGroupCall: (recipientIds: string[], isVideo: boolean) => Promise<void>;
  addToCall: (recipientId: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  endCall: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  // Allow remote autoplay after a user gesture (e.g., accepted or started a call)
  allowAutoplayForRemote: boolean;
  setAllowAutoplayForRemote: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Configuration for WebRTC (using public STUN servers)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize currentUser from localStorage if available
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('nexus_pm_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());
  
  // Call State
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [activeCallData, setActiveCallData] = useState<{ invitedIds: string[], joinedIds: string[], isVideo: boolean } | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Media Controls State (Default to OFF as requested)
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  // If true, RemoteVideoPlayer may attempt unmuted autoplay because user performed a gesture
  const [allowAutoplayForRemote, setAllowAutoplayForRemote] = useState(false);

  // WebRTC Refs - Now using a Map for multiple connections
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const isSignalingSubscribedRef = useRef<boolean>(false);
  const pendingSignalsRef = useRef<Array<{ type: any; recipientId?: string | undefined; payload: any }>>([]);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null); 
  const placeholderVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingRemoteCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  
  // Ref to track incoming call state within event listeners without dependency loops
  const incomingCallRef = useRef<IncomingCall | null>(null);

  // Map of ChatID -> Timestamp when current user last read it
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>({});

  // Load persisted last-read timestamps for current user from localStorage
  useEffect(() => {
    try {
      if (currentUser) {
        const raw = localStorage.getItem('nexus_pm_lastRead_' + currentUser.id);
        if (raw) {
          setLastReadTimestamps(JSON.parse(raw));
        } else {
          setLastReadTimestamps({});
        }
      } else {
        setLastReadTimestamps({});
      }
    } catch (e) {
      console.error('Failed to load lastReadTimestamps from storage', e);
    }
  }, [currentUser]);

  // --- Data Mappers (DB Snake_case to App CamelCase) ---
  const mapUserFromDB = (u: any): User => ({
      ...u,
      isOnline: u.is_online,
      projectAccess: u.project_access,
      dashboardConfig: u.dashboard_config
  });
  const mapTaskFromDB = (t: any): Task => ({
      ...t,
      projectId: t.project_id,
      assigneeId: t.assignee_id,
      dueDate: t.due_date,
      createdAt: t.created_at
  });
  const mapProjectFromDB = (p: any): Project => ({
      id: p.id,
      name: p.name,
      description: p.description,
      memberIds: p.member_ids || [],
      attachments: [], // Schema does not support attachments yet
      comments: []     // Schema does not support comments yet
  });
  const mapGroupFromDB = (g: any): Group => ({
      ...g,
      memberIds: g.member_ids,
      createdBy: g.created_by,
      createdAt: g.created_at
  });
  const mapMessageFromDB = (m: any): ChatMessage => ({
      id: m.id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      text: m.text,
      timestamp: m.timestamp,
      type: m.type,
      attachments: m.attachments
  });

  // --- Media helpers (safe access across environments/browsers) ---
  const getUserMediaSafe = async (constraints: MediaStreamConstraints) => {
    if (typeof navigator === 'undefined') throw new Error('Navigator not available');
    const nav: any = navigator;
    if (nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function') {
      return nav.mediaDevices.getUserMedia(constraints);
    }
    const legacy = nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.getUserMedia;
    if (legacy) {
      return new Promise<MediaStream>((resolve, reject) => legacy.call(nav, constraints, resolve, reject));
    }
    throw new Error('getUserMedia is not supported in this environment');
  };

  const getDisplayMediaSafe = async (constraints: MediaStreamConstraints) => {
    if (typeof navigator === 'undefined') throw new Error('Navigator not available');
    const nav: any = navigator;
    if (nav.mediaDevices && typeof nav.mediaDevices.getDisplayMedia === 'function') {
      return nav.mediaDevices.getDisplayMedia(constraints);
    }
    const legacyDisplay = nav.getDisplayMedia;
    if (legacyDisplay) {
      return legacyDisplay.call(nav, constraints);
    }
    throw new Error('getDisplayMedia is not supported in this environment');
  };

  const isGetUserMediaAvailable = () => {
    if (typeof navigator === 'undefined') return false;
    const nav: any = navigator;
    if (nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function') return true;
    if (nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.getUserMedia) return true;
    return false;
  };

  const isGetDisplayMediaAvailable = () => {
    if (typeof navigator === 'undefined') return false;
    const nav: any = navigator;
    if (nav.mediaDevices && typeof nav.mediaDevices.getDisplayMedia === 'function') return true;
    if (nav.getDisplayMedia) return true;
    return false;
  };

  const isMobileDevice = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua);
  };

  const hasMicrophone = async () => {
    try {
      if (typeof navigator === 'undefined') return false;
      const nav: any = navigator;
      if (nav.mediaDevices && typeof nav.mediaDevices.enumerateDevices === 'function') {
        const devices = await nav.mediaDevices.enumerateDevices();
        return devices.some((d: any) => d.kind === 'audioinput');
      }
      return false;
    } catch (e) {
      console.error('Error enumerating devices for microphone check', e);
      return false;
    }
  };

  const hasCamera = async () => {
    try {
      if (typeof navigator === 'undefined') return false;
      const nav: any = navigator;
      if (nav.mediaDevices && typeof nav.mediaDevices.enumerateDevices === 'function') {
        const devices = await nav.mediaDevices.enumerateDevices();
        return devices.some((d: any) => d.kind === 'videoinput');
      }
      return false;
    } catch (e) {
      console.error('Error enumerating devices for camera check', e);
      return false;
    }
  };
  const mapNotificationFromDB = (n: any): Notification => ({
      id: n.id,
      recipientId: n.recipient_id,
      senderId: n.sender_id,
      type: n.type,
      title: n.title,
      message: n.message,
      timestamp: n.timestamp,
      read: n.read,
      linkTo: n.link_to
  });

  // Keep incomingCallRef in sync with state
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Track whether the `calls` table exists to avoid repeated 400 errors when it's absent
  const [hasCallsTable, setHasCallsTable] = useState<boolean | null>(null);
  const callsRestrictedRef = useRef<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { error } = await supabase.from('calls').select('id').limit(1);
        if (!cancelled) {
          if (error) {
            // Detect row-level security / permission issues separately
            if ((error as any).code === '42501') {
              console.debug('[CALLS] calls table exists but is restricted by RLS (42501)');
              callsRestrictedRef.current = true;
              setHasCallsTable(true);
            } else {
              setHasCallsTable(false);
            }
          } else {
            setHasCallsTable(true);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Error checking calls table existence', e);
          setHasCallsTable(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- 1. Fetch Initial Data from Supabase ---
  useEffect(() => {
    const fetchData = async () => {
      const { data: userData } = await supabase.from('users').select('*');
      if (userData) setUsers(userData.map(mapUserFromDB));

      const { data: projectData } = await supabase.from('projects').select('*');
      if (projectData) setProjects(projectData.map(mapProjectFromDB));

      const { data: taskData } = await supabase.from('tasks').select('*');
      if (taskData) setTasks(taskData.map(mapTaskFromDB));
      
      const { data: msgData } = await supabase.from('messages').select('*').order('timestamp', { ascending: true });
      if (msgData) setMessages(msgData.map(mapMessageFromDB));

      const { data: groupData } = await supabase.from('groups').select('*');
      if (groupData) setGroups(groupData.map(mapGroupFromDB));
      
      const { data: notifData } = await supabase.from('notifications').select('*').order('timestamp', { ascending: false });
      if (notifData) setNotifications(notifData.map(mapNotificationFromDB));
    };

    fetchData();
  }, []);

  // Per-user notifications subscription for low-latency updates
  useEffect(() => {
    if (!currentUser) return;

    const notifChannel = supabase.channel('notifications-' + currentUser.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUser.id}` }, payload => {
        if (payload.eventType === 'INSERT') setNotifications(prev => [mapNotificationFromDB(payload.new), ...prev]);
        if (payload.eventType === 'UPDATE') setNotifications(prev => prev.map(n => n.id === payload.new.id ? mapNotificationFromDB(payload.new) : n));
        if (payload.eventType === 'DELETE') setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [currentUser]);

  // --- 1.1 Fetch Deleted Messages ---
  useEffect(() => {
      if (currentUser) {
          const fetchDeleted = async () => {
             const { data } = await supabase.from('deleted_messages').select('message_id').eq('user_id', currentUser.id);
             if (data) {
                 setDeletedMessageIds(new Set(data.map(d => d.message_id)));
             }
          };
          fetchDeleted();
      } else {
          setDeletedMessageIds(new Set());
      }
  }, [currentUser]);

  // --- 1.5 Update Online Status on Mount/Restore ---
  useEffect(() => {
    if (currentUser) {
        supabase.from('users').update({ is_online: true }).eq('id', currentUser.id);
    }
  }, []);

  // --- 1.6 Sync Current User with Users List (Refresh Data) ---
  useEffect(() => {
    if (currentUser && users.length > 0) {
        const freshUser = users.find(u => u.id === currentUser.id);
        if (freshUser && JSON.stringify(freshUser) !== JSON.stringify(currentUser)) {
             setCurrentUser(freshUser);
             localStorage.setItem('nexus_pm_user', JSON.stringify(freshUser));
        }
    }
  }, [users, currentUser]);

  // --- 2. Setup Realtime Subscriptions ---
  useEffect(() => {
    const channel = supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        if (payload.eventType === 'INSERT') setTasks(prev => [...prev, mapTaskFromDB(payload.new)]);
        if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === payload.new.id ? mapTaskFromDB(payload.new) : t));
        if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
        if (payload.eventType === 'INSERT') setMessages(prev => [...prev, mapMessageFromDB(payload.new)]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
         if (payload.eventType === 'UPDATE') {
             setUsers(prev => prev.map(u => u.id === payload.new.id ? mapUserFromDB(payload.new) : u));
         }
         if (payload.eventType === 'INSERT') setUsers(prev => [...prev, mapUserFromDB(payload.new)]);
         if (payload.eventType === 'DELETE') setUsers(prev => prev.filter(u => u.id !== payload.old.id));
      })
        // notifications are handled by a per-user subscription (created when currentUser is available)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
          if (payload.eventType === 'INSERT') setProjects(prev => [...prev, mapProjectFromDB(payload.new)]);
          if (payload.eventType === 'UPDATE') setProjects(prev => prev.map(p => p.id === payload.new.id ? mapProjectFromDB(payload.new) : p));
          if (payload.eventType === 'DELETE') setProjects(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, payload => {
          if (payload.eventType === 'INSERT') setGroups(prev => [...prev, mapGroupFromDB(payload.new)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- 3. WebRTC Signaling via Supabase Broadcast ---
  useEffect(() => {
    if (!currentUser) return;

    // Use a unique channel for signaling
    const channel = supabase.channel('signaling');
    
    channel
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const { type, senderId, recipientId, payload: signalPayload } = payload as SignalData;

        // Diagnostic logging for signaling messages
        try {
          console.debug('[SIGNAL] received', { type, senderId, recipientId, signalPayload, myId: currentUser?.id, isInCall });
        } catch (e) { /* ignore logging errors */ }

        // Ignore if not meant for us (unless public)
        if (recipientId && recipientId !== currentUser.id && type !== 'USER_ONLINE') {
          console.debug('[SIGNAL] ignored (not for this user)', { type, senderId, recipientId, myId: currentUser?.id });
          return;
        }
        if (senderId === currentUser.id) {
          console.debug('[SIGNAL] ignored (own message)', { type, senderId });
          return; // Don't process own messages
        }

        switch (type) {
            case 'USER_ONLINE':
              // Handled by DB realtime usually, but good for immediate "I'm here"
              break;
    
            case 'OFFER':
              console.debug('[SIGNAL] OFFER from', senderId, 'isVideo=', signalPayload?.isVideo, 'callId=', signalPayload?.callId);
              // If we're already in a call, only ignore if this OFFER belongs to a different call.
              const incomingCallId = signalPayload?.callId;
              if (isInCall && incomingCallId && activeCallId && incomingCallId !== activeCallId) {
                console.debug('[SIGNAL] OFFER ignored - user is already in a different call', { myId: currentUser?.id, incomingCallId, activeCallId });
                return; // Busy in another call
              }

              // If we're in the same call (renegotiation for screen-share / new tracks), handle automatically
              if (isInCall && incomingCallId && activeCallId && incomingCallId === activeCallId) {
                console.debug('[SIGNAL] OFFER received for existing call - processing renegotiation from', senderId);
                try {
                  let pc = peerConnectionsRef.current.get(senderId);
                  if (!pc) {
                    pc = createPeerConnection(senderId);
                    // Attach existing local tracks if available
                    if (localStream) localStream.getTracks().forEach(track => { try { pc!.addTrack(track, localStream!); } catch(e) { console.error('Error adding local track during renegotiation', e); } });
                  }

                  if (signalPayload?.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));

                    // Flush any buffered candidates for sender now that remote description is set
                    const pending = pendingRemoteCandidatesRef.current.get(senderId) || [];
                    if (pending.length > 0) {
                      for (const c of pending) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(c)); console.debug('[WEBRTC] flushed pending candidate (reneg) for', senderId); } catch (e) { console.error('[WEBRTC] error adding flushed candidate (reneg)', e); }
                      }
                      pendingRemoteCandidatesRef.current.delete(senderId);
                    }

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendSignal('ANSWER', senderId, { sdp: { type: answer.type, sdp: answer.sdp }, callId: incomingCallId });
                  }
                } catch (e) {
                  console.error('Error handling renegotiation OFFER from', senderId, e);
                }
                return;
              }

              // Not currently in the call: treat as a fresh incoming call invitation
              setIncomingCall({
                callerId: senderId,
                isVideo: signalPayload.isVideo,
                timestamp: Date.now(),
                offer: signalPayload.sdp,
                callId: signalPayload.callId
              });
              break;
    
            case 'ANSWER':
              console.debug('[SIGNAL] ANSWER from', senderId);
              {
                const pc = peerConnectionsRef.current.get(senderId);
                if (pc) {
                  await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));
                  // After remote description is set, flush any buffered candidates for this sender
                  const pending = pendingRemoteCandidatesRef.current.get(senderId) || [];
                  if (pending.length > 0) {
                    for (const c of pending) {
                      try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                        console.debug('[WEBRTC] flushed pending remote candidate for (after ANSWER)', senderId, c);
                      } catch (e) {
                        console.error('[WEBRTC] error adding flushed candidate (after ANSWER) for', senderId, e);
                      }
                    }
                    pendingRemoteCandidatesRef.current.delete(senderId);
                  }
                  setActiveCallData(prev => {
                      if (!prev) return null;
                      if (prev.joinedIds.includes(senderId)) return prev;
                      return { ...prev, joinedIds: [...prev.joinedIds, senderId] };
                  });

                  // NOTE: Your `calls` table does not track joined participant arrays.
                  // We avoid attempting to update non-existent `joined_ids` columns.
                }
              }
              break;
    
            case 'CANDIDATE':
              console.debug('[SIGNAL] CANDIDATE from', senderId, signalPayload?.candidate);
              {
                const pc = peerConnectionsRef.current.get(senderId);
                if (pc && signalPayload.candidate) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(signalPayload.candidate));
                  } catch (e) {
                    console.error("Error adding ice candidate", e);
                  }
                } else if (signalPayload.candidate) {
                  // Peer connection not created yet: buffer the remote candidate
                  const buf = pendingRemoteCandidatesRef.current.get(senderId) || [];
                  buf.push(signalPayload.candidate);
                  pendingRemoteCandidatesRef.current.set(senderId, buf);
                  console.debug('[SIGNAL] buffered remote candidate for', senderId);
                }
              }
              break;
    
            case 'HANGUP':
              console.debug('[SIGNAL] HANGUP from', senderId);
              // Check if we have a pending incoming call from this sender (Missed Call Scenario)
              if (incomingCallRef.current && incomingCallRef.current.callerId === senderId) {
                  // The caller hung up before we answered
                  const caller = users.find(u => u.id === senderId);
                  const callerName = caller ? caller.name : 'Unknown User';
                  
                  // 1. Create Missed Call Notification
                      const callRefId = incomingCallRef.current.callId || null;
                      try {
                        // Avoid duplicate notification for member->admin scenario by checking recent similar notifications
                        const recentWindow = Date.now() - 10000;
                        const { data: existingNotifs } = await supabase.from('notifications')
                          .select('id')
                          .eq('recipient_id', currentUser.id)
                          .eq('sender_id', senderId)
                          .eq('type', NotificationType.MISSED_CALL)
                          .gt('timestamp', recentWindow)
                          .limit(1);
                        if (!existingNotifs || existingNotifs.length === 0) {
                          const { error: notifError } = await supabase.from('notifications').insert({
                            id: 'n-' + Date.now() + Math.random(),
                            recipient_id: currentUser.id,
                            sender_id: senderId,
                            type: NotificationType.MISSED_CALL,
                            title: 'Missed Call',
                            message: `You missed a call from ${callerName}`,
                            timestamp: Date.now(),
                            read: false,
                            link_to: callRefId || senderId
                          });
                          if (notifError) console.error("Error creating missed call notification:", notifError);
                        } else {
                          console.info('Skipped duplicate missed-call notification (HANGUP) for', senderId, '->', currentUser.id);
                        }
                      } catch (e) { console.error('Error checking/inserting missed-call notification (HANGUP):', e); }

                  // 2. Create Missed Call Chat Message (use consistent phrasing)
                  try {
                    const recentWindow = Date.now() - 10000; // 10s
                    const { data: existing } = await supabase.from('messages')
                      .select('id')
                      .eq('sender_id', senderId)
                      .eq('recipient_id', currentUser.id)
                      .eq('type', 'missed_call')
                      .gt('timestamp', recentWindow)
                      .limit(1);
                    if (!existing || existing.length === 0) {
                      const { error: msgError } = await supabase.from('messages').insert({
                        id: 'm-' + Date.now() + Math.random(),
                        sender_id: senderId,
                        recipient_id: currentUser.id,
                        text: `You missed a call from ${callerName}`,
                        timestamp: Date.now(),
                        type: 'missed_call',
                        attachments: []
                      });
                      if (msgError) console.error("Error creating missed call message:", msgError);
                    } else {
                      console.info('Skipped duplicate missed-call message (HANGUP) for', senderId, '->', currentUser.id);
                    }
                  } catch (e) { console.error('Error checking/inserting missed call message:', e); }
                  
                  setIncomingCall(null);
              }

              handleRemoteHangup(senderId);
              break;
          }
      })
      .subscribe((status) => {
          console.debug('[SIGNAL] subscribe status:', status);
          if (status === 'SUBSCRIBED') {
              signalingChannelRef.current = channel;
              isSignalingSubscribedRef.current = true;
              console.debug('[SIGNAL] channel subscribed, flushing queued signals count=', pendingSignalsRef.current.length);
              // Flush any queued signals
              (async () => {
                try {
                  const queued = pendingSignalsRef.current.splice(0, pendingSignalsRef.current.length);
                  for (const q of queued) {
                    console.debug('[SIGNAL] flushing queued signal', q.type, 'to', q.recipientId);
                    await signalingChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type: q.type, senderId: currentUser?.id, recipientId: q.recipientId, payload: q.payload } });
                  }
                } catch (e) {
                  console.error('Error flushing queued signals', e);
                }
              })();

              // Announce online
               sendSignal('USER_ONLINE', undefined, {});
          }
          if (status === 'CLOSED' || status === 'REVOKED') {
              isSignalingSubscribedRef.current = false;
              console.debug('[SIGNAL] channel closed/revoked');
          }
      });

    return () => {
        if (signalingChannelRef.current) supabase.removeChannel(signalingChannelRef.current);
    };
  }, [currentUser, isInCall]);


  const sendSignal = async (type: SignalData['type'], recipientId: string | undefined, payload: any) => {
    if (!currentUser) {
      console.warn('[SIGNAL] sendSignal called without currentUser, dropping', type, recipientId);
      return;
    }

    // If channel is subscribed, attempt immediate send
    if (isSignalingSubscribedRef.current && signalingChannelRef.current) {
      try {
        console.debug('[SIGNAL] sending', type, 'to', recipientId);
        await signalingChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { type, senderId: currentUser.id, recipientId, payload } });
      } catch (e) {
        console.error('sendSignal failed to send over realtime channel, queuing', e);
        pendingSignalsRef.current.push({ type, recipientId, payload });
      }
      return;
    }

    // Not subscribed yet: queue the signal and return
    pendingSignalsRef.current.push({ type, recipientId, payload });
    console.debug('[SIGNAL] queued (channel not subscribed yet)', { type, recipientId, queueLen: pendingSignalsRef.current.length });
  };

  // --- Actions ---

  const login = async (user: User) => {
    localStorage.setItem('nexus_pm_user', JSON.stringify(user));
    setCurrentUser(user);
    await supabase.from('users').update({ is_online: true }).eq('id', user.id);
  };

  const logout = async () => {
    if (currentUser) {
        await supabase.from('users').update({ is_online: false }).eq('id', currentUser.id);
    }
    localStorage.removeItem('nexus_pm_user');
    try { if (currentUser) localStorage.removeItem('nexus_pm_lastRead_' + currentUser.id); } catch(e) {}
    setCurrentUser(null);
    setNotifications([]);
    setLastReadTimestamps({});
    setIncomingCall(null);
    setIsInCall(false);
    setDeletedMessageIds(new Set());
    cleanupCall();
  };

  const addUser = async (user: User) => {
    // Create in public.users table
    const { error } = await supabase.from('users').insert({
        id: user.id,
        name: user.name,
        username: user.username,
        password: user.password,
        role: user.role,
        avatar: user.avatar,
        project_access: user.projectAccess,
        dashboard_config: user.dashboardConfig
    });
    if (error) console.error("Add user failed:", error);
  };

  const updateUser = async (u: User) => {
    const { error } = await supabase.from('users').update({
        name: u.name,
        username: u.username,
        password: u.password,
        role: u.role,
        avatar: u.avatar,
        project_access: u.projectAccess,
        dashboard_config: u.dashboardConfig
    }).eq('id', u.id);
    if (error) console.error("Update user failed", error);
    
    if (currentUser?.id === u.id) {
        setCurrentUser(u);
        localStorage.setItem('nexus_pm_user', JSON.stringify(u));
    }
  };

  const deleteUser = async (id: string) => {
      await supabase.from('users').delete().eq('id', id);
  };

  const addTask = async (t: Task) => {
      await supabase.from('tasks').insert({
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          description: t.description,
          status: t.status,
          category: t.category,
          assignee_id: t.assigneeId,
          priority: t.priority,
          due_date: t.dueDate,
          attachments: t.attachments,
          comments: t.comments,
          subtasks: t.subtasks,
          created_at: t.createdAt
      });
  };

  const updateTask = async (t: Task) => {
      // Check previous assignee to detect reassignment
      try {
        const { data: existing } = await supabase.from('tasks').select('assignee_id, title').eq('id', t.id).single();
        const prevAssignee = existing?.assignee_id || null;
        // If assignee changed, notify the new assignee
        if (t.assigneeId && t.assigneeId !== prevAssignee) {
          try {
            await triggerNotification(t.assigneeId, NotificationType.ASSIGNMENT, 'Task Assigned', `${currentUser?.name} assigned you to \"${t.title}\"`, t.id);
          } catch (e) { console.error('Failed to trigger assignment notification', e); }
        }
      } catch (e) { console.error('Failed to fetch existing task for reassignment detection', e); }

      await supabase.from('tasks').update({
          title: t.title,
          description: t.description,
          status: t.status,
          category: t.category,
          assignee_id: t.assigneeId,
          priority: t.priority,
          due_date: t.dueDate,
          attachments: t.attachments,
          comments: t.comments,
          subtasks: t.subtasks
      }).eq('id', t.id);
  };

  const moveTask = async (id: string, s: TaskStatus) => {
      await supabase.from('tasks').update({ status: s }).eq('id', id);
  };
  
  const addMessage = async (text: string, recipientId?: string, attachments: Attachment[] = []) => {
    if (!currentUser) return;
    const newMsg = {
      id: Date.now().toString() + Math.random(),
      sender_id: currentUser.id,
      recipient_id: recipientId || null,
      text,
      timestamp: Date.now(),
      type: 'text',
      attachments
    };
    
    // Optimistic update done via subscription
    await supabase.from('messages').insert(newMsg);
    
    const chatId = recipientId || 'general';
    setLastReadTimestamps(prev => ({ ...prev, [chatId]: Date.now() }));
  };

  const createGroup = async (name: string, memberIds: string[]) => {
    if (!currentUser) return;
    const allMembers = Array.from(new Set([...memberIds, currentUser.id]));
    await supabase.from('groups').insert({
      id: 'g-' + Date.now(),
      name,
      member_ids: allMembers,
      created_by: currentUser.id,
      created_at: Date.now()
    });
  };

  const addProject = async (name: string, description: string) => {
    const newProjectId = 'p-' + Date.now();
    // Use only schema-defined columns to prevent errors
    const { error } = await supabase.from('projects').insert({ 
        id: newProjectId, 
        name, 
        description, 
        member_ids: []
    });
    
    if (error) {
        console.error("Error creating project:", error);
        return;
    }
    
    if (currentUser) {
        const updatedAccess = { ...currentUser.projectAccess, [newProjectId]: 'write' };
        updateUser({ ...currentUser, projectAccess: updatedAccess as any });
    }
  };
  
  const updateProject = async (p: Project) => {
      // Use only schema-defined columns
      const { error } = await supabase.from('projects').update({
          name: p.name,
          description: p.description,
          member_ids: p.memberIds
      }).eq('id', p.id);
      
      if (error) console.error("Error updating project:", error);
  };

  const deleteProject = async (id: string) => {
      // Optimistic update
      const oldProjects = [...projects];
      setProjects(prev => prev.filter(p => p.id !== id));
      
      try {
          // 1. Delete tasks (Manual cascade since DB might not have ON DELETE CASCADE)
          const { error: taskError } = await supabase.from('tasks').delete().eq('project_id', id);
          if (taskError) {
              console.warn("Project tasks deletion issue (proceeding with project delete):", taskError.message);
          }

          // 2. Delete project
            const { error: projectError } = await supabase.from('projects').delete().eq('id', id);
          
            if (projectError) {
              throw new Error(projectError.message);
            }

            console.info('Project deleted:', id);
      } catch (error: any) {
          console.error("Error deleting project:", error);
          alert("Failed to delete project. " + (error.message || "Unknown error"));
          // Restore optimistic update
          setProjects(oldProjects);
          // Refresh from DB to be safe
          const { data } = await supabase.from('projects').select('*');
          if (data) setProjects(data.map(mapProjectFromDB));
      }
  };

  const triggerNotification = async (recipientId: string, type: NotificationType, title: string, message: string, linkTo?: string) => {
    if (currentUser && recipientId === currentUser.id) return;
    await supabase.from('notifications').insert({
      id: 'n-' + Date.now() + Math.random(),
      recipient_id: recipientId,
      sender_id: currentUser?.id,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      link_to: linkTo
    });
  };

  const markNotificationRead = async (id: string) => {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const clearNotifications = async () => { 
      if (!currentUser) return; 
      await supabase.from('notifications').update({ read: true }).eq('recipient_id', currentUser.id);
  };

  const clearNotification = async (id: string) => {
    try {
      // Delete single notification
      await supabase.from('notifications').delete().eq('id', id);
      // Optimistically remove from local state
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Failed to clear notification', id, e);
    }
  };

  const clearAllNotifications = async () => {
    if (!currentUser) return;
    try {
      await supabase.from('notifications').delete().eq('recipient_id', currentUser.id);
      setNotifications(prev => prev.filter(n => n.recipientId !== currentUser.id));
    } catch (e) {
      console.error('Failed to clear all notifications for', currentUser.id, e);
    }
  };
  
  const markChatRead = (chatId: string) => {
    const ts = Date.now();
    setLastReadTimestamps(prev => {
      const next = { ...prev, [chatId]: ts };
      try {
        if (currentUser) localStorage.setItem('nexus_pm_lastRead_' + currentUser.id, JSON.stringify(next));
      } catch (e) { console.error('Failed to persist lastReadTimestamps', e); }
      return next;
    });
  };
  
  const getUnreadCount = (chatId: string) => {
    if (!currentUser) return 0;
    const lastRead = lastReadTimestamps[chatId] || 0;
    return messages.filter(m => {
      if (deletedMessageIds.has(m.id)) return false; // Ignore deleted messages
      const isRelevant = 
        (chatId !== 'general' && !chatId.startsWith('g-') && m.senderId === chatId && m.recipientId === currentUser.id) ||
        (chatId.startsWith('g-') && m.recipientId === chatId && m.senderId !== currentUser.id) ||
        (chatId === 'general' && !m.recipientId && m.senderId !== currentUser.id);
      return isRelevant && m.timestamp > lastRead;
    }).length;
  };
  
  const totalUnreadChatCount = React.useMemo(() => {
    if (!currentUser) return 0;
    let count = getUnreadCount('general');
    groups.forEach(g => { if (g.memberIds.includes(currentUser.id)) count += getUnreadCount(g.id); });
    users.forEach(u => { if (u.id !== currentUser.id) count += getUnreadCount(u.id); });
    return count;
  }, [messages, lastReadTimestamps, currentUser, groups, users, deletedMessageIds]); // Added deletedMessageIds dep

  // --- Clear Chat History Logic ---
  const clearChatHistory = async (targetId: string) => {
      if (!currentUser) return;
      
      const isGroup = groups.some(g => g.id === targetId);

      const msgsToDelete = messages.filter(m => {
          if (deletedMessageIds.has(m.id)) return false; // Already deleted
          
          if (targetId === 'general') {
             return !m.recipientId; // Global chat
          }
          if (isGroup) {
              return m.recipientId === targetId;
          } else {
              // 1:1 Chat
              return (m.senderId === currentUser.id && m.recipientId === targetId) ||
                     (m.senderId === targetId && m.recipientId === currentUser.id);
          }
      });

      if (msgsToDelete.length === 0) return;

      const newDeletedIds = new Set(deletedMessageIds);
      const recordsToInsert = msgsToDelete.map(m => {
          newDeletedIds.add(m.id);
          return {
              id: 'dm-' + Date.now() + Math.random().toString(36).substr(2, 9),
              user_id: currentUser.id,
              message_id: m.id,
              timestamp: Date.now()
          };
      });

      setDeletedMessageIds(newDeletedIds); // Optimistic UI update

      const { error } = await supabase.from('deleted_messages').insert(recordsToInsert);
      if (error) console.error("Failed to delete chat history", error);
  };


  // --- WebRTC Logic (Mostly unchanged, just uses sendSignal wrapper) ---

  const createPeerConnection = (recipientId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    console.debug('[WEBRTC] createPeerConnection for', recipientId, 'pc=', pc);

    pc.onicecandidate = (event) => {
      console.debug('[WEBRTC] onicecandidate for', recipientId, event.candidate);
      if (event.candidate) {
        sendSignal('CANDIDATE', recipientId, { candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      console.debug('[WEBRTC] ontrack for', recipientId, 'streams=', event.streams.map(s => s.id));
      setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(recipientId, event.streams[0]);
          return newMap;
      });
    };

    pc.onconnectionstatechange = () => console.debug('[WEBRTC] connectionstatechange', recipientId, pc.connectionState);
    pc.onsignalingstatechange = () => console.debug('[WEBRTC] signalingstatechange', recipientId, pc.signalingState);
    pc.oniceconnectionstatechange = () => console.debug('[WEBRTC] iceconnectionstatechange', recipientId, pc.iceConnectionState);
    pc.onicegatheringstatechange = () => console.debug('[WEBRTC] icegatheringstatechange', recipientId, pc.iceGatheringState);
    pc.onnegotiationneeded = () => console.debug('[WEBRTC] negotiationneeded', recipientId);
    pc.onconnectionstatechange = () => {
      console.debug('[WEBRTC] connectionstatechange', recipientId, pc.connectionState);
      if (pc.connectionState === 'connected' || pc.connectionState === 'completed') {
        setActiveCallData(prev => {
          if (!prev) return prev;
          if (prev.joinedIds.includes(recipientId)) return prev;
          return { ...prev, joinedIds: [...prev.joinedIds, recipientId] };
        });
      }
    };

    peerConnectionsRef.current.set(recipientId, pc);

    // Ensure there's always a video m-line to avoid removing m-lines when users toggle video.
    try {
      if (typeof pc.addTransceiver === 'function') {
        pc.addTransceiver('video', { direction: 'sendrecv' });
        console.debug('[WEBRTC] added video transceiver for', recipientId);
      }
    } catch (e) {
      console.debug('[WEBRTC] addTransceiver not supported or failed for', recipientId, e);
    }

    // Do not flush candidates here unless remoteDescription is present.
    // Flushing is performed after setting remote description to avoid InvalidStateError.
    return pc;
  };

  const toggleMic = async () => {
    if (isMicOn) {
      // Soft-mute: disable audio tracks instead of removing/stopping them so we can unmute without renegotiation
      if (localStream) localStream.getAudioTracks().forEach(t => { try { t.enabled = false; } catch(e) {} });
      setIsMicOn(false);
      return;
    }

    // Enabling mic
    if (!isGetUserMediaAvailable()) {
      console.error('getUserMedia not available for microphone');
      alert('Your browser does not support microphone access or the page is not secure (HTTPS).');
      return;
    }

    const micExists = await hasMicrophone();
    if (!micExists) {
      alert('No microphone detected on this device.');
      return;
    }

    try {
      // If we already have an audio track in localStream, just enable it
      if (localStream && localStream.getAudioTracks().length > 0) {
        const existing = localStream.getAudioTracks()[0];
        // If the existing track has ended, acquire a fresh one instead of enabling
        if (existing.readyState === 'ended') {
          // fall through to acquire new mic
        } else {
          localStream.getAudioTracks().forEach(t => { try { t.enabled = true; } catch(e) {} });
          setIsMicOn(true);
          return;
        }
      }

      // Otherwise, acquire microphone and add track to localStream and peers
      const stream = await getUserMediaSafe({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      // Remove any ended audio tracks from localStream to avoid duplicates
      if (localStream) {
        try {
          for (const t of localStream.getAudioTracks()) if (t.readyState === 'ended') localStream.removeTrack(t);
        } catch (e) { console.debug('Error cleaning ended audio tracks', e); }
      }
      if (!localStream) {
        setLocalStream(stream);
      } else {
        try {
          localStream.addTrack(audioTrack);
        } catch(e) {
          console.error('Error adding audio track to existing localStream', e);
        }
      }

      // Iterate peer connections with their recipient ids so we can renegotiate when adding a new sender
      for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'audio');
        try {
          if (sender && audioTrack) {
            await sender.replaceTrack(audioTrack);
          } else if (audioTrack) {
            pc.addTrack(audioTrack, localStream || stream);
            // Need to renegotiate because we added a sender where none existed before
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo: isCameraOn, callId: activeCallId || null });
            } catch (e) { console.error('Error renegotiating after adding audio track', e); }
          }
        } catch (e) {
          console.error('Error attaching audio track to peer connection', e);
        }
      }
      setIsMicOn(true);
    } catch (e) {
      console.error("Failed to enable mic", e);
      alert('Could not enable microphone. Check permissions and try again.');
    }
  };

  const toggleCamera = async () => {
    // If currently screen-sharing, toggle camera state locally only
    if (isScreenSharing) {
      setIsCameraOn(!isCameraOn);
      return;
    }

    // If camera is ON -> disable it by replacing with a placeholder track (keeps sender alive)
    if (isCameraOn) {
      try {
        // Stop and remove any real camera tracks from localStream
        if (localStream) {
          const realVideoTracks = localStream.getVideoTracks();
          for (const t of realVideoTracks) {
            try { t.stop(); } catch(e) {}
            try { localStream.removeTrack(t); } catch(e) {}
          }
        }

        // Create placeholder track if not present
        if (!placeholderVideoTrackRef.current) {
          try {
            const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.fillStyle = 'black'; ctx.fillRect(0,0,canvas.width, canvas.height); }
            const phStream = (canvas as any).captureStream ? (canvas as any).captureStream(1) : null;
            if (phStream) {
              const phTrack = phStream.getVideoTracks()[0];
              placeholderVideoTrackRef.current = phTrack;
            }
          } catch (e) { console.error('Failed to create placeholder track', e); }
        }

        // Add placeholder to localStream so local preview can show blank and senders have a track
        if (placeholderVideoTrackRef.current) {
          if (!localStream) setLocalStream(new MediaStream([placeholderVideoTrackRef.current]));
          else {
            try { localStream.addTrack(placeholderVideoTrackRef.current); } catch(e) {}
          }
        }

        // Replace sender tracks with placeholder to avoid renegotiation where possible
        for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          try {
            if (videoSender && placeholderVideoTrackRef.current) {
              await videoSender.replaceTrack(placeholderVideoTrackRef.current);
            } else if (placeholderVideoTrackRef.current) {
              pc.addTrack(placeholderVideoTrackRef.current, localStream!);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              // Keep isVideo=true so the SDP maintains the video m-line even when using a placeholder
              sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo: true, callId: activeCallId || null });
            }
          } catch (e) { console.error('Error replacing/adding placeholder video track on peer', e); }
        }

        setIsCameraOn(false);
      } catch (e) {
        console.error('Error disabling camera gracefully', e);
        // fallback: just disable tracks
        if (localStream) localStream.getVideoTracks().forEach(track => { try { track.enabled = false; } catch(e) {} });
        setIsCameraOn(false);
      }

      return;
    }

    // Enabling camera
    if (!isGetUserMediaAvailable()) {
      console.error('getUserMedia not available for camera');
      alert('Your browser does not support camera access or the page is not secure (HTTPS).');
      return;
    }

    const cameraExists = await hasCamera();
    if (!cameraExists) {
      alert('No camera detected on this device.');
      return;
    }

    try {
      const newStream = await getUserMediaSafe({ video: true });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace placeholder or add to peers
      for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        try {
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          } else {
            pc.addTrack(newVideoTrack, localStream || newStream);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo: true, callId: activeCallId || null });
          }
        } catch (e) { console.error('Error attaching new video track to peer', e); }
      }

      // Update localStream: remove placeholder if present and add real track
      if (!localStream) setLocalStream(new MediaStream(newStream.getTracks()));
      else {
        try {
          // remove placeholder
          if (placeholderVideoTrackRef.current) {
            try { localStream.removeTrack(placeholderVideoTrackRef.current); placeholderVideoTrackRef.current.stop && placeholderVideoTrackRef.current.stop(); } catch(e) {}
            placeholderVideoTrackRef.current = null;
          }
          localStream.addTrack(newVideoTrack);
        } catch (e) { console.error('Error updating localStream with new video track', e); }
        setLocalStream(new MediaStream(localStream.getTracks()));
      }

      setIsCameraOn(true);
      localVideoTrackRef.current = newVideoTrack;
    } catch (e) {
      console.error("Failed to acquire camera:", e);
      alert("Could not access camera.");
    }
    
    
    
  };

  const startCall = async (recipientId: string, isVideo: boolean) => {
    await startGroupCall([recipientId], isVideo);
  };

  const startGroupCall = async (recipientIds: string[], isVideo: boolean) => {
    if (!currentUser || recipientIds.length === 0) return;
    // Mark that user initiated a call so remote autoplay can be attempted
    setAllowAutoplayForRemote(true);

    // Do NOT auto-acquire camera/microphone when starting a call.
    // Respect user's preference to keep mic/camera off by default.
    // If `localStream` already exists we will attach its tracks; otherwise we create offers without tracks.
    const stream = localStream;
    
    setIsInCall(true);
    const callId = 'c-' + Date.now();
    setActiveCallId(callId);
    setActiveCallData({ invitedIds: recipientIds, joinedIds: [], isVideo });

    // Create call record in DB
    (async () => {
      try {
        if (hasCallsTable) {
          if (callsRestrictedRef.current) {
            console.debug('[CALLS] skipping insert because calls table is restricted by RLS for this user');
          } else {
            // Insert a single call record matching your schema: caller_id (uuid), recipient_id (uuid), invited_ids (text[]), joined_ids (text[])
            try {
              const primaryRecipient = recipientIds && recipientIds.length > 0 ? recipientIds[0] : currentUser.id;
              const { error } = await supabase.from('calls').insert({
                id: callId,
                caller_id: currentUser.id,
                recipient_id: primaryRecipient,
                status: 'busy',
                started_at: Date.now(),
                ended_at: null,
                is_video: isVideo || false,
                invited_ids: recipientIds,
                joined_ids: []
              });
              if (error) {
                if ((error as any).code === '42501') {
                  console.warn('[CALLS] insert blocked by row-level security (42501). Skipping further inserts.');
                  callsRestrictedRef.current = true;
                } else if ((error as any).status === 401) {
                  console.warn('[CALLS] insert unauthorized (401). Ensure user is authenticated or adjust RLS.');
                } else {
                  console.error('Failed to insert call record:', error);
                }
              }
            } catch (e) {
              console.error('Failed to insert call record:', e);
            }
          }
        } else {
          console.debug('[CALLS] skipping call record insert because `calls` table is not available');
        }
      } catch (e) {
        console.error('Error creating call record:', e);
      }
    })();
    
    // For each recipient create a peer connection. If we already have local tracks, attach them.
    recipientIds.forEach(async (recipientId) => {
        try {
             const pc = createPeerConnection(recipientId);
             console.debug('[WEBRTC] preparing offer for', recipientId);
             if (stream) {
               try {
                 stream.getTracks().forEach(track => { pc.addTrack(track, stream); console.debug('[WEBRTC] added track', track.kind, 'to', recipientId); });
               } catch (e) { console.error('Error adding existing local tracks to pc', e); }
             }
             const offer = await pc.createOffer();
             console.debug('[WEBRTC] created offer for', recipientId, offer.type);
             await pc.setLocalDescription(offer);
             console.debug('[WEBRTC] setLocalDescription for', recipientId);
             sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo, callId });
        } catch(e) {
            console.error(`Failed to call ${recipientId}`, e);
        }
    });
  };

  const addToCall = async (recipientId: string) => {
    if (!currentUser || !isInCall || !activeCallData) return;
    await initiateCallConnection(recipientId, activeCallData.isVideo, true);
    setActiveCallData(prev => prev ? { ...prev, invitedIds: [...prev.invitedIds, recipientId] } : null);
  };

  const initiateCallConnection = async (recipientId: string, isVideo: boolean, isAdding: boolean = false) => {
      try {
          // Do not auto-acquire media here. If `localStream` exists, attach its tracks; otherwise create offer without tracks.
          const stream = localStream;
          const pc = createPeerConnection(recipientId);
          console.debug('[WEBRTC] initiateCallConnection - preparing offer for', recipientId);
          if (stream) {
            try {
              stream.getTracks().forEach(track => { pc.addTrack(track, stream); console.debug('[WEBRTC] added track', track.kind, 'to', recipientId); });
            } catch (e) { console.error('Error adding existing local tracks to pc', e); }
          }
          const offer = await pc.createOffer();
          console.debug('[WEBRTC] initiateCallConnection created offer for', recipientId);
          await pc.setLocalDescription(offer);
          console.debug('[WEBRTC] initiateCallConnection setLocalDescription for', recipientId);
          sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo, callId: activeCallId || null });
      } catch (err) { console.error("Error initiating connection:", err); }
  }

  const acceptIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;
    try {
      // User accepted incoming call via UI gesture: allow autoplay
      setAllowAutoplayForRemote(true);
      // Do not auto-acquire mic/camera when accepting. Create peer connection and answer the offer without local tracks.
      const pc = createPeerConnection(incomingCall.callerId);

      if (incomingCall.offer) {
        console.debug('[WEBRTC] acceptIncomingCall setting remote description from offer');
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

        // After setting remote description, flush buffered candidates for caller
        const pending = pendingRemoteCandidatesRef.current.get(incomingCall.callerId) || [];
        if (pending.length > 0) {
          for (const c of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
              console.debug('[WEBRTC] flushed pending remote candidate for (after accept)', incomingCall.callerId, c);
            } catch (e) {
              console.error('[WEBRTC] error adding flushed candidate (after accept) for', incomingCall.callerId, e);
            }
          }
          pendingRemoteCandidatesRef.current.delete(incomingCall.callerId);
        }

        const answer = await pc.createAnswer();
        console.debug('[WEBRTC] acceptIncomingCall created answer');
        await pc.setLocalDescription(answer);
        console.debug('[WEBRTC] acceptIncomingCall setLocalDescription and sending ANSWER');
        sendSignal('ANSWER', incomingCall.callerId, { sdp: { type: answer.type, sdp: answer.sdp }, callId: incomingCall.callId });
      }

      setIsInCall(true);
      setActiveCallId(incomingCall.callId || null);
      setActiveCallData({ invitedIds: [incomingCall.callerId], joinedIds: [incomingCall.callerId], isVideo: incomingCall.isVideo });
      setIncomingCall(null);
    } catch (err) { console.error("Error accepting call:", err); }
  };

  const rejectIncomingCall = () => {
    if (incomingCall && currentUser) {
      sendSignal('HANGUP', incomingCall.callerId, {});
      setIncomingCall(null);
    }
  };

  const endCall = async () => {
    if (activeCallData && currentUser) {
       const invited = activeCallData.invitedIds || [];
       const joined = activeCallData.joinedIds || [];
       const notJoined = invited.filter(id => !joined.includes(id));

       // Create missed-call notifications for those who were invited but didn't join
       for (const recipientId of notJoined) {
            try {
              // Create missed-call notification (de-duplication prevents duplicates)
              try {
                const recentWindow = Date.now() - 10000;
                const { data: existingNotifs } = await supabase.from('notifications')
                  .select('id')
                  .eq('recipient_id', recipientId)
                  .eq('sender_id', currentUser.id)
                  .eq('type', NotificationType.MISSED_CALL)
                  .gt('timestamp', recentWindow)
                  .limit(1);
                if (!existingNotifs || existingNotifs.length === 0) {
                    const { error: notifErr } = await supabase.from('notifications').insert({
                      id: 'n-' + Date.now() + Math.random(),
                      recipient_id: recipientId,
                      sender_id: currentUser.id,
                      type: NotificationType.MISSED_CALL,
                      title: 'Missed Call',
                      message: `You missed a call from ${currentUser.name}`,
                      timestamp: Date.now(),
                      read: false,
                      link_to: activeCallId || currentUser.id
                    });
                  if (notifErr) console.error('Error creating missed-call notification for', recipientId, notifErr);
                } else {
                  console.info('Skipped duplicate missed-call notification (endCall) for', currentUser.id, '->', recipientId);
                }
              } catch (e) { console.error('Error checking/inserting missed-call notification (endCall):', e); }
          // Also create a chat message for the missed call so it appears in conversations
            try {
            // Create missed-call chat message (de-duplication prevents duplicates)
            const recentWindow = Date.now() - 10000;
            const { data: existing } = await supabase.from('messages')
              .select('id')
              .eq('sender_id', currentUser.id)
              .eq('recipient_id', recipientId)
              .eq('type', 'missed_call')
              .gt('timestamp', recentWindow)
              .limit(1);
              if (!existing || existing.length === 0) {
              const { error: insErr } = await supabase.from('messages').insert({
                id: 'm-' + Date.now() + Math.random(),
                sender_id: currentUser.id,
                recipient_id: recipientId,
                text: `You missed a call from ${currentUser.name}`,
                timestamp: Date.now(),
                type: 'missed_call',
                attachments: []
              });
              if (insErr) console.error('Error creating missed call message for', recipientId, insErr);
            } else {
              console.info('Skipped duplicate missed-call message (endCall) for', currentUser.id, '->', recipientId);
            }
          } catch (e) { console.error('Error creating missed call message for', recipientId, e); }
         } catch (e) {
           console.error('Failed to create missed-call notification for', recipientId, e);
         }
       }

       // Update calls table to mark ended (only if available)
       try {
         if (hasCallsTable && activeCallId) {
           if (callsRestrictedRef.current) {
             console.debug('[CALLS] skipping call record update because table is restricted by RLS');
           } else {
             try {
               const { error: updErr } = await supabase.from('calls').update({ ended_at: Date.now(), status: 'completed', joined_ids: joined }).eq('id', activeCallId);
               if (updErr) {
                 if ((updErr as any).code === '42501') {
                   console.warn('[CALLS] update blocked by row-level security (42501).');
                   callsRestrictedRef.current = true;
                 } else if ((updErr as any).status === 401) {
                   console.warn('[CALLS] update unauthorized (401).');
                 } else {
                   console.error('Failed to update call record on end:', updErr);
                 }
               }
             } catch (e) {
               console.error('Failed to update call records on end:', e);
             }
           }
         } else {
           if (!hasCallsTable) console.debug('[CALLS] skipping call record update because `calls` table is not available');
         }
       } catch (e) {
         console.error('Error updating call record on end:', e);
       }

       // Notify all invited (online ones will handle HANGUP)
       invited.forEach(pid => { sendSignal('HANGUP', pid, {}); });
    }
    cleanupCall();
  };

  const handleRemoteHangup = (senderId: string) => {
    const pc = peerConnectionsRef.current.get(senderId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(senderId); }
    setRemoteStreams(prev => { const newMap = new Map(prev); newMap.delete(senderId); return newMap; });
    setActiveCallData(prev => {
        if (!prev) return null;
        const newJoined = prev.joinedIds.filter(id => id !== senderId);
        if (newJoined.length === 0) { cleanupCall(); return null; }
        return { ...prev, joinedIds: newJoined };
    });
  };

  const cleanupCall = () => {
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); }
    if (placeholderVideoTrackRef.current) { try { placeholderVideoTrackRef.current.stop(); } catch(e) {} placeholderVideoTrackRef.current = null; }
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsInCall(false);
    setActiveCallData(null);
    setActiveCallId(null);
    setIsScreenSharing(false);
    setIsMicOn(false);
    setIsCameraOn(false);
    localVideoTrackRef.current = null;
  };

  const revertToCamera = async () => {
    if (peerConnectionsRef.current.size === 0 || !localStream) return;
    try {
        let newVideoTrack: MediaStreamTrack | null = null;
        if (isCameraOn) {
            const cameraStream = await getUserMediaSafe({ video: true });
            newVideoTrack = cameraStream.getVideoTracks()[0];
            localVideoTrackRef.current = newVideoTrack;
            localStream.addTrack(newVideoTrack);
        }
        
        peerConnectionsRef.current.forEach(async (pc) => {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(newVideoTrack);
            }
        });
        
        setIsScreenSharing(false);
        setLocalStream(new MediaStream(localStream.getTracks()));
    } catch (e) { 
        console.error("Error reverting to camera:", e); 
        setIsScreenSharing(false); 
    }
  };

  const toggleScreenShare = async () => {
    // Allow screen-share even if there are no peers; create or augment localStream
    if (isMobileDevice()) {
      alert('Screen sharing is not supported on mobile devices in this app.');
      console.debug('[CALLS] blocked screen share on mobile device');
      return;
    }

    if (!isGetDisplayMediaAvailable()) {
      console.error('getDisplayMedia not available for screen sharing');
      alert('Screen sharing is not supported in this browser or the page is not secure (HTTPS).');
      return;
    }

    if (isScreenSharing) {
      try {
        if (localStream) {
          const screenTrack = localStream.getVideoTracks().find(t => t.label.toLowerCase().includes('screen') || t.label.toLowerCase().includes('window'));
          if (screenTrack) {
            screenTrack.stop();
            localStream.removeTrack(screenTrack);
          }
        }
        await revertToCamera();
      } catch (e) { console.error("Error stopping screen share:", e); }
      return;
    }

    try {
      // If camera is on, stop it temporarily so we replace the track in the stream
      if (isCameraOn && localStream) {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
      }

      const displayStream = await getDisplayMediaSafe({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];

      // Ensure localStream exists
      if (!localStream) {
        setLocalStream(new MediaStream([screenTrack]));
      } else {
        localStream.addTrack(screenTrack);
      }

      // Handle stream ending (user clicks "Stop Sharing" in browser UI)
      screenTrack.onended = () => { revertToCamera(); };

      // Update all peers
      for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
           const senders = pc.getSenders();
           const videoSender = senders.find(s => s.track?.kind === 'video');

           if (videoSender) {
               // If a video sender exists, simply replace the track
               await videoSender.replaceTrack(screenTrack);
           } else {
               // If no video sender (e.g. audio-only call), add track and renegotiate
               pc.addTrack(screenTrack, localStream || displayStream);
               const offer = await pc.createOffer();
               await pc.setLocalDescription(offer);
               // We need to send this offer to the specific recipient
              sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp }, isVideo: true, callId: activeCallId || null });
           }
      }

      setIsScreenSharing(true);
      setLocalStream(new MediaStream((localStream || displayStream).getTracks()));
    } catch (err: any) { console.error("Error starting screen share:", err); alert('Could not start screen sharing. Check permissions.'); }
  };

  return (
    <AppContext.Provider value={{
      currentUser, users, projects, tasks, messages, groups, notifications, incomingCall, isInCall, activeCallData, activeCallId,
      localStream, remoteStreams, isScreenSharing, isMicOn, isCameraOn,
      allowAutoplayForRemote, setAllowAutoplayForRemote,
      deletedMessageIds, clearChatHistory,
      login, logout, addUser, updateUser, deleteUser, addTask, updateTask, moveTask, addMessage, createGroup, addProject, updateProject, deleteProject,
      triggerNotification, markNotificationRead, clearNotifications, clearNotification, clearAllNotifications, markChatRead, getUnreadCount, totalUnreadChatCount,
      startCall, startGroupCall, addToCall, acceptIncomingCall, rejectIncomingCall, endCall, toggleScreenShare, toggleMic, toggleCamera
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};