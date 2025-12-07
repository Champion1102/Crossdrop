"""
Device discovery service that manages UDP broadcast and listening
"""
import json
import socket
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from collections import OrderedDict

from utils.network_utils import (
    get_local_ip,
    get_device_name,
    create_broadcast_socket,
    create_listener_socket,
    get_broadcast_address
)
from utils.logger import get_logger

logger = get_logger("discovery")


class DiscoveryService:
    """Service for discovering and managing peer devices on LAN"""

    BROADCAST_PORT = 8888
    BROADCAST_INTERVAL = 3.0  # seconds - broadcast presence every 3 seconds
    PEER_TIMEOUT = 15.0  # seconds - peer considered inactive if no message for this duration (5x broadcast interval)
    
    def __init__(self, logs_dir: str = "logs"):
        self.device_name = get_device_name()
        self.local_ip = get_local_ip()
        self.peers: OrderedDict[str, Dict] = OrderedDict()
        self.peers_lock = threading.Lock()
        self.running = False
        self.logs_dir = Path(logs_dir)
        self.logs_dir.mkdir(exist_ok=True)
        self.peers_file = self.logs_dir / "peers.json"
        
        # Background threads
        self.broadcast_thread: Optional[threading.Thread] = None
        self.listener_thread: Optional[threading.Thread] = None
        
    def start(self):
        """Start the discovery service (broadcast and listener threads)"""
        if self.running:
            return
        
        self.running = True
        
        # Start broadcast thread
        self.broadcast_thread = threading.Thread(
            target=self._broadcast_loop,
            daemon=True,
            name="DiscoveryBroadcast"
        )
        self.broadcast_thread.start()
        
        # Start listener thread
        self.listener_thread = threading.Thread(
            target=self._listener_loop,
            daemon=True,
            name="DiscoveryListener"
        )
        self.listener_thread.start()
        
        # Start cleanup thread for expired peers
        cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="DiscoveryCleanup"
        )
        cleanup_thread.start()
    
    def stop(self):
        """Stop the discovery service"""
        self.running = False
    
    def _broadcast_loop(self):
        """Continuously broadcast device information every 2 seconds"""
        sock = None
        # Use network-wide broadcast to reach all subnets
        # For college/public WiFi, this is needed when devices are on different subnets
        broadcast_addrs = ['255.255.255.255', get_broadcast_address()]
        
        try:
            sock = create_broadcast_socket(self.BROADCAST_PORT)
            
            while self.running:
                # Refresh local IP on each broadcast to handle network changes
                current_local_ip = get_local_ip()
                if self.local_ip != current_local_ip:
                    logger.info(f"🔄 Local IP changed from {self.local_ip} to {current_local_ip}")
                    self.local_ip = current_local_ip
                
                message = {
                    "device_name": self.device_name,
                    "ip": self.local_ip
                }
                
                data = json.dumps(message).encode('utf-8')
                
                # Try broadcasting to both network-wide and subnet-specific addresses
                for broadcast_addr in broadcast_addrs:
                    try:
                        sock.sendto(data, (broadcast_addr, self.BROADCAST_PORT))
                    except Exception as e:
                        # If subnet broadcast fails, continue with next address
                        if broadcast_addr == '255.255.255.255':
                            # Log if network-wide broadcast fails (might be blocked)
                            pass
                        continue
                
                time.sleep(self.BROADCAST_INTERVAL)
        except Exception as e:
            logger.error(f"Broadcast error: {e}", exc_info=True)
        finally:
            if sock:
                sock.close()
    
    def _listener_loop(self):
        """Continuously listen for broadcast messages from other devices"""
        sock = create_listener_socket(self.BROADCAST_PORT)
        sock.settimeout(1.0)  # Non-blocking with timeout
        
        logger.info(f"Discovery listener started on port {self.BROADCAST_PORT}")
        logger.info(f"Listening for broadcasts from other devices...")
        
        try:
            while self.running:
                try:
                    data, addr = sock.recvfrom(1024)
                    message = json.loads(data.decode('utf-8'))
                    
                    # Refresh local IP to handle network changes
                    current_local_ip = get_local_ip()
                    if self.local_ip != current_local_ip:
                        logger.info(f"🔄 Local IP changed from {self.local_ip} to {current_local_ip}")
                        self.local_ip = current_local_ip
                    
                    # Ignore messages from ourselves
                    if message.get("ip") == self.local_ip:
                        continue
                    
                    # Update peer information
                    peer_ip = message.get("ip")
                    if peer_ip:
                        logger.info(f"✓ Received broadcast from {peer_ip} ({message.get('device_name', 'Unknown')})")
                        self._update_peer(peer_ip, message)
                        
                except socket.timeout:
                    # Timeout is expected, continue listening
                    continue
                except json.JSONDecodeError:
                    # Invalid JSON, skip
                    continue
                except Exception as e:
                    logger.error(f"Listener error: {e}", exc_info=True)
                    continue
        finally:
            sock.close()
    
    def _update_peer(self, ip: str, peer_info: Dict):
        """Update peer information and log to file"""
        with self.peers_lock:
            device_name = peer_info.get("device_name", "Unknown")
            
            # Check if we already have this device with a different IP
            # If so, remove the old entry to prevent stale IPs
            old_ip_to_remove = None
            for existing_ip, existing_info in list(self.peers.items()):
                if existing_info.get("device_name") == device_name and existing_ip != ip:
                    old_ip_to_remove = existing_ip
                    logger.info(f"🔄 Device {device_name} IP changed from {existing_ip} to {ip}")
                    break
            
            # Remove old IP entry if device name matches but IP changed
            if old_ip_to_remove:
                del self.peers[old_ip_to_remove]
            
            # Update/add peer with current IP
            self.peers[ip] = {
                **peer_info,
                "last_seen": datetime.now().isoformat()
            }
        
        # Write to JSON file
        self._log_peers()
    
    def _cleanup_loop(self):
        """Periodically remove expired peers"""
        while self.running:
            time.sleep(self.BROADCAST_INTERVAL)
            
            current_time = datetime.now()
            expired_peers = []
            
            with self.peers_lock:
                for ip, peer_info in list(self.peers.items()):
                    last_seen_str = peer_info.get("last_seen")
                    if last_seen_str:
                        try:
                            last_seen = datetime.fromisoformat(last_seen_str)
                            elapsed = (current_time - last_seen).total_seconds()
                            
                            if elapsed > self.PEER_TIMEOUT:
                                expired_peers.append(ip)
                        except Exception:
                            # If parsing fails, mark as expired
                            expired_peers.append(ip)
                
                for ip in expired_peers:
                    del self.peers[ip]
            
            if expired_peers:
                self._log_peers()
    
    def _log_peers(self):
        """Write current peers list to JSON file"""
        try:
            with self.peers_lock:
                peers_list = [
                    {
                        "ip": ip,
                        "device_name": peer_info.get("device_name", "Unknown"),
                        "last_seen": peer_info.get("last_seen", "")
                    }
                    for ip, peer_info in self.peers.items()
                ]
            
            with open(self.peers_file, 'w') as f:
                json.dump({
                    "updated_at": datetime.now().isoformat(),
                    "peers": peers_list
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Error logging peers: {e}", exc_info=True)
    
    def get_peers(self) -> List[Dict]:
        """Get current list of active peers"""
        with self.peers_lock:
            return [
                {
                    "ip": ip,
                    "device_name": peer_info.get("device_name", "Unknown"),
                    "last_seen": peer_info.get("last_seen", "")
                }
                for ip, peer_info in self.peers.items()
            ]

