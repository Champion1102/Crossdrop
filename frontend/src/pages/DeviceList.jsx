import { useState, useEffect } from 'react';
import { getDiscoveredPeers, getDiscoveryStatus, requestConnection, getConnectionStatus, getPendingRequests, acceptConnection, rejectConnection } from '../api/backend';

const DeviceList = () => {
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [connectionStatuses, setConnectionStatuses] = useState({});
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requesting, setRequesting] = useState({});

  const fetchData = async () => {
    try {
      const [peersData, statusData, pendingData] = await Promise.all([
        getDiscoveredPeers(),
        getDiscoveryStatus(),
        getPendingRequests(),
      ]);
      
      setPeers(peersData.peers || []);
      setStatus(statusData);
      setPendingRequests(pendingData.pending_requests || []);
      setLastUpdate(new Date());

      // Check connection status for each peer
      const statusPromises = (peersData.peers || []).map(async (peer) => {
        try {
          const connStatus = await getConnectionStatus(peer.ip);
          return { ip: peer.ip, ...connStatus };
        } catch {
          return { ip: peer.ip, connected: false };
        }
      });
      const statuses = await Promise.all(statusPromises);
      const statusMap = {};
      statuses.forEach(s => {
        statusMap[s.ip] = s.connected;
      });
      setConnectionStatuses(statusMap);
    } catch (error) {
      console.error('Failed to fetch discovery data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData();
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const handleRequestConnection = async (peerIp, peerName) => {
    setRequesting({ ...requesting, [peerIp]: true });
    try {
      await requestConnection(peerIp);
      alert(`Connection requested to ${peerName}`);
      fetchData();
    } catch (error) {
      alert(`Failed to request connection: ${error.response?.data?.detail || error.message}`);
    } finally {
      setRequesting({ ...requesting, [peerIp]: false });
    }
  };

  const handleAcceptRequest = async (requestId, fromName) => {
    try {
      await acceptConnection(requestId);
      alert(`Connection accepted with ${fromName}`);
      fetchData();
    } catch (error) {
      alert(`Failed to accept connection: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await rejectConnection(requestId);
      fetchData();
    } catch (error) {
      alert(`Failed to reject connection: ${error.response?.data?.detail || error.message}`);
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6 md:p-8">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Device Discovery
        </h1>
          <p className="text-gray-600">
            Discover devices on your local network (LAN)
          </p>
        </div>

        {/* Status Card */}
        {status && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Discovery Status</h2>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                status.status === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {status.status === 'active' ? '● Active' : '○ Inactive'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Device Name:</span>
                <p className="font-semibold text-gray-800">{status.device_name || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-600">Local IP:</span>
                <p className="font-semibold text-gray-800">{status.local_ip || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-600">Scanning:</span>
                <p className="font-semibold text-gray-800">
                  {status.scanning ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Last Update:</span>
                <p className="font-semibold text-gray-800">
                  {lastUpdate.toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Connection Requests */}
        {pendingRequests.length > 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-3">Pending Connection Requests</h3>
            {pendingRequests.map((request) => (
              <div key={request.request_id} className="bg-white rounded p-3 mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{request.from_name}</p>
                  <p className="text-sm text-gray-600">{request.from_ip}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.request_id, request.from_name)}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.request_id)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Auto-refresh (2s)</span>
            </label>
          </div>
        <button
            onClick={fetchData}
          disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
            {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
        </div>

        {/* Peers List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Discovered Devices</h2>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {peers.length} {peers.length === 1 ? 'device' : 'devices'}
            </span>
          </div>

          {loading && peers.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-600">Discovering devices...</p>
            </div>
          ) : peers.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-gray-600 text-lg mb-2">No devices discovered yet</p>
              <p className="text-gray-500 text-sm">
                Make sure other devices are running CrossDrop on the same network
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Discovery broadcasts every 2 seconds automatically
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {peers.map((peer, index) => {
                const isConnected = connectionStatuses[peer.ip] || false;
                const isRequesting = requesting[peer.ip] || false;
                
                return (
                  <div
                    key={peer.ip || index}
                    className={`p-4 border-2 rounded-lg hover:shadow-md transition-all bg-gradient-to-r from-white to-gray-50 ${
                      isConnected 
                        ? 'border-green-300 bg-green-50' 
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full ${
                            isConnected ? 'bg-green-500' : 'bg-green-500 animate-pulse'
                          }`}></div>
                          <h3 className="font-semibold text-lg text-gray-800">
                            {peer.device_name || 'Unknown Device'}
                          </h3>
                          {isConnected && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                              Connected
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 ml-5">
                          <div>
                            <span className="font-medium">IP Address:</span>{' '}
                            <span className="font-mono text-gray-800">{peer.ip || 'Unknown'}</span>
                          </div>
                          <div>
                            <span className="font-medium">Last Seen:</span>{' '}
                            <span className="text-gray-800">{formatTime(peer.last_seen)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 flex gap-2">
                        {!isConnected ? (
                          <button
                            onClick={() => handleRequestConnection(peer.ip, peer.device_name)}
                            disabled={isRequesting}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:bg-gray-400"
                          >
                            {isRequesting ? 'Requesting...' : 'Connect'}
                          </button>
                        ) : (
                          <button
                            disabled
                            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm cursor-not-allowed"
                          >
                            Connected
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ How it works:</strong> CrossDrop uses UDP broadcast to discover devices on your local network. 
            Click "Connect" on a device to request a connection. Once connected, you can transfer files between devices.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeviceList;
