import { useState, useEffect } from 'react';
import { getConnections, sendFileToDevice, getTransferHistory, disconnect } from '../api/backend';
import config from '../config';

const FileTransfer = () => {
  const [connections, setConnections] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [transferStatus, setTransferStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [transferHistory, setTransferHistory] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchConnections = async () => {
    try {
      const [connData, historyData] = await Promise.all([
        getConnections(),
        getTransferHistory(),
      ]);
      
      setConnections(connData.connections || []);
      setTransferHistory(historyData.transfers || []);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchConnections();
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
    setSelectedFile(file);
    setTransferStatus('');
    }
  };

  const handleSend = async () => {
    if (!selectedFile) {
      setTransferStatus('Please select a file first');
      return;
    }

    if (!selectedDevice) {
      setTransferStatus('Please select a connected device');
      return;
    }

    setSending(true);
    setTransferStatus('Uploading file to server...');

    try {
      // First, upload the file to backend temp location
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('target_ip', selectedDevice.peer_ip);

      // Upload and send file in one step
      const uploadResponse = await fetch(`${config.API_BASE_URL}/transfer/send`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.detail || 'Failed to send file');
      }

      const result = await uploadResponse.json();
      
      setTransferStatus(`✓ Success! File sent to ${selectedDevice.peer_name}. Duration: ${result.duration_seconds}s`);
      setSelectedFile(null);
      setSelectedDevice(null);
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      
      // Refresh connections and history after a short delay
      setTimeout(() => {
        fetchConnections();
      }, 1000);
    } catch (error) {
      setTransferStatus(`✗ Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleDisconnect = async (peerIp, peerName) => {
    if (window.confirm(`Disconnect from ${peerName}?`)) {
      try {
        await disconnect(peerIp);
        fetchConnections();
      } catch (error) {
        alert(`Failed to disconnect: ${error.response?.data?.detail || error.message}`);
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Unknown';
    try {
      return new Date(timeString).toLocaleString();
    } catch {
      return timeString;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6 md:p-8">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">File Transfer</h1>
        <p className="text-gray-600 mb-6">
          Send files to connected devices
        </p>

        {/* Connected Devices */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Connected Devices</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Auto-refresh</span>
            </label>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🔗</div>
              <p className="text-gray-600 text-lg mb-2">No connected devices</p>
              <p className="text-gray-500 text-sm">
                Go to <strong>Devices</strong> page to discover and connect to devices
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.peer_ip}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    selectedDevice?.peer_ip === conn.peer_ip
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <h3 className="font-semibold text-gray-800">{conn.peer_name}</h3>
                        <p className="text-sm text-gray-600 font-mono">{conn.peer_ip}</p>
                        <p className="text-xs text-gray-500">
                          Connected: {formatTime(conn.connected_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedDevice(conn)}
                        className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                          selectedDevice?.peer_ip === conn.peer_ip
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {selectedDevice?.peer_ip === conn.peer_ip ? 'Selected' : 'Select'}
                      </button>
                      <button
                        onClick={() => handleDisconnect(conn.peer_ip, conn.peer_name)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File Selection and Send */}
        {connections.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Send File</h2>
            
            <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File
            </label>
            <input
              type="file"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            {selectedFile && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>File:</strong> {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Size:</strong> {formatFileSize(selectedFile.size)}
              </p>
                  </div>
            )}
          </div>

              {selectedDevice && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Sending to:</strong> {selectedDevice.peer_name} ({selectedDevice.peer_ip})
                  </p>
                </div>
              )}

            <button
              onClick={handleSend}
                disabled={!selectedFile || !selectedDevice || sending}
                className="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
            >
                {sending ? 'Sending...' : 'Send File'}
            </button>

          {transferStatus && (
                <div className={`p-4 rounded-lg ${
              transferStatus.includes('Error') || transferStatus.includes('Please')
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {transferStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transfer History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Transfer History</h2>
          
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
                        {formatTime(transfer.timestamp)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">
                        {formatFileSize(transfer.file_size)}
                      </p>
                      {transfer.status === 'success' && (
                        <p className="text-xs text-gray-600">
                          {transfer.duration_seconds}s
                        </p>
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
        </div>
      </div>
    </div>
  );
};

export default FileTransfer;
