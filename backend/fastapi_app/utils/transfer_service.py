"""
Transfer service that manages TCP file transfer server in background
"""
import os
import socket
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from utils.file_handler import receive_file, log_transfer, get_downloads_folder
from utils.network_utils import get_local_ip
from utils.transfer_progress import progress_tracker


class TransferService:
    """Service for handling incoming file transfers via TCP"""
    
    TRANSFER_PORT = 9000
    
    def __init__(self, logs_dir: str = "logs", connection_manager=None):
        self.logs_dir = logs_dir
        self.local_ip = get_local_ip()
        self.connection_manager = connection_manager  # For security validation
        self.server_socket: Optional[socket.socket] = None
        self.server_thread: Optional[threading.Thread] = None
        self.running = False
        self.received_count = 0
    
    def start(self):
        """Start the TCP file transfer server in a background thread"""
        if self.running:
            return
        
        self.running = True
        self.server_thread = threading.Thread(
            target=self._server_loop,
            daemon=True,
            name="TransferServer"
        )
        self.server_thread.start()
        print(f"Transfer server started on port {self.TRANSFER_PORT}")
    
    def stop(self):
        """Stop the TCP file transfer server"""
        self.running = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass
    
    def _server_loop(self):
        """Main server loop that accepts connections and receives files"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind(('0.0.0.0', self.TRANSFER_PORT))
            self.server_socket.listen(5)
            self.server_socket.settimeout(1.0)  # Non-blocking with timeout
            
            print(f"TCP file transfer server listening on {self.local_ip}:{self.TRANSFER_PORT}")
            
            while self.running:
                try:
                    client_sock, client_addr = self.server_socket.accept()
                    print(f"📥 Incoming file transfer from {client_addr[0]}")
                    
                    # Handle each connection in a separate thread
                    client_thread = threading.Thread(
                        target=self._handle_client,
                        args=(client_sock, client_addr),
                        daemon=True
                    )
                    client_thread.start()
                    
                except socket.timeout:
                    # Timeout is expected, continue listening
                    continue
                except Exception as e:
                    if self.running:
                        print(f"Server error: {e}")
                    continue
        except Exception as e:
            print(f"Failed to start transfer server: {e}")
            self.running = False
        finally:
            if self.server_socket:
                try:
                    self.server_socket.close()
                except Exception:
                    pass
    
    def _handle_client(self, client_sock: socket.socket, client_addr: tuple):
        """Handle a single client connection"""
        start_time = time.time()
        sender_ip = client_addr[0]
        
        # SECURITY: Only accept files from connected peers
        if self.connection_manager:
            if not self.connection_manager.is_connected(sender_ip):
                print(f"⚠️ SECURITY: Rejecting file transfer from unauthorized device: {sender_ip}")
                print(f"   Only accepting files from accepted connections.")
                try:
                    client_sock.close()
                except Exception:
                    pass
                return
        
        try:
            client_sock.settimeout(60)  # 60 second timeout per file
            
            transfer_id = None
            
            # Metadata callback to create progress tracker
            def on_metadata(filename: str, file_size: int):
                nonlocal transfer_id
                transfer_id = str(uuid.uuid4())
                progress_tracker.create_transfer(
                    transfer_id=transfer_id,
                    direction='receive',
                    sender_ip=sender_ip,
                    receiver_ip=self.local_ip,
                    filename=filename,
                    file_size=file_size
                )
                # Store socket for cancellation now that transfer_id is available
                progress_tracker.set_socket(transfer_id, client_sock)
                
                # Print initial receiving info
                file_size_mb = file_size / (1024 * 1024) if file_size > 0 else 0
                if file_size > 0:
                    print(f"📥 Starting to receive: {filename} ({file_size_mb:.2f} MB) from {sender_ip}")
                else:
                    print(f"📥 Starting to receive: {filename} (size unknown) from {sender_ip}")
                print(f"   📁 Saving to: {get_downloads_folder()}")
            
            # Track last printed progress for terminal output
            last_printed_progress = {'bytes': 0, 'time': start_time}
            
            # Progress callback
            def update_receive_progress(bytes_received: int):
                nonlocal last_printed_progress
                if transfer_id:
                    progress_tracker.update_progress(transfer_id, bytes_received)
                    
                    # Get progress info from tracker for detailed logging
                    progress_info = progress_tracker.get_progress(transfer_id)
                    if progress_info:
                        current_time = time.time()
                        time_delta = current_time - last_printed_progress['time']
                        bytes_delta = bytes_received - last_printed_progress['bytes']
                        
                        # Print progress every 5MB or every 2 seconds, whichever comes first
                        if (bytes_delta >= 5 * 1024 * 1024) or (time_delta >= 2.0):
                            file_size = progress_info.get('file_size', 0)
                            progress_percent = progress_info.get('progress_percent', 0)
                            speed = progress_info.get('speed', 0)
                            filename = progress_info.get('filename', 'unknown')
                            
                            # Format output
                            received_mb = bytes_received / (1024 * 1024)
                            total_mb = file_size / (1024 * 1024) if file_size > 0 else 0
                            
                            if file_size > 0:
                                print(f"📥 Receiving: {filename}")
                                print(f"   Progress: {progress_percent:.1f}% | {received_mb:.2f} MB / {total_mb:.2f} MB | Speed: {speed:.2f} MB/s")
                            else:
                                print(f"📥 Receiving: {filename}")
                                print(f"   Progress: {received_mb:.2f} MB received | Speed: {speed:.2f} MB/s")
                            
                            last_printed_progress = {'bytes': bytes_received, 'time': current_time}
            
            # Store socket for cancellation (will be set after metadata is received)
            # Note: transfer_id is created in on_metadata callback
            
            # Receive the file to Downloads folder with progress tracking
            downloads_folder = get_downloads_folder()
            file_path, file_size = receive_file(
                client_sock, 
                str(downloads_folder), 
                progress_callback=update_receive_progress,
                metadata_callback=on_metadata
            )
            
            duration = time.time() - start_time
            
            # Check if transfer was cancelled
            if transfer_id:
                progress_info = progress_tracker.get_progress(transfer_id)
                if progress_info and progress_info.get('status') == 'cancelled':
                    print(f"🚫 File receive cancelled by user")
                    if file_path and os.path.exists(file_path):
                        try:
                            os.remove(file_path)  # Delete partial file
                            print(f"   🗑️  Deleted partial file: {file_path}")
                        except Exception as e:
                            print(f"   ⚠️  Could not delete partial file: {e}")
                    return
            
            if file_path and file_size:
                progress_tracker.complete_transfer(transfer_id)
                self.received_count += 1
                filename = Path(file_path).name
                
                # Get final progress info
                progress_info = progress_tracker.get_progress(transfer_id)
                avg_speed = 0
                if progress_info and duration > 0:
                    avg_speed = (file_size / (1024 * 1024)) / duration
                
                file_size_mb = file_size / (1024 * 1024)
                print(f"\n✓ File received successfully!")
                print(f"   📄 Filename: {filename}")
                print(f"   📊 Size: {file_size_mb:.2f} MB ({file_size:,} bytes)")
                print(f"   ⏱️  Duration: {duration:.2f} seconds")
                print(f"   🚀 Average Speed: {avg_speed:.2f} MB/s")
                print(f"   📁 Saved to: {file_path}")
                print(f"   👤 From: {sender_ip}\n")
                
                # Log successful transfer
                log_transfer(
                    sender_ip=sender_ip,
                    receiver_ip=self.local_ip,
                    filename=filename,
                    file_size=file_size,
                    duration=duration,
                    status="success",
                    logs_dir=self.logs_dir
                )
            elif file_path is None and file_size is None:
                # Transfer was cancelled or connection closed prematurely
                if transfer_id:
                    progress_info = progress_tracker.get_progress(transfer_id)
                    if progress_info and progress_info.get('status') != 'cancelled':
                        progress_tracker.fail_transfer(transfer_id)
                    print(f"🚫 File receive cancelled or connection closed")
                else:
                    print(f"✗ Failed to receive file from {sender_ip} (connection closed)")
            else:
                if transfer_id:
                    progress_tracker.fail_transfer(transfer_id)
                print(f"✗ Failed to receive file from {sender_ip}")
                log_transfer(
                    sender_ip=sender_ip,
                    receiver_ip=self.local_ip,
                    filename="unknown",
                    file_size=0,
                    duration=duration,
                    status="failed",
                    logs_dir=self.logs_dir
                )
        except Exception as e:
            duration = time.time() - start_time
            if 'transfer_id' in locals():
                progress_tracker.fail_transfer(transfer_id)
            print(f"Error handling client {sender_ip}: {e}")
            log_transfer(
                sender_ip=sender_ip,
                receiver_ip=self.local_ip,
                filename="unknown",
                file_size=0,
                duration=duration,
                status="failed",
                logs_dir=self.logs_dir
            )
        finally:
            try:
                client_sock.close()
            except Exception:
                pass

