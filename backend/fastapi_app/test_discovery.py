#!/usr/bin/env python3
"""
Simple test script for device discovery
Run this while the FastAPI server is running
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_discovery():
    print("=" * 50)
    print("Testing CrossDrop Device Discovery")
    print("=" * 50)
    
    # Test 1: Root endpoint
    print("\n1. Testing root endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"   ✓ Status: {response.status_code}")
        print(f"   ✓ Response: {response.json()}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
        return
    
    # Test 2: Discovery status
    print("\n2. Testing discovery status...")
    try:
        response = requests.get(f"{BASE_URL}/discover/status")
        data = response.json()
        print(f"   ✓ Status: {response.status_code}")
        print(f"   ✓ Discovery Status: {data.get('status')}")
        print(f"   ✓ Local IP: {data.get('local_ip')}")
        print(f"   ✓ Device Name: {data.get('device_name')}")
        print(f"   ✓ Scanning: {data.get('scanning')}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
        return
    
    # Test 3: Get peers (initially empty)
    print("\n3. Testing peers endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/discover/peers")
        data = response.json()
        print(f"   ✓ Status: {response.status_code}")
        print(f"   ✓ Peer Count: {data.get('count', 0)}")
        print(f"   ✓ Peers: {json.dumps(data.get('peers', []), indent=6)}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
        return
    
    # Test 4: Monitor peers for 10 seconds
    print("\n4. Monitoring for discovered peers (10 seconds)...")
    print("   (Start another server instance on a different device/port to see peers)")
    for i in range(5):
        try:
            response = requests.get(f"{BASE_URL}/discover/peers")
            data = response.json()
            count = data.get('count', 0)
            if count > 0:
                print(f"   ✓ Found {count} peer(s)!")
                for peer in data.get('peers', []):
                    print(f"     - {peer.get('device_name')} ({peer.get('ip')})")
                    print(f"       Last seen: {peer.get('last_seen')}")
            else:
                print(f"   Waiting... ({i+1}/5) - No peers yet")
        except Exception as e:
            print(f"   ✗ Error: {e}")
        
        if i < 4:
            time.sleep(2)
    
    # Test 5: Check logs
    print("\n5. Checking peer logs...")
    try:
        from pathlib import Path
        logs_file = Path("logs/peers.json")
        if logs_file.exists():
            with open(logs_file) as f:
                logs = json.load(f)
            print(f"   ✓ Logs file exists")
            print(f"   ✓ Last updated: {logs.get('updated_at')}")
            print(f"   ✓ Logged peers: {len(logs.get('peers', []))}")
        else:
            print(f"   ⚠ Logs file not found yet (will be created when peers are discovered)")
    except Exception as e:
        print(f"   ⚠ Could not check logs: {e}")
    
    print("\n" + "=" * 50)
    print("Testing complete!")
    print("=" * 50)
    print("\nTo test with multiple devices:")
    print("1. Start server on Device 1: uvicorn main:app --port 8000")
    print("2. Start server on Device 2: uvicorn main:app --port 8001")
    print("3. Run this script on both devices")
    print("4. They should discover each other within a few seconds!")

if __name__ == "__main__":
    test_discovery()

