import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getDiscoveredPeers,
  getDiscoveryStatus,
  requestConnection,
  getPendingRequests,
  acceptConnection,
  rejectConnection,
  getConnections,
  getTransferHistory,
  disconnect,
  startDiscovery,
  stopDiscovery
} from '../api/backend';
import config from '../config';

const DeviceTransfer = () => {
  // Discovery state
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectionStatuses, setConnectionStatuses] = useState({});
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requesting, setRequesting] = useState({});

  // Connection state
  const [connections, setConnections] = useState([]);

  // Transfer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [transferStatus, setTransferStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [transferHistory, setTransferHistory] = useState([]);

  // Progress tracking state
  const [transferProgress, setTransferProgress] = useState({
    isActive: false,
    progress: 0,
    bytesSent: 0,
    totalBytes: 0,
    speed: 0,
    elapsedTime: 0,
    estimatedTimeRemaining: 0
  });
  const [receivingProgress, setReceivingProgress] = useState(null);
  const [currentTransferId, setCurrentTransferId] = useState(null);
  const [currentReceivingTransferId, setCurrentReceivingTransferId] = useState(null);
  const progressPollInterval = useRef(null);

  // Modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const shownRequestIdsRef = useRef(new Set());

  // File input ref
  const fileInputRef = useRef(null);

  // Track previous IPs for change detection
  const previousLocalIpRef = useRef(null);
  const previousPeerIpsRef = useRef(new Map());

  // IP change detection
  useEffect(() => {
    const currentLocalIp = status?.local_ip;
    const previousLocalIp = previousLocalIpRef.current;

    if (currentLocalIp && previousLocalIp && currentLocalIp !== previousLocalIp) {
      toast.success(`Your IP address changed: ${previousLocalIp} → ${currentLocalIp}`, { duration: 5000 });
    }

    if (currentLocalIp) {
      previousLocalIpRef.current = currentLocalIp;
    }
  }, [status?.local_ip]);

  useEffect(() => {
    if (!peers || peers.length === 0) return;

    const currentPeerIps = new Map();
    peers.forEach(peer => {
      if (peer.device_name && peer.ip) {
        currentPeerIps.set(peer.device_name, peer.ip);
      }
    });

    currentPeerIps.forEach((newIp, deviceName) => {
      const oldIp = previousPeerIpsRef.current.get(deviceName);
      if (oldIp && oldIp !== newIp) {
        toast(`Device "${deviceName}" IP changed: ${oldIp} → ${newIp}`, { duration: 4000 });
      }
    });

    previousPeerIpsRef.current = currentPeerIps;
  }, [peers]);

  const fetchDiscoveryData = async () => {
    try {
      const [peersData, statusData, pendingData, connData] = await Promise.all([
        getDiscoveredPeers(),
        getDiscoveryStatus(),
        getPendingRequests(),
        getConnections(),
      ]);

      setPeers(peersData.peers || []);
      setStatus(statusData);
      setIsDiscovering(statusData?.status === 'active' || statusData?.scanning === true);
      setPendingRequests(pendingData.pending_requests || []);
      const newConnections = connData.connections || [];
      setConnections(newConnections);

      const statusMap = {};
      newConnections.forEach(conn => {
        statusMap[conn.peer_ip] = true;
      });
      setConnectionStatuses(statusMap);

      const localIp = statusData?.local_ip;
      const peerConnections = newConnections.filter(conn => conn.peer_ip !== localIp);

      // Auto-select device logic
      if (selectedDevice && peerConnections.length > 0) {
        const deviceWithSameIp = peerConnections.find(conn => conn.peer_ip === selectedDevice.peer_ip);
        const deviceWithSameName = peerConnections.find(
          conn => conn.peer_name === selectedDevice.peer_name && conn.peer_ip !== selectedDevice.peer_ip
        );

        if (deviceWithSameName) {
          setSelectedDevice({ peer_ip: deviceWithSameName.peer_ip, peer_name: deviceWithSameName.peer_name });
        } else if (!deviceWithSameIp) {
          setSelectedDevice(null);
        }
      }

      if (peerConnections.length === 1 && !selectedDevice) {
        setSelectedDevice({ peer_ip: peerConnections[0].peer_ip, peer_name: peerConnections[0].peer_name });
      } else if (peerConnections.length === 0) {
        setSelectedDevice(null);
      }
    } catch (error) {
      console.error('Failed to fetch discovery data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransferHistory = async () => {
    try {
      const historyData = await getTransferHistory();
      setTransferHistory(historyData.transfers || []);
    } catch (error) {
      console.error('Failed to fetch transfer history:', error);
    }
  };

  const pollTransferProgress = async () => {
    try {
      const localIp = status?.local_ip;
      if (!localIp) return;

      const response = await fetch(`${config.API_BASE_URL}/transfer/progress?local_ip=${localIp}`);
      if (!response.ok) return;

      const data = await response.json();

      if (data.sending && data.sending.length > 0) {
        const sendProgress = data.sending[0];
        if (sendProgress.status === 'active') {
          setCurrentTransferId(sendProgress.transfer_id);
          const elapsed = sendProgress.start_time ? (Date.now() / 1000 - sendProgress.start_time) : 0;
          const remaining = sendProgress.speed > 0 && sendProgress.file_size > 0
            ? ((sendProgress.file_size - sendProgress.bytes_transferred) / (1024 * 1024)) / sendProgress.speed
            : 0;
          setTransferProgress({
            isActive: true,
            progress: sendProgress.progress_percent || 0,
            bytesSent: sendProgress.bytes_transferred || 0,
            totalBytes: sendProgress.file_size || 0,
            speed: sendProgress.speed || 0,
            elapsedTime: elapsed,
            estimatedTimeRemaining: remaining
          });
        }
      } else if (!sending && transferProgress.isActive) {
        setTransferProgress({ isActive: false, progress: 0, bytesSent: 0, totalBytes: 0, speed: 0, elapsedTime: 0, estimatedTimeRemaining: 0 });
        setCurrentTransferId(null);
      }

      if (data.receiving && data.receiving.length > 0) {
        const recvProgress = data.receiving[0];
        if (recvProgress.status === 'active') {
          setCurrentReceivingTransferId(recvProgress.transfer_id);
          const elapsed = recvProgress.start_time ? (Date.now() / 1000 - recvProgress.start_time) : 0;
          const remaining = recvProgress.speed > 0 && recvProgress.file_size > 0
            ? ((recvProgress.file_size - recvProgress.bytes_transferred) / (1024 * 1024)) / recvProgress.speed
            : 0;
          setReceivingProgress({
            filename: recvProgress.filename || 'unknown',
            progress: recvProgress.progress_percent || 0,
            bytesReceived: recvProgress.bytes_transferred || 0,
            totalBytes: recvProgress.file_size || 0,
            speed: recvProgress.speed || 0,
            senderIp: recvProgress.sender_ip || 'unknown',
            elapsedTime: elapsed,
            estimatedTimeRemaining: remaining,
            transferId: recvProgress.transfer_id
          });
        }
      } else if (receivingProgress) {
        setReceivingProgress(null);
        setCurrentReceivingTransferId(null);
      }
    } catch (error) {
      console.error('Failed to poll transfer progress:', error);
    }
  };

  // Separate polling intervals for different data types
  useEffect(() => {
    fetchDiscoveryData();
    fetchTransferHistory();

    let discoveryInterval;
    let historyInterval;

    if (autoRefresh) {
      // Poll discovery/connection data every 5 seconds (was 2s - too aggressive)
      discoveryInterval = setInterval(fetchDiscoveryData, 5000);

      // Poll transfer history less frequently - every 10 seconds
      historyInterval = setInterval(fetchTransferHistory, 10000);
    }

    return () => {
      if (discoveryInterval) clearInterval(discoveryInterval);
      if (historyInterval) clearInterval(historyInterval);
    };
  }, [autoRefresh]);

  // Separate effect for transfer progress polling - only when actively transferring
  useEffect(() => {
    let progressInterval;

    // Only poll progress when there's an active transfer
    if (sending || receivingProgress) {
      progressInterval = setInterval(pollTransferProgress, 1000); // Poll every 1s during transfers
    }

    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [sending, receivingProgress, status?.local_ip]);

  useEffect(() => {
    if (pendingRequests.length > 0 && !showRequestModal) {
      const unshownRequest = pendingRequests.find(req => !shownRequestIdsRef.current.has(req.request_id));
      if (unshownRequest) {
        setCurrentRequest(unshownRequest);
        setShowRequestModal(true);
        shownRequestIdsRef.current.add(unshownRequest.request_id);
      }
    }

    const currentRequestIds = new Set(pendingRequests.map(r => r.request_id));
    shownRequestIdsRef.current.forEach(id => {
      if (!currentRequestIds.has(id)) shownRequestIdsRef.current.delete(id);
    });
  }, [pendingRequests, showRequestModal]);

  const handleRequestConnection = async (peerIp, peerName) => {
    setRequesting({ ...requesting, [peerIp]: true });
    try {
      const result = await requestConnection(peerIp);

      if (result.request_delivered) {
        toast.success(`Connection request sent to ${peerName}`);
      } else {
        toast.success(`Connection requested to ${peerName}`, { duration: 3000 });
        toast('Request may take a moment to reach the device', { duration: 4000 });
      }

      // Poll for connection status updates
      fetchDiscoveryData();
      setTimeout(fetchDiscoveryData, 2000);
      setTimeout(fetchDiscoveryData, 5000);
    } catch (error) {
      toast.error(`Failed to request connection: ${error.response?.data?.detail || error.message}`);
    } finally {
      setRequesting({ ...requesting, [peerIp]: false });
    }
  };

  const handleAcceptRequest = async (requestId, fromName) => {
    try {
      const result = await acceptConnection(requestId);
      toast.success(`Connected with ${fromName}!`);
      setShowRequestModal(false);
      setCurrentRequest(null);

      // Immediately refresh data and then again after delays
      // to ensure both local and remote state is synchronized
      fetchDiscoveryData();
      setTimeout(fetchDiscoveryData, 1000);
      setTimeout(fetchDiscoveryData, 3000);
    } catch (error) {
      toast.error(`Failed to accept connection: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await rejectConnection(requestId);
      toast.success('Connection request rejected');
      setShowRequestModal(false);
      setCurrentRequest(null);
      setTimeout(fetchDiscoveryData, 500);
    } catch (error) {
      toast.error(`Failed to reject connection: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setTransferStatus('');
      toast.success(`File selected: ${file.name}`, { duration: 2000 });
    }
  };

  const handleSend = () => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    if (!selectedDevice) {
      toast.error('Please select a connected device');
      return;
    }

    const localIp = status?.local_ip;
    const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
    const isDeviceStillConnected = peerConnections.some(conn => conn.peer_ip === selectedDevice.peer_ip);

    let targetIp = selectedDevice.peer_ip;
    if (!isDeviceStillConnected) {
      const deviceWithSameName = peerConnections.find(conn => conn.peer_name === selectedDevice.peer_name);
      if (deviceWithSameName) {
        targetIp = deviceWithSameName.peer_ip;
        setSelectedDevice({ peer_ip: deviceWithSameName.peer_ip, peer_name: deviceWithSameName.peer_name });
      } else {
        toast.error('Selected device is no longer connected');
        setSelectedDevice(null);
        return;
      }
    }

    setCurrentTransferId(null);
    setSending(true);

    const fileSize = selectedFile.size;
    setTransferProgress({
      isActive: true,
      progress: 0,
      bytesSent: 0,
      totalBytes: fileSize,
      speed: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0
    });

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('target_ip', targetIp);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        setTransferProgress(prev => ({
          ...prev,
          progress,
          bytesSent: event.loaded
        }));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setTransferProgress({ isActive: false, progress: 100, bytesSent: fileSize, totalBytes: fileSize, speed: 0, elapsedTime: 0, estimatedTimeRemaining: 0 });
        toast.success(`File sent successfully!`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchTransferHistory();
      } else {
        toast.error('Failed to send file');
      }
      setSending(false);
      setCurrentTransferId(null);
    });

    xhr.addEventListener('error', () => {
      setTransferProgress({ isActive: false, progress: 0, bytesSent: 0, totalBytes: 0, speed: 0, elapsedTime: 0, estimatedTimeRemaining: 0 });
      toast.error('Transfer failed');
      setSending(false);
    });

    xhr.timeout = 300000;
    xhr.addEventListener('timeout', () => {
      setTransferProgress({ isActive: false, progress: 0, bytesSent: 0, totalBytes: 0, speed: 0, elapsedTime: 0, estimatedTimeRemaining: 0 });
      toast.error('Transfer timeout');
      setSending(false);
    });

    xhr.open('POST', `${config.API_BASE_URL}/transfer/send`);
    xhr.send(formData);
  };

  const handleDisconnect = async (peerIp, peerName) => {
    try {
      await disconnect(peerIp);
      toast.success(`Disconnected from ${peerName}`);
      if (selectedDevice?.peer_ip === peerIp) setSelectedDevice(null);
      fetchDiscoveryData();
    } catch (error) {
      toast.error(`Failed to disconnect: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleCancelTransfer = async (transferId, isReceiving = false) => {
    if (!transferId) return;

    try {
      const response = await fetch(`${config.API_BASE_URL}/transfer/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer_id: transferId }),
      });

      if (!response.ok) throw new Error('Failed to cancel transfer');

      if (isReceiving) {
        setReceivingProgress(null);
        setCurrentReceivingTransferId(null);
        toast.success('File receive cancelled');
      } else {
        setTransferProgress({ isActive: false, progress: 0, bytesSent: 0, totalBytes: 0, speed: 0, elapsedTime: 0, estimatedTimeRemaining: 0 });
        setSending(false);
        setCurrentTransferId(null);
        toast.success('File send cancelled');
      }
    } catch (error) {
      toast.error(`Failed to cancel transfer: ${error.message}`);
    }
  };

  const handleToggleDiscovery = async () => {
    try {
      if (isDiscovering) {
        await stopDiscovery();
        setIsDiscovering(false);
        toast.success('Discovery stopped');
      } else {
        await startDiscovery();
        setIsDiscovering(true);
        toast.success('Discovery started');
      }
      fetchDiscoveryData();
    } catch (error) {
      toast.error(`Failed to ${isDiscovering ? 'stop' : 'start'} discovery`);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const localIp = status?.local_ip;
  const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="container-default py-8">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="heading-lg mb-2">LAN Transfer</h1>
          <p className="text-body">Discover devices on your network and transfer files directly</p>
        </motion.div>

        {/* Status Bar */}
        {status && (
          <motion.div
            className="card mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-text-tertiary)]">Device</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{status.device_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-text-tertiary)]">IP</span>
                  <code className="text-sm font-mono bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded">{status.local_ip}</code>
                </div>
                <span className={`badge ${status.status === 'active' ? 'badge-success' : 'badge-error'}`}>
                  {status.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">Auto-refresh</span>
              </label>
            </div>
          </motion.div>
        )}

        {/* Connection Request Modal */}
        {showRequestModal && currentRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              className="card max-w-md w-full p-6"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <h3 className="heading-sm mb-4">Connection Request</h3>
              <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg mb-6">
                <p className="text-[var(--color-text-primary)] font-medium">{currentRequest.from_name}</p>
                <p className="text-sm text-[var(--color-text-tertiary)] font-mono">{currentRequest.from_ip}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleRejectRequest(currentRequest.request_id)}
                  className="btn btn-secondary flex-1"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleAcceptRequest(currentRequest.request_id, currentRequest.from_name)}
                  className="btn btn-primary flex-1"
                >
                  Accept
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Pending Requests Banner */}
        {pendingRequests.length > 0 && !showRequestModal && (
          <motion.div
            className="card mb-6 border-[var(--color-warning)] bg-[var(--color-warning-light)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">Pending Connection Requests</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{pendingRequests.length} request(s) waiting</p>
              </div>
              <button
                onClick={() => { setCurrentRequest(pendingRequests[0]); setShowRequestModal(true); }}
                className="btn btn-primary btn-sm"
              >
                View
              </button>
            </div>
          </motion.div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Discovery Section */}
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Device Discovery</h2>
              <button
                onClick={handleToggleDiscovery}
                className={`btn btn-sm ${isDiscovering ? 'btn-secondary' : 'btn-primary'}`}
              >
                {isDiscovering ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Discover
                  </>
                )}
              </button>
            </div>

            {/* Discovery Animation */}
            {isDiscovering && (
              <div className="relative h-48 mb-6 flex items-center justify-center">
                <div className="absolute w-32 h-32 rounded-full border-2 border-[var(--color-primary)] opacity-20 animate-ping" />
                <div className="absolute w-24 h-24 rounded-full border-2 border-[var(--color-primary)] opacity-40 animate-ping" style={{ animationDelay: '0.5s' }} />
                <div className="absolute w-16 h-16 rounded-full border-2 border-[var(--color-primary)] opacity-60 animate-ping" style={{ animationDelay: '1s' }} />
                <div className="w-12 h-12 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
                  </svg>
                </div>
              </div>
            )}

            {/* Discovered Devices List */}
            <div className="space-y-3">
              {peers.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-[var(--color-text-secondary)]">
                    {isDiscovering ? 'Searching for devices...' : 'No devices found'}
                  </p>
                  {!isDiscovering && (
                    <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                      Click "Discover" to find devices on your network
                    </p>
                  )}
                </div>
              ) : (
                peers.map((peer) => {
                  const isConnected = connectionStatuses[peer.ip] || connections.some(c => c.peer_ip === peer.ip);
                  const isRequesting = requesting[peer.ip];

                  return (
                    <div
                      key={peer.ip}
                      className={`p-4 rounded-lg border transition-all ${
                        isConnected
                          ? 'border-[var(--color-success)] bg-[var(--color-success-light)]'
                          : 'border-[var(--color-border)] hover:border-[var(--color-primary)] cursor-pointer'
                      }`}
                      onClick={() => !isConnected && !isRequesting && handleRequestConnection(peer.ip, peer.device_name)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            isConnected ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                          }`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-[var(--color-text-primary)]">{peer.device_name}</p>
                            <p className="text-sm text-[var(--color-text-tertiary)] font-mono">{peer.ip}</p>
                          </div>
                        </div>
                        {isConnected ? (
                          <span className="badge badge-success">Connected</span>
                        ) : isRequesting ? (
                          <span className="badge badge-neutral">Requesting...</span>
                        ) : (
                          <span className="text-sm text-[var(--color-text-tertiary)]">Click to connect</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* Transfer Section */}
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-6">File Transfer</h2>

            {/* Connected Devices */}
            {peerConnections.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Send to
                </label>
                <div className="space-y-2">
                  {peerConnections.map((conn) => (
                    <div
                      key={conn.peer_ip}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedDevice?.peer_ip === conn.peer_ip
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                          : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                      }`}
                      onClick={() => setSelectedDevice({ peer_ip: conn.peer_ip, peer_name: conn.peer_name })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            selectedDevice?.peer_ip === conn.peer_ip ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-success)]'
                          }`} />
                          <span className="font-medium text-[var(--color-text-primary)]">{conn.peer_name}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDisconnect(conn.peer_ip, conn.peer_name); }}
                          className="text-sm text-[var(--color-error)] hover:underline"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Select File
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-[var(--color-border)] rounded-xl cursor-pointer hover:border-[var(--color-primary)] transition-colors text-center"
              >
                {selectedFile ? (
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="font-medium text-[var(--color-text-primary)]">{selectedFile.name}</p>
                    <p className="text-sm text-[var(--color-text-tertiary)]">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <p className="text-[var(--color-text-secondary)]">Click to select a file</p>
                    <p className="text-sm text-[var(--color-text-tertiary)]">or drag and drop</p>
                  </div>
                )}
              </div>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!selectedFile || !selectedDevice || sending}
              className="btn btn-primary w-full btn-lg"
            >
              {sending ? 'Sending...' : 'Send File'}
            </button>

            {/* Transfer Progress */}
            {transferProgress.isActive && (
              <div className="mt-6 p-4 bg-[var(--color-bg-secondary)] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">Sending...</span>
                  <span className="text-sm text-[var(--color-primary)]">{transferProgress.progress.toFixed(1)}%</span>
                </div>
                <div className="progress-bar mb-2">
                  <div className="progress-bar-fill" style={{ width: `${transferProgress.progress}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
                  <span>{formatFileSize(transferProgress.bytesSent)} / {formatFileSize(transferProgress.totalBytes)}</span>
                  <span>{transferProgress.speed.toFixed(1)} MB/s</span>
                </div>
                <button
                  onClick={() => handleCancelTransfer(currentTransferId)}
                  className="btn btn-secondary btn-sm w-full mt-3"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Receiving Progress */}
            {receivingProgress && (
              <div className="mt-6 p-4 bg-[var(--color-info-light)] rounded-lg border border-[var(--color-info)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">Receiving: {receivingProgress.filename}</span>
                  <span className="text-sm text-[var(--color-info)]">{receivingProgress.progress.toFixed(1)}%</span>
                </div>
                <div className="progress-bar mb-2">
                  <div className="progress-bar-fill" style={{ width: `${receivingProgress.progress}%`, background: 'var(--color-info)' }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
                  <span>{formatFileSize(receivingProgress.bytesReceived)} / {formatFileSize(receivingProgress.totalBytes)}</span>
                  <span>{receivingProgress.speed.toFixed(1)} MB/s</span>
                </div>
                <button
                  onClick={() => handleCancelTransfer(currentReceivingTransferId, true)}
                  className="btn btn-secondary btn-sm w-full mt-3"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* No connections message */}
            {peerConnections.length === 0 && (
              <div className="mt-6 text-center py-8 border border-dashed border-[var(--color-border)] rounded-lg">
                <p className="text-[var(--color-text-secondary)]">No devices connected</p>
                <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                  Discover and connect to a device to start transferring
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Transfer History */}
        {transferHistory.length > 0 && (
          <motion.div
            className="card mt-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Transfer History</h2>
            <div className="space-y-2">
              {transferHistory.slice(0, 5).map((transfer, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      transfer.direction === 'sent' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    }`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d={transfer.direction === 'sent' ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{transfer.filename}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{formatFileSize(transfer.size)}</p>
                    </div>
                  </div>
                  <span className={`badge ${transfer.status === 'completed' ? 'badge-success' : 'badge-error'}`}>
                    {transfer.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default DeviceTransfer;
