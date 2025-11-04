"""
Transfer progress tracking for real-time progress updates
"""
import threading
import time
from typing import Dict, Optional
from datetime import datetime


class TransferProgressTracker:
    """Thread-safe progress tracker for file transfers"""
    
    def __init__(self):
        self._progress: Dict[str, Dict] = {}  # transfer_id -> progress info
        self._active_sockets: Dict[str, any] = {}  # transfer_id -> socket object (for cancellation)
        self._lock = threading.Lock()
    
    def create_transfer(
        self, 
        transfer_id: str, 
        direction: str,  # 'send' or 'receive'
        sender_ip: str,
        receiver_ip: str,
        filename: str,
        file_size: int,
        socket_obj: Optional[any] = None
    ):
        """Create a new transfer entry
        
        Args:
            socket_obj: Optional socket object for cancellation (can be set later)
        """
        with self._lock:
            self._progress[transfer_id] = {
                'direction': direction,
                'sender_ip': sender_ip,
                'receiver_ip': receiver_ip,
                'filename': filename,
                'file_size': file_size,
                'bytes_transferred': 0,
                'progress_percent': 0.0,
                'speed': 0.0,  # MB/s
                'start_time': time.time(),
                'last_update': time.time(),
                'status': 'active',  # 'active', 'completed', 'failed', 'cancelled'
                'last_bytes': 0,
                'last_time': time.time()
            }
            if socket_obj:
                self._active_sockets[transfer_id] = socket_obj
    
    def update_progress(
        self, 
        transfer_id: str, 
        bytes_transferred: int
    ):
        """Update transfer progress"""
        with self._lock:
            if transfer_id not in self._progress:
                return
            
            progress = self._progress[transfer_id]
            progress['bytes_transferred'] = bytes_transferred
            
            # Calculate progress percentage
            if progress['file_size'] > 0:
                progress['progress_percent'] = (bytes_transferred / progress['file_size']) * 100
            else:
                progress['progress_percent'] = 0.0
            
            # Calculate speed (MB/s)
            current_time = time.time()
            time_delta = current_time - progress['last_time']
            bytes_delta = bytes_transferred - progress['last_bytes']
            
            if time_delta > 0:
                progress['speed'] = (bytes_delta / (1024 * 1024)) / time_delta
            else:
                progress['speed'] = 0.0
            
            progress['last_update'] = current_time
            progress['last_bytes'] = bytes_transferred
            progress['last_time'] = current_time
    
    def get_progress(self, transfer_id: str) -> Optional[Dict]:
        """Get current progress for a transfer"""
        with self._lock:
            return self._progress.get(transfer_id)
    
    def get_transfers_by_ip(self, ip: str, direction: Optional[str] = None) -> list:
        """Get all transfers for a specific IP address"""
        with self._lock:
            results = []
            for transfer_id, progress in self._progress.items():
                # Check if IP is sender or receiver
                if progress['sender_ip'] == ip or progress['receiver_ip'] == ip:
                    if direction is None or progress['direction'] == direction:
                        results.append({
                            'transfer_id': transfer_id,
                            **progress
                        })
            return results
    
    def complete_transfer(self, transfer_id: str):
        """Mark transfer as completed"""
        with self._lock:
            if transfer_id in self._progress:
                self._progress[transfer_id]['status'] = 'completed'
                self._progress[transfer_id]['progress_percent'] = 100.0
    
    def fail_transfer(self, transfer_id: str):
        """Mark transfer as failed"""
        with self._lock:
            if transfer_id in self._progress:
                self._progress[transfer_id]['status'] = 'failed'
    
    def set_socket(self, transfer_id: str, socket_obj: any):
        """Store socket for a transfer (for cancellation)"""
        with self._lock:
            if transfer_id in self._progress:
                self._active_sockets[transfer_id] = socket_obj
    
    def cancel_transfer(self, transfer_id: str) -> bool:
        """Cancel an active transfer by closing its socket
        
        Returns:
            bool: True if cancelled, False if not found or already completed
        """
        with self._lock:
            if transfer_id not in self._progress:
                return False
            
            progress = self._progress[transfer_id]
            if progress['status'] not in ('active',):
                return False
            
            # Mark as cancelled
            progress['status'] = 'cancelled'
            
            # Close socket if available
            if transfer_id in self._active_sockets:
                sock = self._active_sockets[transfer_id]
                try:
                    sock.close()
                except Exception:
                    pass
                del self._active_sockets[transfer_id]
            
            # Remove cancelled transfer immediately (don't keep it around)
            # This prevents it from showing up in progress polls
            del self._progress[transfer_id]
            
            return True
    
    def remove_transfer(self, transfer_id: str):
        """Remove transfer (after cleanup delay)"""
        with self._lock:
            if transfer_id in self._progress:
                del self._progress[transfer_id]
            if transfer_id in self._active_sockets:
                del self._active_sockets[transfer_id]
    
    def cleanup_old_transfers(self, max_age_seconds: int = 300):
        """Remove old completed/failed transfers"""
        current_time = time.time()
        with self._lock:
            to_remove = []
            for transfer_id, progress in self._progress.items():
                age = current_time - progress['last_update']
                if progress['status'] in ('completed', 'failed') and age > max_age_seconds:
                    to_remove.append(transfer_id)
            
            for transfer_id in to_remove:
                del self._progress[transfer_id]


# Global instance
progress_tracker = TransferProgressTracker()

