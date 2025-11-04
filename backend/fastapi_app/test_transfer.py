#!/usr/bin/env python3
"""
Test script for file transfer
"""
import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

def test_transfer():
    print("=" * 50)
    print("Testing CrossDrop File Transfer")
    print("=" * 50)
    
    # Test 1: Check transfer status
    print("\n1. Checking transfer service status...")
    try:
        response = requests.get(f"{BASE_URL}/transfer/status")
        data = response.json()
        print(f"   ✓ Status: {data.get('status')}")
        print(f"   ✓ Port: {data.get('port')}")
        print(f"   ✓ Local IP: {data.get('local_ip')}")
        print(f"   ✓ Received files: {data.get('received_count', 0)}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
        return
    
    # Test 2: Check receive endpoint
    print("\n2. Checking receiver status...")
    try:
        response = requests.get(f"{BASE_URL}/transfer/receive")
        data = response.json()
        print(f"   ✓ Receiver: {data.get('status')}")
        print(f"   ✓ Message: {data.get('message')}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 3: Check transfer history
    print("\n3. Checking transfer history...")
    try:
        response = requests.get(f"{BASE_URL}/transfer/history")
        data = response.json()
        print(f"   ✓ Total transfers: {data.get('total', 0)}")
        if data.get('transfers'):
            latest = data['transfers'][-1]
            print(f"   ✓ Latest: {latest.get('filename')} ({latest.get('status')})")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    print("\n" + "=" * 50)
    print("To send a file, use:")
    print("  POST /transfer/send-file")
    print('  {"target_ip": "10.7.8.187", "file_path": "/path/to/file.txt"}')
    print("=" * 50)

if __name__ == "__main__":
    test_transfer()

