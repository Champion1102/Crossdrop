"""
File transfer routes for TCP socket-based file sharing
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import os
import time
from pathlib import Path

from utils.file_handler import (
    send_file, 
    send_file_from_stream, 
    send_file_chunked_streaming,
    log_transfer,
    LARGE_FILE_THRESHOLD
)
from utils.transfer_service import TransferService
from utils.network_utils import get_local_ip
from utils.transfer_progress import progress_tracker
import uuid

# Global transfer service instance (will be set by main.py)
transfer_service: TransferService = None
connection_manager = None


def set_transfer_service(service: TransferService):
    """Set the transfer service instance"""
    global transfer_service
    transfer_service = service


def set_connection_manager(manager):
    """Set the connection manager instance for security validation"""
    global connection_manager
    connection_manager = manager


router = APIRouter(prefix="/transfer", tags=["transfer"])


class SendFileRequest(BaseModel):
    target_ip: str
    file_path: str


class CancelTransferRequest(BaseModel):
    transfer_id: str


@router.post("/send-file")
async def send_file_endpoint(request: SendFileRequest):
    """
    Send a file to a target device via TCP socket
    
    Request body:
    {
        "target_ip": "10.7.8.187",
        "file_path": "/path/to/file.txt"
    }
    """
    target_ip = request.target_ip
    file_path = request.file_path
    
    # SECURITY: Only allow sending to connected peers
    if connection_manager:
        if not connection_manager.is_connected(target_ip):
            raise HTTPException(
                status_code=403,
                detail=f"Not connected to {target_ip}. You must accept a connection request before sending files."
            )
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail=f"Path is not a file: {file_path}")
    
    local_ip = get_local_ip()
    filename = Path(file_path).name
    file_size = os.path.getsize(file_path)
    
    start_time = time.time()
    
    try:
        success = send_file(target_ip, file_path)
        duration = time.time() - start_time
        
        if success:
            # Log successful transfer
            log_transfer(
                sender_ip=local_ip,
                receiver_ip=target_ip,
                filename=filename,
                file_size=file_size,
                duration=duration,
                status="success"
            )
            
            return {
                "status": "success",
                "message": f"File sent successfully to {target_ip}",
                "filename": filename,
                "file_size": file_size,
                "duration_seconds": round(duration, 2),
                "target_ip": target_ip
            }
        else:
            # Log failed transfer
            log_transfer(
                sender_ip=local_ip,
                receiver_ip=target_ip,
                filename=filename,
                file_size=file_size,
                duration=duration,
                status="failed"
            )
            
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send file to {target_ip}. Check if receiver is listening."
            )
    except Exception as e:
        duration = time.time() - start_time
        log_transfer(
            sender_ip=local_ip,
            receiver_ip=target_ip,
            filename=filename,
            file_size=file_size,
            duration=duration,
            status="failed"
        )
        raise HTTPException(status_code=500, detail=f"Error sending file: {str(e)}")


@router.post("/send")
async def send_file_upload(
    file: UploadFile = File(...),
    target_ip: str = Form(...)
):
    """
    Stream an uploaded file directly to target device via TCP socket (no temporary storage)
    Accepts multipart form data with 'file' and 'target_ip' fields
    
    NOTE: The browser uploads the file to this FastAPI server first (HTTP multipart upload).
    Then this handler streams it directly to the TCP socket. For very large files, you may
    see "Uploading to server" progress briefly before the actual TCP transfer begins.
    FastAPI's UploadFile.read() allows streaming, but the initial HTTP upload phase
    is unavoidable with FormData uploads.
    """
    if not target_ip or target_ip.strip() == "":
        raise HTTPException(status_code=400, detail="target_ip is required")
    
    # SECURITY: Only allow sending to connected peers
    if connection_manager:
        if not connection_manager.is_connected(target_ip):
            raise HTTPException(
                status_code=403,
                detail=f"Not connected to {target_ip}. You must accept a connection request before sending files."
            )
    
    local_ip = get_local_ip()
    filename = file.filename or "unnamed_file"
    
    # Get file size from Content-Length header if available, otherwise read file
    file_size = 0
    try:
        # Try to get size from Content-Length header (more efficient)
        if hasattr(file, 'size') and file.size:
            file_size = file.size
        elif hasattr(file, 'headers'):
            content_length = file.headers.get('content-length')
            if content_length:
                file_size = int(content_length)
    except Exception:
        pass
    
    try:
        start_time = time.time()
        
        # Create transfer ID for progress tracking
        transfer_id = str(uuid.uuid4())
        progress_tracker.create_transfer(
            transfer_id=transfer_id,
            direction='send',
            sender_ip=local_ip,
            receiver_ip=target_ip,
            filename=filename,
            file_size=file_size
        )
        
        # Progress callback
        def update_send_progress(bytes_sent: int):
            progress_tracker.update_progress(transfer_id, bytes_sent)
        
        # Socket storage callback for cancellation
        def store_socket(sock):
            progress_tracker.set_socket(transfer_id, sock)
        
        # Adaptive approach: use different methods based on file size
        if file_size > LARGE_FILE_THRESHOLD:
            # Large files (>100MB): Use optimized chunked streaming
            # This uses constant memory (~64KB-128KB) regardless of file size
            print(f"📦 Large file detected ({file_size / (1024*1024):.2f} MB). Using optimized chunked streaming...")
            
            # Stream directly from upload to TCP socket (no full file in memory)
            success = await send_file_chunked_streaming(
                target_ip=target_ip,
                file_upload=file,
                filename=filename,
                file_size=file_size,
                progress_callback=update_send_progress,
                socket_store_callback=store_socket
            )
        elif file_size == 0:
            # Unknown file size: Use chunked streaming as safe default
            # We'll count bytes as we stream and update file_size for logging
            print(f"📦 File size unknown. Using optimized chunked streaming...")
            
            # Create wrapper to track actual size during streaming
            class SizeTrackingUploadFile:
                def __init__(self, upload_file):
                    self.upload_file = upload_file
                    self.total_bytes = 0
                
                async def read(self, size):
                    chunk = await self.upload_file.read(size)
                    if chunk:
                        self.total_bytes += len(chunk)
                    return chunk
            
            tracking_file = SizeTrackingUploadFile(file)
            
            success = await send_file_chunked_streaming(
                target_ip=target_ip,
                file_upload=tracking_file,
                filename=filename,
                file_size=0,  # Unknown, will stream until EOF
                progress_callback=update_send_progress,
                socket_store_callback=store_socket
            )
            
            # Update file_size for logging and progress tracker
            file_size = tracking_file.total_bytes
            progress_tracker.update_progress(transfer_id, file_size)
        else:
            # Small files (<100MB): Use fast in-memory approach
            # Read entire file into memory (fast for small files)
            file_content = await file.read()
            file_size = len(file_content)
            
            if file_size == 0:
                progress_tracker.remove_transfer(transfer_id)
                raise HTTPException(status_code=400, detail="Cannot send empty file")
            
            # Update progress tracker with actual file size
            progress_tracker.update_progress(transfer_id, file_size)
            
            # Send from memory (fast for small files, no overhead)
            success = send_file_from_stream(
                target_ip=target_ip,
                file_stream=file_content,
                filename=filename,
                file_size=file_size,
                use_optimized=False,  # Use standard chunk size for small files
                progress_callback=update_send_progress,
                socket_store_callback=store_socket
            )
        
        duration = time.time() - start_time
        
        if success:
            progress_tracker.complete_transfer(transfer_id)
            # Log successful transfer
            log_transfer(
                sender_ip=local_ip,
                receiver_ip=target_ip,
                filename=filename,
                file_size=file_size,
                duration=duration,
                status="success"
            )
            
            return {
                "status": "success",
                "message": f"File sent successfully to {target_ip}",
                "filename": filename,
                "file_size": file_size,
                "duration_seconds": round(duration, 2),
                "target_ip": target_ip
            }
        else:
            progress_tracker.fail_transfer(transfer_id)
            # Log failed transfer
            log_transfer(
                sender_ip=local_ip,
                receiver_ip=target_ip,
                filename=filename,
                file_size=file_size,
                duration=duration,
                status="failed"
            )
            
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send file to {target_ip}. Check if receiver is listening."
            )
        
    except HTTPException:
        raise
    except Exception as e:
        progress_tracker.fail_transfer(transfer_id)
        duration = time.time() - start_time if 'start_time' in locals() else 0
        log_transfer(
            sender_ip=local_ip,
            receiver_ip=target_ip,
            filename=filename,
            file_size=file_size if 'file_size' in locals() else 0,
            duration=duration,
            status="failed"
        )
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/receive")
async def start_receive():
    """
    Start the TCP file transfer server (runs in background thread)
    Returns status of the receiver
    """
    if transfer_service is None:
        raise HTTPException(status_code=500, detail="Transfer service not initialized")
    
    if not transfer_service.running:
        transfer_service.start()
    
    return {
        "status": "active" if transfer_service.running else "inactive",
        "message": "File receiver is running" if transfer_service.running else "File receiver is not running",
        "port": transfer_service.TRANSFER_PORT,
        "local_ip": transfer_service.local_ip,
        "received_count": transfer_service.received_count
    }


@router.get("/history")
async def transfer_history():
    """Get transfer history (logged in JSON)"""
    import json
    from pathlib import Path
    
    log_file = Path("logs/transfer_logs.json")
    
    if not log_file.exists():
        return {"transfers": [], "total": 0}
    
    try:
        with open(log_file, 'r') as f:
            data = json.load(f)
            transfers = data.get('transfers', [])
            
        return {
            "transfers": transfers,
            "total": len(transfers),
            "updated_at": data.get('updated_at', '')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading transfer logs: {str(e)}")


@router.get("/logs")
async def get_logs():
    """
    Get transfer logs (alias for /history, matches required endpoint name)
    Returns transfer history in the required format
    """
    return await transfer_history()


@router.get("/status")
async def transfer_status():
    """Get transfer service status"""
    if transfer_service is None:
        return {
            "status": "inactive",
            "error": "Transfer service not initialized"
        }
    
    return {
        "status": "active" if transfer_service.running else "inactive",
        "port": transfer_service.TRANSFER_PORT,
        "local_ip": transfer_service.local_ip,
        "received_count": transfer_service.received_count
    }


@router.get("/progress")
async def get_transfer_progress(local_ip: str = None):
    """Get current transfer progress for sending or receiving"""
    if not local_ip:
        local_ip = get_local_ip()
    
    # Get all active transfers for this IP (both sending and receiving)
    # Filter out cancelled and completed transfers - only return active ones
    all_sending = progress_tracker.get_transfers_by_ip(local_ip, direction='send')
    all_receiving = progress_tracker.get_transfers_by_ip(local_ip, direction='receive')
    
    # Only return active transfers (not cancelled, completed, or failed)
    sending = [t for t in all_sending if t.get('status') == 'active']
    receiving = [t for t in all_receiving if t.get('status') == 'active']

    return {
        "sending": sending,
        "receiving": receiving
    }


@router.post("/cancel")
async def cancel_transfer(request: CancelTransferRequest):
    """Cancel an active file transfer"""
    if not request.transfer_id:
        raise HTTPException(status_code=400, detail="transfer_id is required")
    
    success = progress_tracker.cancel_transfer(request.transfer_id)
    
    if success:
        return {
            "status": "cancelled",
            "message": f"Transfer {request.transfer_id} has been cancelled"
        }
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Transfer {request.transfer_id} not found or already completed"
        )
