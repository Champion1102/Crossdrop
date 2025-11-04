"""
Network utilities for device discovery and communication
"""
import socket
import json
import platform
from typing import Dict, Optional


def get_local_ip() -> str:
    """Get the local IP address of this device"""
    try:
        # Connect to a dummy address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_device_name() -> str:
    """Get a friendly device name"""
    hostname = socket.gethostname()
    system = platform.system()
    return f"{hostname} ({system})"


def create_broadcast_socket(port: int) -> socket.socket:
    """Create a UDP socket configured for broadcasting"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    return sock


def create_listener_socket(port: int) -> socket.socket:
    """Create a UDP socket for listening to broadcasts"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('', port))
    return sock


def send_broadcast_message(port: int, message: Dict) -> None:
    """Send a UDP broadcast message"""
    sock = create_broadcast_socket(port)
    try:
        data = json.dumps(message).encode('utf-8')
        sock.sendto(data, ('<broadcast>', port))
    finally:
        sock.close()


def get_broadcast_address() -> str:
    """Get the broadcast address for the local network"""
    try:
        local_ip = get_local_ip()
        # Simple broadcast calculation (for most networks)
        parts = local_ip.split('.')
        if len(parts) == 4:
            return '.'.join(parts[:-1] + ['255'])
        return '255.255.255.255'
    except Exception:
        return '255.255.255.255'
