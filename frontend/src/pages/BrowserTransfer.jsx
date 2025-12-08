import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import webrtcService from '../services/webrtc';
import { generateRoomId, checkHealth, checkRoomExists } from '../api/signaling';

// Bird SVG component
const Bird = ({ className = "", style = {} }) => (
  <svg viewBox="0 0 50 20" fill="currentColor" className={className} style={style}>
    <path d="M0 10 Q 12 0, 25 10 Q 38 0, 50 10 Q 38 5, 25 10 Q 12 5, 0 10" />
  </svg>
);

// Cloud component
const Cloud = ({ className = "", size = "medium" }) => {
  const sizes = {
    small: "w-32 h-16",
    medium: "w-48 h-24",
    large: "w-72 h-36"
  };

  return (
    <div className={`absolute ${sizes[size]} ${className}`}>
      <svg viewBox="0 0 200 100" className="w-full h-full">
        <ellipse cx="60" cy="60" rx="50" ry="35" fill="rgba(255,255,255,0.7)" />
        <ellipse cx="100" cy="50" rx="45" ry="40" fill="rgba(255,255,255,0.8)" />
        <ellipse cx="140" cy="60" rx="50" ry="35" fill="rgba(255,255,255,0.7)" />
        <ellipse cx="80" cy="45" rx="35" ry="30" fill="rgba(255,255,255,0.85)" />
        <ellipse cx="120" cy="45" rx="35" ry="30" fill="rgba(255,255,255,0.85)" />
      </svg>
    </div>
  );
};

// Step indicator
const Steps = ({ current }) => (
  <div className="flex items-center justify-center gap-2 mb-8">
    {[1, 2, 3].map((step) => (
      <div
        key={step}
        className={`w-2 h-2 rounded-full transition-all duration-300 ${
          step === current ? 'w-8 bg-gray-600' : step < current ? 'bg-gray-400' : 'bg-gray-300'
        }`}
      />
    ))}
  </div>
);

const BrowserTransfer = () => {
  const navigate = useNavigate();

  // Flow state: 'choice' | 'join-input' | 'room'
  const [step, setStep] = useState('choice');

  // Connection state
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [signalingAvailable, setSignalingAvailable] = useState(null);

  // File transfer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [transferProgress, setTransferProgress] = useState(null);
  const [pendingFileRequest, setPendingFileRequest] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Completion modal
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completedTransfer, setCompletedTransfer] = useState(null);

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Device name
  const deviceName = useRef(
    localStorage.getItem('crossdrop_device_name') || `Device-${Math.random().toString(36).substr(2, 4)}`
  ).current;

  // Check signaling server
  useEffect(() => {
    checkHealth()
      .then(() => setSignalingAvailable(true))
      .catch(() => setSignalingAvailable(false));
  }, []);

  // Cleanup on unmount only (no dependencies to avoid disconnecting on state changes)
  useEffect(() => {
    // On mount, ensure no stale connections
    if (webrtcService.isConnected() && !roomId) {
      console.warn('Cleaning up stale WebRTC connection on mount');
      webrtcService.disconnect();
    }

    return () => {
      // Only disconnect on component unmount
      if (webrtcService.isConnected()) {
        console.log('Component unmounting, disconnecting WebRTC');
        webrtcService.disconnect();
      }
    };
  }, []); // Empty deps - only run on mount/unmount

  // Handle page visibility changes - just for logging, connection persists
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden - connection maintained');
      } else {
        console.log('Page visible again - connection maintained');
        // Don't check connection here - let the WebRTC service handle reconnection via onDisconnected callback
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty deps - listener doesn't need to change

  // Setup WebRTC handlers
  useEffect(() => {
    // Track if component is mounted
    let isMounted = true;

    webrtcService.onConnected = (data) => {
      if (!isMounted) return; // Prevent state updates after unmount
      setIsConnected(true);
      setIsConnecting(false);
      setRoomId(data.roomId);
      setPeers(data.peers || []);
      setStep('room');
      toast.success('Connected to room');
    };

    webrtcService.onDisconnected = () => {
      if (!isMounted) return; // Prevent state updates after unmount
      setIsConnected(false);
      setPeers([]);
      setSelectedPeer(null);
      setSelectedFile(null);
      setTransferProgress(null);
      setPendingFileRequest(null);
      if (step !== 'choice') {
        setStep('choice');
      }
    };

    webrtcService.onPeerJoined = (data) => {
      if (!isMounted) return;
      setPeers(prev => {
        if (prev.some(p => p.peerId === data.peerId)) return prev;
        const newPeers = [...prev, { peerId: data.peerId, deviceName: data.deviceName }];
        toast.success(`${data.deviceName} joined the room`);
        return newPeers;
      });
    };

    webrtcService.onPeerLeft = (data) => {
      if (!isMounted) return;
      setPeers(prev => {
        const peer = prev.find(p => p.peerId === data.peerId);
        if (peer) {
          toast(`${peer.deviceName} left the room`, { icon: '👋' });
        }
        return prev.filter(p => p.peerId !== data.peerId);
      });
      if (selectedPeer?.peerId === data.peerId) setSelectedPeer(null);
    };

    webrtcService.onError = (error) => {
      if (!isMounted) return; // Prevent state updates after unmount
      console.error('WebRTC error:', error);
      setIsConnecting(false);
      if (typeof error === 'string') {
        toast.error(error);
      }
    };

    webrtcService.onFileRequest = (data) => {
      setPendingFileRequest(data);
    };

    webrtcService.onFileAccepted = (data) => {
      webrtcService.startFileSend(data.fromPeerId);
    };

    webrtcService.onFileRejected = () => {
      setTransferProgress(null);
    };

    webrtcService.onFileProgress = (data) => {
      setTransferProgress(data);
    };

    webrtcService.onFileComplete = (data) => {
      setTransferProgress(null);
      setSelectedFile(null);
      setCompletedTransfer(data);
      setShowCompletionModal(true);
    };

    webrtcService.onFileError = () => {
      setTransferProgress(null);
    };

    return () => {
      isMounted = false;
      Object.keys(webrtcService).forEach(key => {
        if (key.startsWith('on')) webrtcService[key] = null;
      });
    };
  }, [selectedPeer, step]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  // Actions
  const handleCreateRoom = async () => {
    setIsConnecting(true);
    try {
      const newRoomId = generateRoomId();
      await webrtcService.connect(newRoomId, deviceName);
      // Success handling is done in onConnected callback
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room. Please try again.');
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) return;
    setIsConnecting(true);
    const roomIdUpper = inputRoomId.toUpperCase();

    try {
      // First check if room exists
      const exists = await checkRoomExists(roomIdUpper);

      if (!exists) {
        toast.error('Room not found. Please check the code and try again.');
        setIsConnecting(false);
        return;
      }

      // Room exists, proceed to join
      await webrtcService.connect(roomIdUpper, deviceName);
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room. Please try again.');
      setIsConnecting(false);
    }
  };

  const handleLeaveRoom = () => {
    webrtcService.disconnect();
    setRoomId('');
    setInputRoomId('');
    setIsConnected(false);
    setIsConnecting(false);
    setPeers([]);
    setSelectedPeer(null);
    setSelectedFile(null);
    setTransferProgress(null);
    setPendingFileRequest(null);
    setStep('choice');
  };

  const handleBackButton = () => {
    if (step === 'room' && isConnected) {
      // If in room, leave it first
      handleLeaveRoom();
    } else if (step === 'join-input') {
      // Just go back to choice
      setInputRoomId('');
      setStep('choice');
    } else {
      // Navigate home
      navigate('/');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSendFile = () => {
    if (!selectedFile || !selectedPeer) return;
    if (!webrtcService.isConnectedTo(selectedPeer.peerId)) return;
    webrtcService.requestFileSend(selectedPeer.peerId, selectedFile);
  };

  const handleAcceptFile = () => {
    if (!pendingFileRequest) return;
    webrtcService.acceptFileTransfer(pendingFileRequest.fromPeerId, pendingFileRequest.fileInfo);
    setPendingFileRequest(null);
  };

  const handleRejectFile = () => {
    if (!pendingFileRequest) return;
    webrtcService.rejectFileTransfer(pendingFileRequest.fromPeerId, 'Declined');
    setPendingFileRequest(null);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room code copied to clipboard');
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div className="sky-bg min-h-screen relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Clouds */}
      <Cloud size="large" className="top-20 -left-10 opacity-60 animate-float-slow" />
      <Cloud size="medium" className="top-40 right-20 opacity-50 animate-float" />
      <Cloud size="small" className="bottom-32 left-1/4 opacity-40 animate-float-slow" />

      {/* Birds */}
      <Bird className="absolute top-28 left-1/3 w-8 h-4 text-gray-500/50 animate-bird" />
      <Bird className="absolute top-36 right-1/4 w-6 h-3 text-gray-400/40 animate-bird" style={{ animationDelay: '0.5s' }} />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-12">

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleBackButton}
          className="absolute top-6 left-6 btn-ghost"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </motion.button>

        {/* Server unavailable warning */}
        <AnimatePresence>
          {signalingAvailable === false && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-6 left-1/2 -translate-x-1/2 glass-card px-4 py-2 text-sm text-red-600"
            >
              Server unavailable
            </motion.div>
          )}
        </AnimatePresence>

        {/* STEP 1: Choice - Create or Join */}
        <AnimatePresence mode="wait">
          {step === 'choice' && !isConnected && (
            <motion.div
              key="choice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <Bird className="w-16 h-7 text-gray-600/60 mx-auto mb-6 animate-bird" />

              <h1 className="heading-page mb-4">Start sharing</h1>
              <p className="text-artistic mb-10">
                Create a room or join one to begin
              </p>

              <div className="space-y-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting || signalingAvailable === false}
                  className="btn-golden w-full"
                >
                  {isConnecting ? (
                    <svg className="w-5 h-5 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Create Room
                    </>
                  )}
                </button>

                <button
                  onClick={() => setStep('join-input')}
                  disabled={isConnecting || signalingAvailable === false}
                  className="btn-outline w-full"
                >
                  Join Room
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 1.5: Join Input */}
          {step === 'join-input' && !isConnected && (
            <motion.div
              key="join-input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <h1 className="heading-page mb-4">Join room</h1>
              <p className="text-artistic mb-8">
                Enter the room code to connect
              </p>

              <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                autoFocus
                className="input-artistic mb-6"
              />

              <button
                onClick={handleJoinRoom}
                disabled={isConnecting || !inputRoomId.trim()}
                className="btn-golden w-full"
              >
                {isConnecting ? (
                  <svg className="w-5 h-5 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  'Join'
                )}
              </button>
            </motion.div>
          )}

          {/* STEP 2: Room View */}
          {step === 'room' && isConnected && (
            <motion.div
              key="room"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl"
            >
              {/* Room code display */}
              <div className="text-center mb-8">
                <p className="text-sm text-gray-500 mb-2">Room Code</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <span className="room-code">{roomId}</span>
                  <button onClick={copyRoomId} className="btn-ghost sm:relative sm:top-0" title="Copy room code">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="sm:hidden">Copy Code</span>
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Peers */}
                <div className="glass-card p-6">
                  <h2 className="heading-section mb-4">
                    {peers.length === 0 ? 'Waiting for peers...' : 'Connected'}
                  </h2>

                  {peers.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400 animate-pulse-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">Share the room code above</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {peers.map((peer) => {
                        const isReady = webrtcService.isConnectedTo(peer.peerId);
                        const isSelected = selectedPeer?.peerId === peer.peerId;

                        return (
                          <div
                            key={peer.peerId}
                            onClick={() => setSelectedPeer(isSelected ? null : peer)}
                            className={`peer-card ${isSelected ? 'selected' : ''}`}
                          >
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-gray-800">{peer.deviceName}</p>
                              <p className="text-xs text-gray-500">
                                {isReady ? 'Ready' : 'Connecting...'}
                              </p>
                            </div>
                            <div className={`status-dot ${isReady ? '' : 'offline'}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* File Drop Zone */}
                <div className="glass-card p-6">
                  <h2 className="heading-section mb-4">Send file</h2>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <div
                    ref={dropZoneRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`drop-zone mb-4 ${isDragging ? 'active' : ''}`}
                  >
                    {selectedFile ? (
                      <div>
                        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-yellow-100 flex items-center justify-center">
                          <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <p className="font-medium text-gray-800 truncate">{selectedFile.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center animate-bounce-gentle">
                          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-gray-500">Drop file here or click to browse</p>
                      </div>
                    )}
                  </div>

                  {/* Transfer Progress */}
                  <AnimatePresence>
                    {transferProgress && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4"
                      >
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-600">
                            {transferProgress.direction === 'send' ? 'Sending...' : 'Receiving...'}
                          </span>
                          <span className="font-medium">{transferProgress.progress?.toFixed(0)}%</span>
                        </div>
                        <div className="progress-track">
                          <motion.div
                            className="progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${transferProgress.progress || 0}%` }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={handleSendFile}
                    disabled={!selectedFile || !selectedPeer || !!transferProgress}
                    className="btn-golden w-full"
                  >
                    {!selectedFile ? 'Select a file' : !selectedPeer ? 'Select a peer' : 'Send'}
                  </button>
                </div>
              </div>

              {/* Leave button */}
              <div className="text-center mt-8">
                <button onClick={handleLeaveRoom} className="btn-ghost text-gray-500">
                  Leave Room
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Incoming File Modal */}
        <AnimatePresence>
          {pendingFileRequest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="modal-content"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-500 animate-bounce-gentle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </div>

                <h3 className="heading-section mb-2">Incoming file</h3>
                <p className="text-gray-500 mb-4">
                  from <span className="font-medium text-gray-700">{pendingFileRequest.fromDeviceName}</span>
                </p>

                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <p className="font-medium text-gray-800 truncate">{pendingFileRequest.fileInfo.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(pendingFileRequest.fileInfo.size)}</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleRejectFile} className="btn-outline flex-1">
                    Decline
                  </button>
                  <button onClick={handleAcceptFile} className="btn-golden flex-1">
                    Accept
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Completion Modal */}
        <AnimatePresence>
          {showCompletionModal && completedTransfer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="modal-content"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center animate-success-pulse">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <h3 className="heading-section mb-2">
                  {completedTransfer.direction === 'send' ? 'File sent!' : 'File received!'}
                </h3>
                <p className="text-gray-500 mb-6">
                  {completedTransfer.fileInfo.name}
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCompletionModal(false);
                      handleLeaveRoom();
                    }}
                    className="btn-outline flex-1"
                  >
                    Exit
                  </button>
                  <button
                    onClick={() => setShowCompletionModal(false)}
                    className="btn-golden flex-1"
                  >
                    Stay in room
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BrowserTransfer;
