"""
File handling utilities for file transfer operations
"""
import socket
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, Callable


TRANSFER_PORT = 9000
CHUNK_SIZE = 64 * 1024  # 64KB - increased for better performance  
OPTIMAL_CHUNK_SIZE = 1024 * 1024  # 1MB - larger chunks for maximum throughput on fast networks
STREAMING_BUFFER_SIZE = 16 * 1024 * 1024  # 16MB buffer for better TCP performance
LARGE_FILE_THRESHOLD = 100 * 1024 * 1024  # 100MB - threshold for chunked streaming
PROGRESS_UPDATE_INTERVAL = 1 * 1024 * 1024  # Update progress every 1MB for better UI responsiveness


def get_downloads_folder() -> Path:
    """
    Get the user's Downloads folder path (cross-platform)
    
    Returns:
        Path to Downloads folder
    """
    home = Path.home()
    
    # Get Downloads folder (works on macOS, Windows, Linux)
    downloads = home / "Downloads"
    
    # Ensure Downloads exists
    downloads.mkdir(exist_ok=True)
    
    return downloads


def receive_file(sock: socket.socket, save_dir: str = None, progress_callback: Optional[Callable[[int], None]] = None, metadata_callback: Optional[Callable[[str, int], None]] = None) -> Tuple[Optional[str], Optional[int]]:
    """
    Receive a file from a TCP socket connection
    
    Args:
        sock: Socket connection to receive from
        save_dir: Directory to save file (defaults to Downloads folder if None)
    
    Returns:
        tuple: (filename, file_size) or (None, None) if error
    """
    # Use Downloads folder if no directory specified
    if save_dir is None:
        save_path = get_downloads_folder()
    else:
        save_path = Path(save_dir)
    
    save_path.mkdir(exist_ok=True)
    
    try:
        # First, receive file metadata (filename and size)
        # Format: "filename|size" (JSON encoded)
        metadata_json = sock.recv(1024).decode('utf-8')
        if not metadata_json:
            return None, None
        
        metadata = json.loads(metadata_json)
        filename = metadata.get('filename')
        file_size = metadata.get('size', 0)
        
        if not filename:
            return None, None
        
        # Call metadata callback if provided (before sending ack)
        if metadata_callback:
            metadata_callback(filename, file_size)
        
        # Send acknowledgment that we received metadata
        sock.send(b'OK')
        
        # Save file
        file_path = save_path / filename
        total_received = 0
        
        with open(file_path, 'wb') as f:
            # Handle unknown file size (file_size = 0)
            # Determine progress update frequency based on file size
            # For small files (<10MB), update more frequently for better UI feedback
            progress_interval = min(PROGRESS_UPDATE_INTERVAL, max(64 * 1024, file_size // 20 if file_size > 0 else 64 * 1024))

            if file_size == 0:
                # Stream until connection closes
                last_progress_update = 0
                while True:
                    try:
                        chunk = sock.recv(OPTIMAL_CHUNK_SIZE)  # Use larger chunks
                        if not chunk:
                            break
                    except (ConnectionResetError, OSError) as e:
                        # Connection was reset or closed (likely cancelled)
                        print(f"⚠️ Connection error while receiving: {e}")
                        print(f"   Received {total_received} bytes before connection closed")
                        return None, None
                    f.write(chunk)
                    total_received += len(chunk)
                    # Call progress callback periodically
                    if progress_callback and (total_received - last_progress_update) >= progress_interval:
                        progress_callback(total_received)
                        last_progress_update = total_received

                # Final progress update
                if progress_callback and total_received > last_progress_update:
                    progress_callback(total_received)
            else:
                # Known file size: read until we have all bytes
                # Use larger chunks for better performance
                last_progress_update = 0
                while total_received < file_size:
                    remaining = file_size - total_received
                    chunk_size = min(OPTIMAL_CHUNK_SIZE, remaining)
                    try:
                        chunk = sock.recv(chunk_size)
                        if not chunk:
                            # Socket closed by sender (likely cancelled)
                            print(f"⚠️ Socket closed prematurely. Expected {file_size} bytes, received {total_received} bytes")
                            return None, None
                    except (ConnectionResetError, OSError) as e:
                        # Connection was reset or closed (likely cancelled)
                        print(f"⚠️ Connection error while receiving: {e}")
                        print(f"   Received {total_received} bytes before connection closed")
                        return None, None
                    f.write(chunk)
                    total_received += len(chunk)
                    # Call progress callback periodically
                    if progress_callback and (total_received - last_progress_update) >= progress_interval:
                        progress_callback(total_received)
                        last_progress_update = total_received

                # Final progress update
                if progress_callback and total_received > last_progress_update:
                    progress_callback(total_received)
        
        return str(file_path), total_received
        
    except Exception as e:
        print(f"Error receiving file: {e}")
        return None, None


def _optimize_tcp_socket(sock: socket.socket):
    """
    Optimize TCP socket settings for better performance and throughput
    
    Args:
        sock: TCP socket to optimize
    """
    try:
        # Increase send buffer to 4MB for better throughput (was 1MB)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, STREAMING_BUFFER_SIZE)
        
        # Increase receive buffer on the socket
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, STREAMING_BUFFER_SIZE)
        
        # Enable TCP_NODELAY for low latency (disable Nagle's algorithm)
        # For large files, we want immediate sending of chunks
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        
        # Keep-alive to detect dead connections
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        
        # Note: TCP window scaling is negotiated during connection handshake,
        # so we can't set it directly. The kernel handles this automatically.
        # Large buffers help the kernel use window scaling effectively.
    except Exception as e:
        # If optimization fails, continue with default settings
        print(f"Warning: Could not optimize socket settings: {e}")


def send_file_from_stream(
    target_ip: str,
    file_stream,
    filename: str,
    file_size: int,
    port: int = TRANSFER_PORT,
    use_optimized: bool = False,
    progress_callback: Optional[Callable[[int], None]] = None,
    socket_store_callback: Optional[Callable[[socket.socket], None]] = None
) -> bool:
    """
    Send file data from a stream/memory buffer to a target IP address via TCP socket

    Args:
        target_ip: IP address of the target device
        file_stream: File-like object or bytes to send
        filename: Name of the file
        file_size: Size of the file in bytes
        port: TCP port to connect to (default: 9000)
        use_optimized: If True, use 64KB chunks and optimized socket settings
        progress_callback: Optional callback to report bytes sent
        socket_store_callback: Optional callback to store socket for cancellation

    Returns:
        bool: True if successful, False otherwise
    """
    sock = None
    chunk_size = OPTIMAL_CHUNK_SIZE if use_optimized else CHUNK_SIZE

    try:
        # Connect to target device
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        timeout = 60 if use_optimized else 30  # Longer timeout for large files
        sock.settimeout(timeout)

        # Optimize socket for large files
        if use_optimized:
            _optimize_tcp_socket(sock)

        sock.connect((target_ip, port))

        # Store socket for cancellation support
        if socket_store_callback:
            socket_store_callback(sock)

        # Send file metadata
        metadata = {
            'filename': filename,
            'size': file_size
        }
        metadata_json = json.dumps(metadata).encode('utf-8')
        sock.send(metadata_json)

        # Wait for acknowledgment
        ack = sock.recv(2)
        if ack != b'OK':
            print(f"Did not receive acknowledgment from {target_ip}")
            return False

        # Send file data in chunks
        total_sent = 0
        last_progress_update = 0

        # Handle bytes object (most common case for FastAPI UploadFile.read())
        if isinstance(file_stream, bytes):
            while total_sent < file_size:
                chunk = file_stream[total_sent:total_sent + chunk_size]
                if not chunk:
                    break
                sock.sendall(chunk)
                total_sent += len(chunk)
                # Update progress periodically
                if progress_callback and (total_sent - last_progress_update) >= PROGRESS_UPDATE_INTERVAL:
                    progress_callback(total_sent)
                    last_progress_update = total_sent
        # Handle file-like object with read method
        elif hasattr(file_stream, 'read'):
            while total_sent < file_size:
                chunk = file_stream.read(chunk_size)
                if not chunk:
                    break
                sock.sendall(chunk)
                total_sent += len(chunk)
                # Update progress periodically
                if progress_callback and (total_sent - last_progress_update) >= PROGRESS_UPDATE_INTERVAL:
                    progress_callback(total_sent)
                    last_progress_update = total_sent
        else:
            print(f"Unsupported file stream type: {type(file_stream)}")
            return False

        # Final progress update
        if progress_callback and total_sent > last_progress_update:
            progress_callback(total_sent)

        return True

    except socket.timeout:
        print(f"Timeout connecting to {target_ip}:{port}")
        return False
    except ConnectionRefusedError:
        print(f"Connection refused by {target_ip}:{port}")
        return False
    except Exception as e:
        print(f"Error sending file to {target_ip}: {e}")
        return False
    finally:
        if sock:
            sock.close()


async def send_file_chunked_streaming(
    target_ip: str,
    file_upload: any,  # FastAPI UploadFile
    filename: str,
    file_size: int,
    port: int = TRANSFER_PORT,
    progress_callback: Optional[Callable[[int], None]] = None,
    socket_store_callback: Optional[Callable[[socket.socket], None]] = None
) -> bool:
    """
    Stream large file directly from upload to TCP socket in optimized chunks
    Uses dual-buffer pipelining for maximum efficiency with minimal memory
    
    Args:
        target_ip: IP address of the target device
        file_upload: FastAPI UploadFile object
        filename: Name of the file
        file_size: Size of the file in bytes
        port: TCP port to connect to (default: 9000)
    
    Returns:
        bool: True if successful, False otherwise
    """
    sock = None
    
    try:
        # Connect to target device
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(60)  # 60 second timeout for large files
        
        # Optimize socket for large file transfer BEFORE connecting
        _optimize_tcp_socket(sock)
        
        sock.connect((target_ip, port))

        # Store socket for cancellation support
        if socket_store_callback:
            socket_store_callback(sock)

        # Send file metadata
        metadata = {
            'filename': filename,
            'size': file_size
        }
        metadata_json = json.dumps(metadata).encode('utf-8')
        sock.send(metadata_json)

        # Wait for acknowledgment
        ack = sock.recv(2)
        if ack != b'OK':
            print(f"Did not receive acknowledgment from {target_ip}")
            return False

        # Stream file in optimized chunks directly from upload
        # Read and send in 256KB chunks for optimal TCP efficiency and throughput
        # Send chunks immediately for zero-copy performance
        total_sent = 0
        last_progress_update = 0
        
        # Read chunks from upload and send immediately (no buffering)
        # This keeps memory usage constant at ~256KB regardless of file size
        while True:
            # Read chunk from upload stream
            chunk = await file_upload.read(OPTIMAL_CHUNK_SIZE)
            if not chunk:
                # EOF reached
                break
            
            # Send chunk immediately to TCP socket
            # Using sendall ensures all data is sent even if it takes multiple syscalls
            sock.sendall(chunk)
            total_sent += len(chunk)
            
            # Call progress callback periodically (every 5MB) to reduce overhead
            # This prevents the progress callback from slowing down the transfer
            if progress_callback and (total_sent - last_progress_update) >= PROGRESS_UPDATE_INTERVAL:
                progress_callback(total_sent)
                last_progress_update = total_sent
            elif file_size > 0 and total_sent % (10 * 1024 * 1024) == 0:  # Every 10MB
                # Fallback: Progress indicator for very large files (if size known)
                progress = (total_sent / file_size) * 100
                print(f"  📊 Progress: {progress:.1f}% ({total_sent / (1024*1024):.2f} MB / {file_size / (1024*1024):.2f} MB)")
            elif file_size == 0 and total_sent % (10 * 1024 * 1024) == 0:
                # Size unknown, just show bytes sent
                print(f"  📊 Progress: {total_sent / (1024*1024):.2f} MB sent...")
        
        # Final progress update
        if progress_callback and total_sent > last_progress_update:
            progress_callback(total_sent)
        
        # If file_size was 0 (unknown), we're done - return True
        # If file_size was known, verify we sent everything
        if file_size > 0 and total_sent != file_size:
            print(f"⚠ Warning: Sent {total_sent} bytes but expected {file_size} bytes")
            return False
        
        return True
        
    except socket.timeout:
        print(f"Timeout connecting to {target_ip}:{port}")
        return False
    except ConnectionRefusedError:
        print(f"Connection refused by {target_ip}:{port}")
        return False
    except Exception as e:
        print(f"Error streaming file to {target_ip}: {e}")
        return False
    finally:
        if sock:
            sock.close()


def send_file(target_ip: str, file_path: str, port: int = TRANSFER_PORT) -> bool:
    """
    Send a file to a target IP address via TCP socket
    
    Args:
        target_ip: IP address of the target device
        file_path: Path to the file to send
        port: TCP port to connect to (default: 9000)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return False
    
    file_path_obj = Path(file_path)
    file_size = file_path_obj.stat().st_size
    filename = file_path_obj.name
    
    sock = None
    try:
        # Connect to target device
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(30)  # 30 second timeout
        sock.connect((target_ip, port))
        
        # Send file metadata
        metadata = {
            'filename': filename,
            'size': file_size
        }
        metadata_json = json.dumps(metadata).encode('utf-8')
        sock.send(metadata_json)
        
        # Wait for acknowledgment
        ack = sock.recv(2)
        if ack != b'OK':
            print(f"Did not receive acknowledgment from {target_ip}")
            return False
        
        # Send file in chunks
        with open(file_path, 'rb') as f:
            total_sent = 0
            while total_sent < file_size:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                sock.sendall(chunk)
                total_sent += len(chunk)
        
        return True
        
    except socket.timeout:
        print(f"Timeout connecting to {target_ip}:{port}")
        return False
    except ConnectionRefusedError:
        print(f"Connection refused by {target_ip}:{port}")
        return False
    except Exception as e:
        print(f"Error sending file to {target_ip}: {e}")
        return False
    finally:
        if sock:
            sock.close()


def log_transfer(
    sender_ip: str,
    receiver_ip: str,
    filename: str,
    file_size: int,
    duration: float,
    status: str,
    logs_dir: str = "logs"
):
    """
    Log a file transfer to JSON file
    
    Args:
        sender_ip: IP address of sender
        receiver_ip: IP address of receiver
        filename: Name of the file
        file_size: Size of file in bytes
        duration: Transfer duration in seconds
        status: "success" or "failed"
        logs_dir: Directory to save logs
    """
    log_dir = Path(logs_dir)
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "transfer_logs.json"
    
    # Calculate metrics
    file_size_mb = round(file_size / (1024 * 1024), 2)
    duration_sec = round(duration, 2)
    speed_mbps = round(file_size_mb / duration_sec, 2) if duration_sec > 0 else 0
    
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        # Required format fields
        "sender": sender_ip,
        "receiver": receiver_ip,
        "file_name": filename,
        "file_size_MB": file_size_mb,
        "duration_sec": duration_sec,
        "speed_MBps": speed_mbps,
        # Additional fields for backward compatibility
        "sender_ip": sender_ip,
        "receiver_ip": receiver_ip,
        "filename": filename,
        "file_size": file_size,
        "file_size_mb": file_size_mb,
        "duration_seconds": duration_sec,
        "status": status,
        "transfer_rate_mbps": speed_mbps
    }
    
    # Read existing logs
    transfers = []
    if log_file.exists():
        try:
            with open(log_file, 'r') as f:
                data = json.load(f)
                transfers = data.get('transfers', [])
        except Exception:
            transfers = []
    
    # Append new log entry
    transfers.append(log_entry)
    
    # Write back
    try:
        with open(log_file, 'w') as f:
            json.dump({
                "updated_at": datetime.now().isoformat(),
                "total_transfers": len(transfers),
                "transfers": transfers
            }, f, indent=2)
    except Exception as e:
        print(f"Error writing transfer log: {e}")
