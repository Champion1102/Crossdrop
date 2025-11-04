"""
Test script to diagnose connection issues between devices
"""
import socket
import requests
import sys
from utils.network_utils import get_local_ip

def test_tcp_connection(target_ip, port, timeout=5):
    """Test if a TCP connection can be established"""
    print(f"\n🔍 Testing TCP connection to {target_ip}:{port}...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((target_ip, port))
        sock.close()
        if result == 0:
            print(f"✅ TCP connection successful!")
            return True
        else:
            print(f"✗ TCP connection failed (error code: {result})")
            return False
    except socket.timeout:
        print(f"✗ TCP connection timed out after {timeout}s")
        return False
    except Exception as e:
        print(f"✗ TCP connection error: {e}")
        return False

def test_http_connection(target_ip, port=8000, timeout=5):
    """Test if HTTP endpoint is reachable"""
    print(f"\n🔍 Testing HTTP connection to http://{target_ip}:{port}...")
    try:
        url = f"http://{target_ip}:{port}/debug/status"
        response = requests.get(url, timeout=timeout)
        if response.status_code == 200:
            print(f"✅ HTTP connection successful! (Status: {response.status_code})")
            return True
        else:
            print(f"⚠ HTTP returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError as e:
        print(f"✗ HTTP connection refused - Server might not be running or firewall blocking")
        return False
    except requests.exceptions.Timeout:
        print(f"✗ HTTP connection timed out after {timeout}s")
        return False
    except Exception as e:
        print(f"✗ HTTP connection error: {e}")
        return False

def test_ping(target_ip):
    """Test if device is reachable (ICMP ping)"""
    import subprocess
    import platform
    print(f"\n🔍 Testing ping to {target_ip}...")
    try:
        # Determine ping command based on OS
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        command = ['ping', param, '1', target_ip]
        
        result = subprocess.run(command, capture_output=True, timeout=5)
        if result.returncode == 0:
            print(f"✅ Ping successful!")
            return True
        else:
            print(f"✗ Ping failed")
            return False
    except subprocess.TimeoutExpired:
        print(f"✗ Ping timed out")
        return False
    except Exception as e:
        print(f"⚠ Ping test unavailable: {e}")
        return None

def main():
    print("=" * 60)
    print("CrossDrop Connection Diagnostic Tool")
    print("=" * 60)
    
    local_ip = get_local_ip()
    print(f"\n📍 Your local IP: {local_ip}")
    
    if len(sys.argv) < 2:
        print("\nUsage: python test_connection.py <target_ip>")
        print("Example: python test_connection.py 10.7.11.246")
        sys.exit(1)
    
    target_ip = sys.argv[1]
    print(f"🎯 Target IP: {target_ip}")
    
    # Run tests
    results = {
        "ping": test_ping(target_ip),
        "tcp_8000": test_tcp_connection(target_ip, 8000),
        "tcp_9000": test_tcp_connection(target_ip, 9000),
        "http_8000": test_http_connection(target_ip, 8000)
    }
    
    # Summary
    print("\n" + "=" * 60)
    print("Diagnostic Summary")
    print("=" * 60)
    print(f"Ping:        {'✅' if results['ping'] else '❌' if results['ping'] is False else '⚠️  N/A'}")
    print(f"TCP 8000:    {'✅' if results['tcp_8000'] else '❌'}")
    print(f"TCP 9000:    {'✅' if results['tcp_9000'] else '❌'}")
    print(f"HTTP 8000:   {'✅' if results['http_8000'] else '❌'}")
    
    print("\n💡 Recommendations:")
    if not results['ping']:
        print("   • Device might be offline or on different network")
    elif not results['tcp_8000']:
        print("   • Port 8000 might be blocked by firewall")
        print("   • Check if backend is running on target device")
        print("   • On macOS: System Settings > Network > Firewall")
    elif not results['http_8000']:
        print("   • Backend might not be running or not bound to 0.0.0.0")
        print("   • Check target device's terminal for uvicorn logs")
    else:
        print("   ✅ All tests passed! Connection should work.")

if __name__ == "__main__":
    main()

