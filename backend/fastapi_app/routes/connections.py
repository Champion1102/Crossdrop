"""
Connection management routes for device connections
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import traceback

from utils.connection_manager import ConnectionManager
from utils.discovery_service import DiscoveryService
from utils.network_utils import get_local_ip
from utils.logger import get_logger
from datetime import datetime

logger = get_logger("connections")

# Global instances (will be set by main.py)
connection_manager: ConnectionManager = None
discovery_service: DiscoveryService = None


def set_connection_manager(manager: ConnectionManager):
    """Set the connection manager instance"""
    global connection_manager
    connection_manager = manager


def set_discovery_service_for_connections(service: DiscoveryService):
    """Set the discovery service instance"""
    global discovery_service
    discovery_service = service


router = APIRouter(prefix="/connections", tags=["connections"])


class ConnectionRequest(BaseModel):
    peer_ip: str


class AcceptRequest(BaseModel):
    request_id: str


class RejectRequest(BaseModel):
    request_id: str


class IncomingRequest(BaseModel):
    request_id: str
    from_ip: str
    from_name: str
    to_ip: str
    to_name: str
    created_at: Optional[str] = None


@router.post("/request")
async def request_connection(request: ConnectionRequest):
    """Request a connection to a peer device"""
    logger.info(f"📤 Connection request received for peer: {request.peer_ip}")
    
    if connection_manager is None:
        logger.error("Connection manager not initialized")
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    if discovery_service is None:
        logger.error("Discovery service not initialized")
        raise HTTPException(status_code=500, detail="Discovery service not initialized")
    
    peer_ip = request.peer_ip
    local_ip = get_local_ip()
    local_name = discovery_service.device_name
    
    logger.info(f"  From: {local_name} ({local_ip})")
    logger.info(f"  To: {peer_ip}")
    
    # Check if peer is discovered
    peers = discovery_service.get_peers()
    peer = next((p for p in peers if p.get("ip") == peer_ip), None)
    
    if not peer:
        logger.warning(f"  ✗ Peer {peer_ip} not found in discovered devices")
        raise HTTPException(status_code=404, detail=f"Peer {peer_ip} not found in discovered devices")
    
    peer_name = peer.get("device_name", "Unknown")
    logger.info(f"  ✓ Peer found: {peer_name}")
    
    # Check if already connected
    if connection_manager.is_connected(peer_ip):
        logger.info(f"  ⚠ Already connected to {peer_ip}")
        return {
            "status": "already_connected",
            "message": f"Already connected to {peer_name}",
            "peer_ip": peer_ip
        }
    
    # Create connection request locally first
    request_id = connection_manager.request_connection(
        from_ip=local_ip,
        from_name=local_name,
        to_ip=peer_ip,
        to_name=peer_name
    )
    logger.info(f"  ✓ Created local request: {request_id}")
    
    # Send connection request to target device via HTTP
    import requests
    target_url = f"http://{peer_ip}:8000/connections/incoming-request"
    
    # Visible console output (like broadcast messages)
    print(f"📤 Sending connection request to {peer_name} ({peer_ip})")
    print(f"   Request ID: {request_id}")
    print(f"   Target URL: {target_url}")
    logger.info(f"  📡 Attempting to send request to: {target_url}")
    
    try:
        response = requests.post(
            target_url,
            json={
                "request_id": request_id,
                "from_ip": local_ip,
                "from_name": local_name,
                "to_ip": peer_ip,
                "to_name": peer_name,
                "created_at": datetime.now().isoformat()
            },
            timeout=5
        )
        logger.info(f"  ✓ HTTP POST successful: Status {response.status_code}")
        logger.debug(f"  Response: {response.text}")
        
        if response.status_code == 200:
            print(f"✅ Connection request successfully delivered to {peer_ip}")
            logger.info(f"  ✅ Connection request successfully delivered to {peer_ip}")
        else:
            print(f"⚠ Unexpected status code from {peer_ip}: {response.status_code}")
            logger.warning(f"  ⚠ Unexpected status code: {response.status_code}")
            
    except requests.exceptions.ConnectionError as e:
        error_msg = f"✗ Connection failed to {peer_ip}:8000 - {str(e)}"
        print(error_msg)
        logger.error(f"  {error_msg}")
        logger.error(f"  Error details: {traceback.format_exc()}")
        print(f"   ℹ Request stored locally. Target device will poll for requests.")
        logger.info(f"  ℹ Request stored locally. Target device will poll for requests.")
    except requests.exceptions.Timeout as e:
        error_msg = f"✗ Timeout connecting to {peer_ip}:8000 - {str(e)}"
        print(error_msg)
        logger.error(f"  {error_msg}")
    except requests.exceptions.RequestException as e:
        error_msg = f"✗ Request error to {peer_ip}: {str(e)}"
        print(error_msg)
        logger.error(f"  {error_msg}")
        logger.error(f"  Error details: {traceback.format_exc()}")
    except Exception as e:
        error_msg = f"✗ Unexpected error sending request: {str(e)}"
        print(error_msg)
        logger.error(f"  {error_msg}")
        logger.error(f"  Error details: {traceback.format_exc()}")
    
    logger.info(f"  📋 Request ID: {request_id}")
    return {
        "status": "requested",
        "message": f"Connection requested to {peer_name}",
        "request_id": request_id,
        "peer_ip": peer_ip,
        "peer_name": peer_name
    }


@router.post("/incoming-request")
async def receive_incoming_request(request_data: IncomingRequest):
    """Receive a connection request from another device"""
    # Visible console output (like broadcast messages)
    print(f"📥 Received connection request from {request_data.from_name} ({request_data.from_ip})")
    print(f"   Request ID: {request_data.request_id}")
    print(f"   To: {request_data.to_name} ({request_data.to_ip})")
    logger.info(f"📥 Incoming connection request received")
    logger.info(f"  Request ID: {request_data.request_id}")
    logger.info(f"  From: {request_data.from_name} ({request_data.from_ip})")
    logger.info(f"  To: {request_data.to_name} ({request_data.to_ip})")
    
    if connection_manager is None:
        logger.error("Connection manager not initialized")
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    local_ip = get_local_ip()
    
    # Verify this request is for us
    if request_data.to_ip != local_ip:
        warning_msg = f"⚠ Request intended for {request_data.to_ip}, but we are {local_ip}"
        print(warning_msg)
        logger.warning(f"  {warning_msg}")
        return {"status": "ignored", "message": "Request not for this device"}
    
    # Store the incoming request
    if request_data.request_id:
        with connection_manager.lock:
            connection_manager.pending_requests[request_data.request_id] = {
                "request_id": request_data.request_id,
                "from_ip": request_data.from_ip,
                "from_name": request_data.from_name,
                "to_ip": request_data.to_ip,
                "to_name": request_data.to_name,
                "status": "pending",
                "created_at": request_data.created_at or datetime.now().isoformat()
            }
        pending_count = len(connection_manager.pending_requests)
        success_msg = f"✅ Connection request stored. Total pending: {pending_count}"
        print(success_msg)
        print(f"   ⏰ Request will appear in UI modal")
        logger.info(f"  {success_msg}")
    else:
        error_msg = "✗ Invalid request - missing request_id"
        print(error_msg)
        logger.error(f"  {error_msg}")
    
    return {"status": "received", "message": "Connection request received and stored"}


@router.get("/pending")
async def get_pending_requests():
    """Get pending connection requests for this device"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    local_ip = get_local_ip()
    pending = connection_manager.get_pending_requests_for(local_ip)
    
    logger.debug(f"📋 Pending requests query - Found {len(pending)} requests for {local_ip}")
    
    return {
        "pending_requests": pending,
        "count": len(pending)
    }


@router.post("/accept")
async def accept_connection(request: AcceptRequest):
    """Accept a connection request"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    request_id = request.request_id
    conn_request = connection_manager.get_request(request_id)
    
    if not conn_request:
        raise HTTPException(status_code=404, detail="Connection request not found")
    
    if conn_request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {conn_request['status']}")
    
    local_ip = get_local_ip()
    
    # Accept connection
    success = connection_manager.accept_connection(
        request_id=request_id,
        from_ip=conn_request["from_ip"],
        to_ip=local_ip
    )
    
    if success:
        print(f"✅ Connection accepted from {conn_request['from_name']} ({conn_request['from_ip']})")
        logger.info(f"✅ Connection accepted from {conn_request['from_name']}")
        
        # Notify the requesting device that connection was accepted
        import requests
        try:
            notify_url = f"http://{conn_request['from_ip']}:8000/connections/connection-accepted"
            print(f"📡 Notifying {conn_request['from_ip']} of connection acceptance...")
            response = requests.post(
                notify_url,
                json={
                    "peer_ip": local_ip,
                    "peer_name": discovery_service.device_name if discovery_service else "Unknown"
                },
                timeout=5
            )
            if response.status_code == 200:
                print(f"✅ Acceptance notification delivered to {conn_request['from_ip']}")
            else:
                print(f"⚠ Failed to notify {conn_request['from_ip']}: Status {response.status_code}")
        except Exception as e:
            error_msg = f"✗ Could not notify peer of acceptance: {e}"
            print(error_msg)
            logger.error(error_msg)
        
        return {
            "status": "accepted",
            "message": f"Connection accepted with {conn_request['from_name']}",
            "peer_ip": conn_request["from_ip"],
            "peer_name": conn_request["from_name"]
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to accept connection")


class ConnectionAcceptedNotification(BaseModel):
    peer_ip: str
    peer_name: str


@router.post("/connection-accepted")
async def receive_connection_accepted(notification: ConnectionAcceptedNotification):
    """Receive notification that a connection was accepted on the other device"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    peer_ip = notification.peer_ip
    peer_name = notification.peer_name
    local_ip = get_local_ip()
    
    # Only store the peer's connection, not our own IP
    # Each device should only track connections TO other devices, not to itself
    with connection_manager.lock:
        connection_manager.connections[peer_ip] = {
            "peer_ip": peer_ip,
            "peer_name": peer_name,
            "connected_at": datetime.now().isoformat(),
            "status": "connected"
        }
    
    return {"status": "updated"}


@router.post("/reject")
async def reject_connection(request: RejectRequest):
    """Reject a connection request"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    request_id = request.request_id
    conn_request = connection_manager.get_request(request_id)
    
    success = connection_manager.reject_connection(request_id)
    
    if success:
        if conn_request:
            print(f"🚫 Connection request rejected from {conn_request.get('from_name', 'Unknown')} ({conn_request.get('from_ip', 'Unknown')})")
            print(f"   Request ID: {request_id}")
        logger.info(f"🚫 Connection request {request_id} rejected")
        return {
            "status": "rejected",
            "message": "Connection request rejected"
        }
    else:
        raise HTTPException(status_code=404, detail="Connection request not found")


@router.get("/list")
async def get_connections():
    """Get list of connected devices (excluding local device)"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    from utils.network_utils import get_local_ip
    local_ip = get_local_ip()
    
    # Exclude local IP from connections list
    connections = connection_manager.get_connections(exclude_ip=local_ip)
    
    return {
        "connections": connections,
        "count": len(connections)
    }


@router.post("/disconnect")
async def disconnect(request: ConnectionRequest):
    """Disconnect from a peer"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    peer_ip = request.peer_ip
    local_ip = get_local_ip()
    
    # Get peer info before disconnecting
    peer_info = None
    with connection_manager.lock:
        if peer_ip in connection_manager.connections:
            peer_info = connection_manager.connections[peer_ip]
    
    # Disconnect locally
    connection_manager.disconnect(peer_ip)
    print(f"🔌 Disconnected from {peer_ip}")
    logger.info(f"🔌 Disconnected from {peer_ip}")
    
    # Notify the other device to disconnect as well (bidirectional)
    import requests
    try:
        notify_url = f"http://{peer_ip}:8000/connections/disconnect-peer"
        print(f"📡 Notifying {peer_ip} of disconnection...")
        response = requests.post(
            notify_url,
            json={"peer_ip": local_ip},
            timeout=5
        )
        if response.status_code == 200:
            print(f"✅ Disconnection notification delivered to {peer_ip}")
        else:
            print(f"⚠ Failed to notify {peer_ip}: Status {response.status_code}")
    except Exception as e:
        # Other device might already be offline, that's okay
        logger.debug(f"Could not notify peer of disconnection: {e}")
    
    return {
        "status": "disconnected",
        "message": f"Disconnected from {peer_ip}",
        "peer_ip": peer_ip
    }


@router.post("/disconnect-peer")
async def disconnect_peer(notification: dict):
    """Receive disconnection notification from another device (bidirectional cleanup)"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    peer_ip = notification.get("peer_ip")
    if peer_ip:
        connection_manager.disconnect(peer_ip)
        print(f"🔌 Peer {peer_ip} disconnected (bidirectional cleanup)")
        logger.info(f"🔌 Peer {peer_ip} disconnected (bidirectional cleanup)")
    
    return {"status": "disconnected"}


@router.get("/status/{peer_ip}")
async def get_connection_status(peer_ip: str):
    """Get connection status with a specific peer"""
    if connection_manager is None:
        raise HTTPException(status_code=500, detail="Connection manager not initialized")
    
    is_connected = connection_manager.is_connected(peer_ip)
    
    return {
        "peer_ip": peer_ip,
        "connected": is_connected,
        "status": "connected" if is_connected else "not_connected"
    }

