"""
Debug endpoints for troubleshooting
"""
from fastapi import APIRouter
from utils.connection_manager import ConnectionManager
from utils.discovery_service import DiscoveryService
from utils.network_utils import get_local_ip

# Global instances
connection_manager: ConnectionManager = None
discovery_service: DiscoveryService = None


def set_debug_services(conn_mgr: ConnectionManager, disc_svc: DiscoveryService):
    """Set the service instances"""
    global connection_manager, discovery_service
    connection_manager = conn_mgr
    discovery_service = disc_svc


router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/status")
async def debug_status():
    """Get comprehensive debug status"""
    local_ip = get_local_ip()
    
    status = {
        "local_ip": local_ip,
        "device_name": discovery_service.device_name if discovery_service else "Unknown",
        "discovery": {
            "running": discovery_service.running if discovery_service else False,
            "peers_count": len(discovery_service.get_peers()) if discovery_service else 0,
            "peers": discovery_service.get_peers() if discovery_service else []
        },
        "connections": {
            "all": list(connection_manager.connections.values()) if connection_manager else [],
            "count": len(connection_manager.connections) if connection_manager else 0
        } if connection_manager else {},
        "pending_requests": {
            "all": list(connection_manager.pending_requests.values()) if connection_manager else [],
            "for_this_device": connection_manager.get_pending_requests_for(local_ip) if connection_manager else [],
            "count": len(connection_manager.get_pending_requests_for(local_ip)) if connection_manager else 0
        } if connection_manager else {}
    }
    
    return status

