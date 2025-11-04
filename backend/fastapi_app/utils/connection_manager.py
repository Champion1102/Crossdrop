"""
Connection manager for managing device connections
"""
import threading
from typing import Dict, Optional, Set
from datetime import datetime
from utils.logger import get_logger

logger = get_logger("connection_manager")


class ConnectionManager:
    """Manages connections between devices"""
    
    def __init__(self):
        self.connections: Dict[str, Dict] = {}  # peer_ip -> connection info
        self.pending_requests: Dict[str, Dict] = {}  # request_id -> request info
        self.lock = threading.Lock()
        self.request_counter = 0
    
    def request_connection(self, from_ip: str, from_name: str, to_ip: str, to_name: str) -> str:
        """
        Create a connection request
        
        Returns:
            request_id: Unique ID for this request
        """
        with self.lock:
            self.request_counter += 1
            request_id = f"req_{self.request_counter}_{datetime.now().timestamp()}"
            
            self.pending_requests[request_id] = {
                "request_id": request_id,
                "from_ip": from_ip,
                "from_name": from_name,
                "to_ip": to_ip,
                "to_name": to_name,
                "status": "pending",
                "created_at": datetime.now().isoformat()
            }
            
            return request_id
    
    def accept_connection(self, request_id: str, from_ip: str, to_ip: str) -> bool:
        """Accept a connection request
        
        Args:
            request_id: The connection request ID
            from_ip: IP of the device that requested the connection (the peer)
            to_ip: IP of this device (local IP - should NOT be stored)
        """
        with self.lock:
            if request_id not in self.pending_requests:
                return False
            
            request = self.pending_requests[request_id]
            if request["status"] != "pending":
                return False
            
            # Update request status
            request["status"] = "accepted"
            request["accepted_at"] = datetime.now().isoformat()
            
            # Only store the peer's connection (from_ip), not our own IP (to_ip)
            # Each device should only track connections TO other devices, not to itself
            self.connections[from_ip] = {
                "peer_ip": from_ip,
                "peer_name": request["from_name"],
                "connected_at": datetime.now().isoformat(),
                "status": "connected"
            }
            
            return True
    
    def reject_connection(self, request_id: str) -> bool:
        """Reject a connection request"""
        with self.lock:
            if request_id not in self.pending_requests:
                return False
            
            self.pending_requests[request_id]["status"] = "rejected"
            self.pending_requests[request_id]["rejected_at"] = datetime.now().isoformat()
            return True
    
    def disconnect(self, peer_ip: str):
        """Disconnect from a peer"""
        with self.lock:
            if peer_ip in self.connections:
                del self.connections[peer_ip]
    
    def is_connected(self, peer_ip: str) -> bool:
        """Check if connected to a peer"""
        with self.lock:
            return peer_ip in self.connections and self.connections[peer_ip]["status"] == "connected"
    
    def get_connections(self, exclude_ip: str = None) -> list:
        """Get list of all connected peers
        
        Args:
            exclude_ip: Optional IP address to exclude from results (e.g., local IP)
        """
        with self.lock:
            return [
                {
                    "peer_ip": info["peer_ip"],
                    "peer_name": info["peer_name"],
                    "connected_at": info["connected_at"]
                }
                for ip, info in self.connections.items()
                if info["status"] == "connected" and (exclude_ip is None or info["peer_ip"] != exclude_ip)
            ]
    
    def get_pending_requests_for(self, ip: str) -> list:
        """Get pending requests for a specific IP"""
        with self.lock:
            all_requests = list(self.pending_requests.values())
            pending = [
                request
                for request in all_requests
                if request["to_ip"] == ip and request["status"] == "pending"
            ]
            logger.debug(f"get_pending_requests_for({ip}): Found {len(pending)} pending out of {len(all_requests)} total requests")
            if len(all_requests) > 0:
                logger.debug(f"  All requests: {[(r['request_id'], r['to_ip'], r['status']) for r in all_requests]}")
            return pending
    
    def get_request(self, request_id: str) -> Optional[Dict]:
        """Get a specific request"""
        with self.lock:
            return self.pending_requests.get(request_id)

