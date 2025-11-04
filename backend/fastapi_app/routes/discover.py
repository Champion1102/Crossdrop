"""
Device discovery routes for LAN-based device discovery
"""
from fastapi import APIRouter
from utils.discovery_service import DiscoveryService
from utils.logger import get_logger

logger = get_logger("discover")

# Global discovery service instance (will be set by main.py)
discovery_service: DiscoveryService = None


def set_discovery_service(service: DiscoveryService):
    """Set the discovery service instance"""
    global discovery_service
    discovery_service = service


router = APIRouter(prefix="/discover", tags=["discovery"])


@router.get("/")
async def discover_devices():
    """Discover available devices on the local network (LAN)"""
    return {"message": "Use /discover/peers to get the list of discovered devices"}


@router.get("/peers")
async def get_peers():
    """Get current list of discovered peer devices"""
    if discovery_service is None:
        return {"error": "Discovery service not initialized", "peers": []}
    
    peers = discovery_service.get_peers()
    return {"peers": peers, "count": len(peers)}


@router.get("/status")
async def discovery_status():
    """Get the status of device discovery"""
    if discovery_service is None:
        return {"status": "inactive", "error": "Discovery service not initialized"}
    
    # Refresh local IP to handle network changes
    from utils.network_utils import get_local_ip
    current_local_ip = get_local_ip()
    
    # Update discovery service's local IP if it changed
    if discovery_service.local_ip != current_local_ip:
        logger.info(f"🔄 Local IP changed from {discovery_service.local_ip} to {current_local_ip}")
        discovery_service.local_ip = current_local_ip
    
    return {
        "status": "active" if discovery_service.running else "inactive",
        "scanning": discovery_service.running,
        "local_ip": current_local_ip,
        "device_name": discovery_service.device_name
    }


@router.post("/start")
async def start_discovery():
    """Start device discovery"""
    if discovery_service is None:
        return {"status": "error", "message": "Discovery service not initialized"}
    
    if discovery_service.running:
        return {"status": "already_running", "message": "Discovery is already running"}
    
    discovery_service.start()
    return {
        "status": "started",
        "message": "Device discovery started",
        "scanning": True
    }


@router.post("/stop")
async def stop_discovery():
    """Stop device discovery"""
    if discovery_service is None:
        return {"status": "error", "message": "Discovery service not initialized"}
    
    if not discovery_service.running:
        return {"status": "already_stopped", "message": "Discovery is already stopped"}
    
    discovery_service.stop()
    return {
        "status": "stopped",
        "message": "Device discovery stopped",
        "scanning": False
    }

