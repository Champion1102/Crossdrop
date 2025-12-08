## How WebRTC Connectivity Works

**1. Same WiFi/LAN (easiest case)**
- Direct peer-to-peer connection
- Fastest transfer speeds
- No external servers needed for the actual data transfer

**2. Different Networks (common case)**
- Still works! WebRTC uses **ICE (Interactive Connectivity Establishment)** to figure out the best path
- **STUN servers** help peers discover their public IPs and punch through NAT
- Most home/office networks allow this "NAT traversal"

**3. Restrictive Networks (firewalls, symmetric NAT)**
- When direct connection fails, traffic goes through a **TURN relay server**
- Slower (since data bounces through a server) but ensures connectivity
- You'll need to either self-host or pay for TURN server infrastructure

## What You'll Need

```
┌─────────┐     Signaling Server      ┌─────────┐
│ Peer A  │ ←──── (WebSocket) ────→  │ Peer B  │
└────┬────┘                           └────┬────┘
     │                                      │
     │    Direct P2P (or via TURN relay)    │
     └──────────────────────────────────────┘
```

- **Signaling server**: To exchange connection metadata (SDP offers, ICE candidates) — can be a simple WebSocket server
- **STUN server**: Free public ones exist (Google runs `stun:stun.l.google.com:19302`)
- **TURN server**: Needed for reliability — services like Twilio, Cloudflare, or self-hosted (coturn)

## Practical Tip

For a production file-sharing app, always include TURN as a fallback. Without it, ~10-15% of connections will fail due to restrictive network conditions.
