import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { 
  getDiscoveredPeers, 
  getDiscoveryStatus, 
  requestConnection, 
  getConnectionStatus, 
  getPendingRequests, 
  acceptConnection, 
  rejectConnection,
  getConnections,
  sendFileToDevice,
  getTransferHistory,
  disconnect,
  startDiscovery,
  stopDiscovery
} from '../api/backend';
import ConnectionRequestModal from '../components/ConnectionRequestModal';
import '../components/WaveAnimation.css';

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
    progress: 0, // 0-100
    bytesSent: 0,
    totalBytes: 0,
    speed: 0, // MB/s
    elapsedTime: 0, // seconds
    estimatedTimeRemaining: 0 // seconds
  });
  const [receivingProgress, setReceivingProgress] = useState(null);
  const [currentTransferId, setCurrentTransferId] = useState(null); // For sending
  const [currentReceivingTransferId, setCurrentReceivingTransferId] = useState(null); // For receiving
  const progressPollInterval = useRef(null);

  // Modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const shownRequestIdsRef = useRef(new Set()); // Use ref to track shown IDs without causing re-renders

  // Track previous IPs for change detection
  const previousLocalIpRef = useRef(null);
  const previousPeerIpsRef = useRef(new Map()); // Map of device_name -> ip

  // Detect and notify when your own IP changes
  useEffect(() => {
    const currentLocalIp = status?.local_ip;
    const previousLocalIp = previousLocalIpRef.current;
    
    if (currentLocalIp && previousLocalIp && currentLocalIp !== previousLocalIp) {
      toast.success(`Your IP address changed: ${previousLocalIp} → ${currentLocalIp}`, {
        icon: '🔄',
        duration: 5000,
      });
      console.log(`🔄 Local IP changed from ${previousLocalIp} to ${currentLocalIp}`);
    }
    
    if (currentLocalIp) {
      previousLocalIpRef.current = currentLocalIp;
    }
  }, [status?.local_ip]);

  // Detect and notify when peer device IPs change
  useEffect(() => {
    if (!peers || peers.length === 0) return;
    
    const currentPeerIps = new Map();
    peers.forEach(peer => {
      if (peer.device_name && peer.ip) {
        currentPeerIps.set(peer.device_name, peer.ip);
      }
    });
    
    // Check for IP changes
    currentPeerIps.forEach((newIp, deviceName) => {
      const oldIp = previousPeerIpsRef.current.get(deviceName);
      if (oldIp && oldIp !== newIp) {
        toast(`Device "${deviceName}" IP changed: ${oldIp} → ${newIp}`, {
          icon: '🔄',
          duration: 4000,
        });
        console.log(`🔄 Peer device ${deviceName} IP changed from ${oldIp} to ${newIp}`);
      }
    });
    
    // Update the ref with current IPs
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
      // Discovery is active if status is active OR scanning is true
      setIsDiscovering(statusData?.status === 'active' || statusData?.scanning === true);
      const newPendingRequests = pendingData.pending_requests || [];
      setPendingRequests(newPendingRequests);
      const newConnections = connData.connections || [];
      setConnections(newConnections);

      // Build connection status map from connections list (more reliable)
      const statusMap = {};
      newConnections.forEach(conn => {
        statusMap[conn.peer_ip] = true;
      });
      setConnectionStatuses(statusMap);

      // Filter out local device from connections for auto-selection
      const localIp = statusData?.local_ip;
      const peerConnections = newConnections.filter(conn => conn.peer_ip !== localIp);
      
      // Validate and update selectedDevice if IP changed but device name matches
      if (selectedDevice && peerConnections.length > 0) {
        // Check if selectedDevice's IP still exists in connections
        const deviceWithSameIp = peerConnections.find(
          conn => conn.peer_ip === selectedDevice.peer_ip
        );
        
        // Check if same device name exists but with different IP (device changed IP)
        const deviceWithSameName = peerConnections.find(
          conn => conn.peer_name === selectedDevice.peer_name && conn.peer_ip !== selectedDevice.peer_ip
        );
        
        if (deviceWithSameName) {
          // Device changed IP - update to new IP
          const oldIp = selectedDevice.peer_ip;
          const newIp = deviceWithSameName.peer_ip;
          console.log(`Device ${selectedDevice.peer_name} changed IP from ${oldIp} to ${newIp}`);
          toast.success(`Selected device "${selectedDevice.peer_name}" IP updated: ${oldIp} → ${newIp}`, {
            icon: '🔄',
            duration: 4000,
          });
          setSelectedDevice({
            peer_ip: newIp,
            peer_name: deviceWithSameName.peer_name
          });
        } else if (!deviceWithSameIp) {
          // Selected device IP not found in current connections
          // Check if any connection matches by name (same device, new IP)
          const matchingConnection = peerConnections.find(
            conn => conn.peer_name === selectedDevice.peer_name
          );
          
          if (matchingConnection) {
            // Same device with new IP - update
            const oldIp = selectedDevice.peer_ip;
            const newIp = matchingConnection.peer_ip;
            console.log(`Updating selected device IP from ${oldIp} to ${newIp}`);
            toast.success(`Selected device "${selectedDevice.peer_name}" IP updated: ${oldIp} → ${newIp}`, {
              icon: '🔄',
              duration: 4000,
            });
            setSelectedDevice({
              peer_ip: newIp,
              peer_name: matchingConnection.peer_name
            });
          } else {
            // Device completely disconnected - clear selection
            console.log(`Selected device ${selectedDevice.peer_name} (${selectedDevice.peer_ip}) no longer connected`);
            setSelectedDevice(null);
          }
        }
      }
      
      // Auto-select device if only one peer connection exists and none selected
      if (peerConnections.length === 1 && !selectedDevice) {
        // If only one peer connection, auto-select it
        const singleConnection = peerConnections[0];
        setSelectedDevice({ 
          peer_ip: singleConnection.peer_ip, 
          peer_name: singleConnection.peer_name 
        });
      } else if (peerConnections.length === 0) {
        // Clear selection if no peer connections
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

  // Poll for transfer progress (both sending and receiving)
  const pollTransferProgress = async () => {
    try {
      const localIp = status?.local_ip;
      if (!localIp) {
        console.log('⚠️ No local IP available for progress polling, status:', status);
        return;
      }
      
      console.log('🔄 Polling /transfer/progress for IP:', localIp);
      const response = await fetch(`http://localhost:8000/transfer/progress?local_ip=${localIp}`);
      if (!response.ok) {
        console.log('⚠️ Progress API response not OK:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      console.log('📊 Progress API response:', {
        sending: data.sending?.length || 0,
        receiving: data.receiving?.length || 0,
        receiving_data: data.receiving
      });
      
      // Debug logging
      if (data.receiving && data.receiving.length > 0) {
        console.log('📥 Frontend received receiving progress:', data.receiving[0]);
      } else {
        console.log('📥 No receiving transfers in API response');
        if (data.receiving) {
          console.log('   (receiving array exists but is empty)');
        } else {
          console.log('   (receiving field missing from response)');
        }
      }
      
      // Update sending progress
      if (data.sending && data.sending.length > 0) {
        const sendProgress = data.sending[0]; // Get most recent send
        // Only process active transfers (cancelled are filtered out by backend)
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
          setTransferStatus(`Sending... ${sendProgress.progress_percent?.toFixed(1) || 0}%`);
        }
      } else {
        // No active sending transfers - if we were sending, it might have completed or been cancelled
        // Don't reset state here if sending is true - let xhr handlers manage completion
        // But clear if we're not actually sending anymore
        if (!sending && transferProgress.isActive) {
          // Transfer finished (completed or cancelled outside of polling)
          setTransferProgress({
            isActive: false,
            progress: 0,
            bytesSent: 0,
            totalBytes: 0,
            speed: 0,
            elapsedTime: 0,
            estimatedTimeRemaining: 0
          });
          setCurrentTransferId(null);
        }
      }
      
      // Update receiving progress
      if (data.receiving && data.receiving.length > 0) {
        const recvProgress = data.receiving[0]; // Get most recent receive
        console.log('📥 Processing receiving progress:', {
          status: recvProgress.status,
          filename: recvProgress.filename,
          progress_percent: recvProgress.progress_percent,
          bytes_transferred: recvProgress.bytes_transferred
        });
        
        // Only process active transfers (cancelled are filtered out by backend)
        if (recvProgress.status === 'active') {
          console.log('✅ Setting receiving progress in UI');
          setCurrentReceivingTransferId(recvProgress.transfer_id);
          // Calculate elapsed time (start_time is in seconds since epoch from Python)
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
        } else {
          console.log('⚠️ Receiving transfer not active, status:', recvProgress.status);
        }
      } else {
        // No active receiving transfers - only clear if we definitely don't have any
        // Use a longer timeout to avoid clearing during brief polling gaps
        if (receivingProgress) {
          // Check if we're still polling and just haven't gotten an update yet
          // Only clear if we've been waiting for more than 2 seconds
          setTimeout(() => {
            // Double-check there's still no receiving progress before clearing
            // This prevents flickering during brief polling delays
            if (receivingProgress) {
              setReceivingProgress(null);
              setCurrentReceivingTransferId(null);
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Failed to poll transfer progress:', error);
    }
  };

  useEffect(() => {
    fetchDiscoveryData();
    fetchTransferHistory();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchDiscoveryData();
        fetchTransferHistory();
      }, 2000);
    }

    // Always poll for transfer progress (sending and receiving) regardless of autoRefresh
    // This ensures receiving progress is always visible
    const progressInterval = setInterval(() => {
      pollTransferProgress();
    }, 500); // Poll every 500ms for real-time updates

    return () => {
      if (interval) clearInterval(interval);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [autoRefresh,status]);

  // Show modal for new connection requests
  useEffect(() => {
    if (pendingRequests.length > 0 && !showRequestModal) {
      // Find the first request that hasn't been shown yet
      const unshownRequest = pendingRequests.find(
        req => !shownRequestIdsRef.current.has(req.request_id)
      );
      if (unshownRequest) {
        setCurrentRequest(unshownRequest);
        setShowRequestModal(true);
        shownRequestIdsRef.current.add(unshownRequest.request_id);
      }
    }
    
    // Clean up shownRequestIds for requests that are no longer pending
    const currentRequestIds = new Set(pendingRequests.map(r => r.request_id));
    // Remove IDs that are no longer in pending requests
    shownRequestIdsRef.current.forEach(id => {
      if (!currentRequestIds.has(id)) {
        shownRequestIdsRef.current.delete(id);
      }
    });
  }, [pendingRequests, showRequestModal]);

  const handleRequestConnection = async (peerIp, peerName) => {
    setRequesting({ ...requesting, [peerIp]: true });
    try {
      await requestConnection(peerIp);
      toast.success(`Connection requested to ${peerName}`, {
        icon: '🔗',
      });
      fetchDiscoveryData();
    } catch (error) {
      toast.error(`Failed to request connection: ${error.response?.data?.detail || error.message}`, {
        icon: '❌',
      });
    } finally {
      setRequesting({ ...requesting, [peerIp]: false });
    }
  };

  const handleAcceptRequest = async (requestId, fromName) => {
    try {
      await acceptConnection(requestId);
      toast.success(`Connected with ${fromName}!`, {
        icon: '✅',
      });
      // Close modal and reset
      setShowRequestModal(false);
      setCurrentRequest(null);
      // Refresh data
      setTimeout(() => {
        fetchDiscoveryData();
      }, 500);
    } catch (error) {
      toast.error(`Failed to accept connection: ${error.response?.data?.detail || error.message}`, {
        icon: '❌',
      });
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await rejectConnection(requestId);
      toast.success('Connection request rejected', {
        icon: '🚫',
      });
      // Close modal and reset
      setShowRequestModal(false);
      setCurrentRequest(null);
      // Refresh data
      setTimeout(() => {
        fetchDiscoveryData();
      }, 500);
    } catch (error) {
      toast.error(`Failed to reject connection: ${error.response?.data?.detail || error.message}`, {
        icon: '❌',
      });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setTransferStatus('');
      toast.success(`File selected: ${file.name}`, {
        icon: '📄',
        duration: 2000,
      });
    } else {
      setSelectedFile(null);
    }
  };

  const handleSend = () => {
    if (!selectedFile) {
      setTransferStatus('Please select a file first');
      return;
    }

    if (!selectedDevice) {
      setTransferStatus('Please select a connected device');
      return;
    }

    // Validate that selectedDevice is still in current connections
    const localIp = status?.local_ip;
    const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
    const isDeviceStillConnected = peerConnections.some(
      conn => conn.peer_ip === selectedDevice.peer_ip
    );
    
    // If IP not found, check if device name matches (device changed IP)
    let targetIp = selectedDevice.peer_ip;
    if (!isDeviceStillConnected) {
      const deviceWithSameName = peerConnections.find(
        conn => conn.peer_name === selectedDevice.peer_name
      );
      if (deviceWithSameName) {
        // Device changed IP - use new IP
        console.log(`⚠️ Selected device changed IP. Updating from ${selectedDevice.peer_ip} to ${deviceWithSameName.peer_ip}`);
        targetIp = deviceWithSameName.peer_ip;
        setSelectedDevice({
          peer_ip: deviceWithSameName.peer_ip,
          peer_name: deviceWithSameName.peer_name
        });
      } else {
        // Device not found at all
        setTransferStatus('Selected device is no longer connected');
        toast.error('Selected device is no longer connected. Please select a device again.', {
          icon: '❌',
        });
        setSelectedDevice(null);
        return;
      }
    }

    // Clear any previous transfer state before starting new transfer
    setTransferStatus(''); // Clear status first
    setCurrentTransferId(null); // Clear previous transfer ID
    setSending(true);
    
    // Initialize progress tracking
    const fileSize = selectedFile.size;
    const startTime = Date.now();
    let lastUpdateTime = startTime;
    let lastBytesSent = 0;
    
    setTransferProgress({
      isActive: true,
      progress: 0,
      bytesSent: 0,
      totalBytes: fileSize,
      speed: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0
    });
    
    // Set status after clearing old state
    setTimeout(() => {
      setTransferStatus('Preparing to send file...');
    }, 50);

    // Start polling for real transfer progress
    progressPollInterval.current = setInterval(pollTransferProgress, 500); // Poll every 500ms

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('target_ip', targetIp);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      // Track upload progress (fallback - backend polling will override this for actual TCP transfer)
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          // Only show upload progress if we don't have backend progress yet
          // The backend polling will update with real TCP transfer progress
          const now = Date.now();
          const bytesSent = e.loaded;
          const totalBytes = e.total;
          const progress = (bytesSent / totalBytes) * 100;
          
          // Show upload progress only briefly - this is browser uploading to FastAPI
          // FastAPI then streams directly to TCP, so this phase is quick for small-medium files
          // For very large files, this shows the initial HTTP upload progress
          if (progress < 100 && progress < 5) {
            // Only show "uploading to server" during initial phase (< 5%)
            // After that, backend streaming takes over
            setTransferStatus(`Preparing... ${progress.toFixed(1)}%`);
          }
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            const finalDuration = (Date.now() - startTime) / 1000;
            
            setTransferProgress({
              isActive: false,
              progress: 100,
              bytesSent: fileSize,
              totalBytes: fileSize,
              speed: 0,
              elapsedTime: finalDuration,
              estimatedTimeRemaining: 0
            });
            
            // Stop polling
            if (progressPollInterval.current) {
              clearInterval(progressPollInterval.current);
              progressPollInterval.current = null;
            }
            
            toast.success(`File sent to ${selectedDevice.peer_name}! (${result.duration_seconds}s)`, {
              icon: '📤',
            });
            setTransferStatus(`✓ Success! File sent to ${selectedDevice.peer_name}. Duration: ${result.duration_seconds}s`);
            setSending(false);
            setSelectedFile(null);
            setSelectedDevice(null);
            
            // Reset file input
            const fileInput = document.getElementById('file-input');
            if (fileInput) {
              fileInput.value = '';
            }
            
            // Clear progress after 3 seconds
            setTimeout(() => {
              setTransferProgress({
                isActive: false,
                progress: 0,
                bytesSent: 0,
                totalBytes: 0,
                speed: 0,
                elapsedTime: 0,
                estimatedTimeRemaining: 0
              });
              setTransferStatus('');
            }, 3000);
            
            setTimeout(() => {
              fetchDiscoveryData();
              fetchTransferHistory();
            }, 1000);
          } catch (e) {
            // Reset everything on parse error
            setTransferProgress({
              isActive: false,
              progress: 0,
              bytesSent: 0,
              totalBytes: 0,
              speed: 0,
              elapsedTime: 0,
              estimatedTimeRemaining: 0
            });
            const errorMsg = 'Failed to parse server response';
            setTransferStatus(`✗ Error: ${errorMsg}`);
            toast.error(errorMsg, {
              icon: '❌',
            });
            setSending(false);
            
            // Stop polling
            if (progressPollInterval.current) {
              clearInterval(progressPollInterval.current);
              progressPollInterval.current = null;
            }
            
            // Auto-clear error message after 5 seconds
            setTimeout(() => {
              setTransferStatus('');
            }, 5000);
          }
        } else {
          // Handle HTTP error responses
          setTransferProgress({
            isActive: false,
            progress: 0,
            bytesSent: 0,
            totalBytes: 0,
            speed: 0,
            elapsedTime: 0,
            estimatedTimeRemaining: 0
          });
          
          let errorMsg = `HTTP ${xhr.status}: Failed to send file`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMsg = errorData.detail || errorMsg;
          } catch (e) {
            // Use default error message if parsing fails
          }
          
          setTransferStatus(`✗ Error: ${errorMsg}`);
          toast.error(errorMsg, {
            icon: '❌',
          });
          setSending(false);
          
          // Auto-clear error message after 5 seconds
          setTimeout(() => {
            setTransferStatus('');
          }, 5000);
        }
      });

      // Handle network errors
      xhr.addEventListener('error', () => {
        // Stop polling
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        setTransferProgress({
          isActive: false,
          progress: 0,
          bytesSent: 0,
          totalBytes: 0,
          speed: 0,
          elapsedTime: 0,
          estimatedTimeRemaining: 0
        });
        const errorMsg = 'Network error: Failed to send file';
        setTransferStatus(`✗ Error: ${errorMsg}`);
        toast.error(errorMsg, {
          icon: '❌',
        });
        setSending(false);
        
        // Auto-clear error message after 5 seconds
        setTimeout(() => {
          setTransferStatus('');
        }, 5000);
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        // Stop polling
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        setTransferProgress({
          isActive: false,
          progress: 0,
          bytesSent: 0,
          totalBytes: 0,
          speed: 0,
          elapsedTime: 0,
          estimatedTimeRemaining: 0
        });
        setTransferStatus('Transfer cancelled');
        setSending(false);
        
        // Auto-clear message after 3 seconds
        setTimeout(() => {
          setTransferStatus('');
        }, 3000);
      });

      // Handle timeout
      xhr.timeout = 300000; // 5 minutes timeout for large files
      xhr.addEventListener('timeout', () => {
        // Stop polling
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        setTransferProgress({
          isActive: false,
          progress: 0,
          bytesSent: 0,
          totalBytes: 0,
          speed: 0,
          elapsedTime: 0,
          estimatedTimeRemaining: 0
        });
        const errorMsg = 'Transfer timeout: Request took too long';
        setTransferStatus(`✗ Error: ${errorMsg}`);
        toast.error(errorMsg, {
          icon: '❌',
        });
        setSending(false);
        
        // Auto-clear error message after 5 seconds
        setTimeout(() => {
          setTransferStatus('');
        }, 5000);
      });

      // Send request
      xhr.open('POST', 'http://localhost:8000/transfer/send');
      xhr.send(formData);
      
    } catch (error) {
      setTransferProgress({
        isActive: false,
        progress: 0,
        bytesSent: 0,
        totalBytes: 0,
        speed: 0,
        elapsedTime: 0,
        estimatedTimeRemaining: 0
      });
      const errorMsg = error.message || 'Failed to send file';
      setTransferStatus(`✗ Error: ${errorMsg}`);
      toast.error(errorMsg, {
        icon: '❌',
      });
      setSending(false);
      
      // Auto-clear error message after 5 seconds
      setTimeout(() => {
        setTransferStatus('');
      }, 5000);
    }
  };

  const handleDisconnect = async (peerIp, peerName) => {
    try {
      await disconnect(peerIp);
      toast.success(`Disconnected from ${peerName}`, {
        icon: '🔌',
      });
      // Clear selection if we disconnected the selected device
      if (selectedDevice?.peer_ip === peerIp) {
        setSelectedDevice(null);
      }
      fetchDiscoveryData();
    } catch (error) {
      toast.error(`Failed to disconnect: ${error.response?.data?.detail || error.message}`, {
        icon: '❌',
      });
    }
  };

  const handleCancelTransfer = async (transferId, isReceiving = false) => {
    if (!transferId) return;
    
    try {
      const response = await fetch('http://localhost:8000/transfer/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transfer_id: transferId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to cancel transfer');
      }
      
      if (isReceiving) {
        setReceivingProgress(null);
        setCurrentReceivingTransferId(null);
        toast.success('File receive cancelled', { icon: '🚫' });
      } else {
        // Cancel XHR if sending - clear all state immediately
        setTransferProgress({
          isActive: false,
          progress: 0,
          bytesSent: 0,
          totalBytes: 0,
          speed: 0,
          elapsedTime: 0,
          estimatedTimeRemaining: 0
        });
        setTransferStatus(''); // Clear status instead of showing "cancelled"
        setSending(false);
        setCurrentTransferId(null);
        toast.success('File send cancelled', { icon: '🚫' });
        
        // Stop progress polling
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
      }
    } catch (error) {
      toast.error(`Failed to cancel transfer: ${error.message}`, {
        icon: '❌',
      });
    }
  };

  const handleToggleDiscovery = async () => {
    try {
      if (isDiscovering) {
        await stopDiscovery();
        setIsDiscovering(false);
        toast.success('Discovery stopped', { icon: '⏹️' });
      } else {
        await startDiscovery();
        setIsDiscovering(true);
        toast.success('Discovery started', { icon: '🔍' });
      }
      fetchDiscoveryData();
    } catch (error) {
      toast.error(`Failed to ${isDiscovering ? 'stop' : 'start'} discovery: ${error.response?.data?.detail || error.message}`, {
        icon: '❌',
      });
    }
  };

  // Calculate device positions around the wave
  const getDevicePosition = (index, total) => {
    const angle = (360 / total) * index - 90; // Start from top
    const radius = 280; // Distance from center
    const radian = (angle * Math.PI) / 180;
    const x = Math.cos(radian) * radius;
    const y = Math.sin(radian) * radius;
    return {
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: 'translate(-50%, -50%)'
    };
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Never';
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);
      
      if (diff < 5) return 'Just now';
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return date.toLocaleTimeString();
    } catch {
      return timeString;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <motion.div 
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold dark:text-white text-black mb-3">
            Device Discovery & Transfer
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400">
            Connect to devices and transfer files seamlessly
          </p>
        </motion.div>

        {/* Status Card */}
        {status && (
          <motion.div 
            className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-600 dark:text-neutral-400">Device:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{status.device_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-600 dark:text-neutral-400">IP:</span>
                  <span className="font-semibold font-mono text-neutral-900 dark:text-white">{status.local_ip}</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  status.status === 'active' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                }`}>
                  {status.status === 'active' ? '● Active' : '○ Inactive'}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span>Auto-refresh</span>
              </label>
            </div>
          </motion.div>
        )}

        {/* Connection Request Modal */}
        {showRequestModal && currentRequest && (
          <ConnectionRequestModal
            request={currentRequest}
            onAccept={(requestId) => handleAcceptRequest(requestId, currentRequest.from_name)}
            onReject={handleRejectRequest}
            onClose={() => {
              setShowRequestModal(false);
              setCurrentRequest(null);
            }}
          />
        )}

        {/* Pending Connection Requests List (collapsed view) */}
        {pendingRequests.length > 0 && !showRequestModal && (
          <motion.div 
            className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">🔔 Pending Connection Requests</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">{pendingRequests.length} request(s) waiting</p>
              </div>
              <button
                onClick={() => {
                  setCurrentRequest(pendingRequests[0]);
                  setShowRequestModal(true);
                }}
                className="px-4 py-2 bg-yellow-500 dark:bg-yellow-600 text-white rounded-lg hover:bg-yellow-600 dark:hover:bg-yellow-700 text-sm font-medium transition-colors"
              >
                View Requests
              </button>
            </div>
          </motion.div>
        )}

        {/* Wave Animation Discovery Section */}
        <motion.div 
          className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-8 mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Device Discovery</h2>
            <button
              onClick={handleToggleDiscovery}
              className={`px-6 py-3 rounded-lg font-semibold transition-all shadow-lg ${
                isDiscovering
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                  : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
              }`}
            >
              {isDiscovering ? (
                <>
                  <span className="mr-2">⏹️</span>
                  Stop Discovery
                </>
              ) : (
                <>
                  <span className="mr-2">🔍</span>
                  Start Discovery
                </>
              )}
            </button>
          </div>

          <div className={`discovery-container ${isDiscovering ? 'discovering' : ''}`}>
            <div className="wave-animation">
              {/* Wave rings - only show when discovering */}
              {isDiscovering && (
                <>
                  <div className="wave wave-1"></div>
                  <div className="wave wave-2"></div>
                  <div className="wave wave-3"></div>
                  <div className="wave wave-4"></div>
                  <div className="wave wave-5"></div>
                </>
              )}
              
              {/* Center button */}
              <div className="wave-center">
                <div className="wave-center-icon">
                  {isDiscovering ? '📡' : '🔍'}
                </div>
              </div>

              {/* Discovered devices positioned around the wave */}
              {peers.length > 0 && (
                <div className="discovered-devices">
                  {peers.map((peer, index) => {
                    const isConnected = connectionStatuses[peer.ip] || connections.some(c => c.peer_ip === peer.ip);
                    const isRequesting = requesting[peer.ip] || false;
                    const position = getDevicePosition(index, peers.length);
                    
                    return (
                      <div
                        key={peer.ip || index}
                        className={`device-icon ${isConnected ? 'connected' : ''}`}
                        style={position}
                        onClick={() => {
                          if (!isConnected && !isRequesting) {
                            handleRequestConnection(peer.ip, peer.device_name);
                          }
                        }}
                        title={
                          isConnected 
                            ? `Connected to ${peer.device_name}` 
                            : `Click to connect to ${peer.device_name}`
                        }
                      >
                        <div className="device-icon-icon">
                          {isConnected ? '✅' : '💻'}
                        </div>
                        <div className="device-icon-name">
                          {peer.device_name || 'Unknown'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Empty state when no discovery */}
            {!isDiscovering && peers.length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">Ready to discover devices</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm">Click "Start Discovery" to begin searching for devices on your network</p>
              </div>
            )}

            {/* Empty state when discovering but no devices found */}
            {isDiscovering && peers.length === 0 && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">Discovering devices...</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm">Make sure other devices are running CrossDrop</p>
              </div>
            )}
          </div>

          {/* Device count indicator */}
          {peers.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {peers.length} device{peers.length !== 1 ? 's' : ''} discovered
                {connections.length > 0 && (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    • {connections.length} connected
                  </span>
                )}
              </p>
            </div>
          )}
        </motion.div>

        {/* Connected Devices Section - Show connected devices with Select/Disconnect buttons */}
        {connections.length > 0 && (() => {
          // Filter out local device from connections list
          const localIp = status?.local_ip;
          const localDeviceName = status?.device_name;
          
          // Filter by both IP and device name to be safe
          const peerConnections = connections.filter(conn => {
            const isLocalIp = conn.peer_ip === localIp;
            const isLocalDevice = conn.peer_name === localDeviceName || 
                                  conn.peer_name?.includes(status?.device_name?.split('.')[0] || '');
            return !isLocalIp && !isLocalDevice;
          });
          
          // Debug logging (remove in production)
          if (connections.length > 0 && localIp) {
            console.log('Local IP:', localIp, 'Local Device:', localDeviceName);
            console.log('All connections:', connections);
            console.log('Filtered peer connections:', peerConnections);
          }
          
          if (peerConnections.length === 0) return null;
          
          return (
            <motion.div 
              className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-6 mb-8"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">🔗 Connected Devices</h2>
              
              <div className="space-y-3">
                {peerConnections.map((conn) => {
                  const peer = peers.find(p => p.ip === conn.peer_ip);
                  const isSelected = selectedDevice?.peer_ip === conn.peer_ip;
                
                return (
                  <div
                    key={conn.peer_ip}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-green-300 bg-green-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800">
                            {conn.peer_name || peer?.device_name || 'Unknown Device'}
                            {isSelected && (
                              <span className="ml-2 text-xs text-blue-600 font-normal">(Selected)</span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600 font-mono">{conn.peer_ip}</p>
                          <p className="text-xs text-gray-500">
                            Connected: {formatTime(conn.connected_at)}
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                          ✓ Connected
                        </span>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {/* Only show Select button if multiple peer connections exist */}
                        {peerConnections.length > 1 && (
                          <button
                            onClick={() => {
                              const deviceToSelect = { 
                                peer_ip: conn.peer_ip, 
                                peer_name: conn.peer_name || peer?.device_name || 'Unknown Device'
                              };
                              setSelectedDevice(isSelected ? null : deviceToSelect);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                              isSelected
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDisconnect(conn.peer_ip, conn.peer_name || peer?.device_name || 'Unknown Device')}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                          title="Disconnect from this device"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </motion.div>
          );
        })()}

        {/* File Transfer Section - Only show if connected to peers (excluding self) */}
        {(() => {
          const localIp = status?.local_ip;
          const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
          if (peerConnections.length === 0) return null;
          
          return (
            <>
              <motion.div 
                className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-6 mb-8"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">📤 Send File</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select File</label>
                  <input
                    type="file"
                    id="file-input"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100 dark:file:bg-neutral-800 dark:file:text-blue-400"
                  />
                  {selectedFile ? (
                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-gray-700 dark:text-gray-300"><strong>✓ File selected:</strong> {selectedFile.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400"><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
                    </div>
                  ) : (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg">
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No file selected</p>
                    </div>
                  )}
                </div>

                {selectedDevice && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Sending to:</strong> {selectedDevice.peer_name} ({selectedDevice.peer_ip})
                      {(() => {
                        const localIp = status?.local_ip;
                        const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
                        return peerConnections.length === 1;
                      })() && (
                        <span className="ml-2 text-xs text-blue-600">(Auto-selected)</span>
                      )}
                    </p>
                  </div>
                )}
                {(() => {
                  const localIp = status?.local_ip;
                  const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
                  return peerConnections.length > 1 && !selectedDevice && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        <strong>⚠️ Select a device:</strong> You have {peerConnections.length} connected devices. Please select one to send files.
                      </p>
                    </div>
                  );
                })()}

                <button
                  onClick={handleSend}
                  disabled={!selectedFile || !selectedDevice || sending}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all font-semibold shadow-lg"
                  title={!selectedFile ? 'Please select a file first' : !selectedDevice ? 'Please select a device first' : ''}
                >
                  {sending ? 'Sending...' : !selectedFile ? 'Select File First' : !selectedDevice ? 'Select Device First' : 'Send File'}
                </button>

                {/* Progress Indicator */}
                {transferProgress.isActive && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        {transferStatus || 'Transferring...'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          {transferProgress.progress.toFixed(1)}%
                        </span>
                        {currentTransferId && (
                          <button
                            onClick={() => handleCancelTransfer(currentTransferId, false)}
                            className="p-1 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                            title="Cancel transfer"
                          >
                            <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 mb-3 overflow-hidden">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${transferProgress.progress}%` }}
                      />
                    </div>
                    
                    {/* Speed and Time Info */}
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Speed</p>
                        <p className="text-blue-700 dark:text-blue-300 font-semibold">
                          {transferProgress.speed > 0
                            ? `${transferProgress.speed.toFixed(2)} MB/s`
                            : 'Calculating...'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Transferred</p>
                        <p className="text-blue-700 dark:text-blue-300 font-semibold">
                          {formatFileSize(transferProgress.bytesSent)} / {formatFileSize(transferProgress.totalBytes)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">
                          {transferProgress.estimatedTimeRemaining > 0 ? 'ETA' : 'Elapsed'}
                        </p>
                        <p className="text-blue-700 dark:text-blue-300 font-semibold">
                          {transferProgress.estimatedTimeRemaining > 0
                            ? `${Math.ceil(transferProgress.estimatedTimeRemaining)}s`
                            : `${Math.ceil(transferProgress.elapsedTime)}s`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Receiving Progress Indicator */}
                {receivingProgress && (
                  <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                        📥 Receiving: {receivingProgress.filename}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                          {receivingProgress.progress.toFixed(1)}%
                        </span>
                        {receivingProgress.transferId && (
                          <button
                            onClick={() => handleCancelTransfer(receivingProgress.transferId, true)}
                            className="p-1 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                            title="Cancel transfer"
                          >
                            <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-3 mb-3 overflow-hidden">
                      <div
                        className="bg-purple-600 dark:bg-purple-500 h-3 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${receivingProgress.progress}%` }}
                      />
                    </div>
                    
                    {/* Speed and Progress Info */}
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Speed</p>
                        <p className="text-purple-700 dark:text-purple-300 font-semibold">
                          {receivingProgress.speed > 0
                            ? `${receivingProgress.speed.toFixed(2)} MB/s`
                            : 'Calculating...'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Received</p>
                        <p className="text-purple-700 dark:text-purple-300 font-semibold">
                          {formatFileSize(receivingProgress.bytesReceived)} / {formatFileSize(receivingProgress.totalBytes)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">
                          {receivingProgress.estimatedTimeRemaining > 0 ? 'ETA' : 'Elapsed'}
                        </p>
                        <p className="text-purple-700 dark:text-purple-300 font-semibold">
                          {receivingProgress.estimatedTimeRemaining > 0
                            ? `${Math.ceil(receivingProgress.estimatedTimeRemaining)}s`
                            : `${Math.ceil(receivingProgress.elapsedTime || 0)}s`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Status Message */}
                {transferStatus && !transferProgress.isActive && (
                  <div className={`mt-4 p-4 rounded-lg ${
                    transferStatus.includes('Error') || transferStatus.includes('Please')
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {transferStatus}
                  </div>
                  )}
                </div>
              </motion.div>

            {/* Transfer History */}
            <motion.div 
              className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">📋 Transfer History</h2>
              
              {transferHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No transfers yet</p>
              ) : (
                <div className="space-y-2">
                  {transferHistory.slice().reverse().slice(0, 10).map((transfer, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        transfer.status === 'success'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">{transfer.filename}</p>
                          <p className="text-sm text-gray-600">
                            {transfer.sender_ip} → {transfer.receiver_ip}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(transfer.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-700">
                            {formatFileSize(transfer.file_size)}
                          </p>
                          {transfer.status === 'success' && (
                            <p className="text-xs text-gray-600">{transfer.duration_seconds}s</p>
                          )}
                          <span className={`text-xs px-2 py-1 rounded ${
                            transfer.status === 'success'
                              ? 'bg-green-200 text-green-800'
                              : 'bg-red-200 text-red-800'
                          }`}>
                            {transfer.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
            </>
          );
        })()}

        {/* Info when no connections */}
        {(() => {
          const localIp = status?.local_ip;
          const peerConnections = connections.filter(conn => conn.peer_ip !== localIp);
          return peerConnections.length === 0 && peers.length > 0;
        })() && (
          <motion.div 
            className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-sm text-blue-800 dark:text-blue-300">
              💡 <strong>Tip:</strong> Connect to a device above to start transferring files!
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default DeviceTransfer;

