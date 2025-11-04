#!/usr/bin/env python3
"""
Test script to manually send a broadcast and see if it's received
Run this on one device to test if broadcasts are working
"""
import socket
import json
from utils.network_utils import get_local_ip, get_device_name, get_broadcast_address

BROADCAST_PORT = 8888

def test_broadcast():
    local_ip = get_local_ip()
    device_name = get_device_name()
    
    print(f"Device: {device_name}")
    print(f"IP: {local_ip}")
    print(f"Subnet broadcast: {get_broadcast_address()}")
    print(f"\nSending test broadcast...")
    
    message = {
        "device_name": device_name,
        "ip": local_ip
    }
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    
    # Try both addresses
    for addr in ['255.255.255.255', get_broadcast_address()]:
        try:
            data = json.dumps(message).encode('utf-8')
            sock.sendto(data, (addr, BROADCAST_PORT))
            print(f"✓ Sent to {addr}:{BROADCAST_PORT}")
        except Exception as e:
            print(f"✗ Failed to send to {addr}: {e}")
    
    sock.close()
    print("\nTest broadcast sent. Check the other device to see if it was received.")

if __name__ == "__main__":
    test_broadcast()

