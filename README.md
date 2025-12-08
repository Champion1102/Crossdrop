
# 🕊️ Crossdrop

**Peer-to-peer file sharing made simple, secure, and beautiful.**

Share files directly between devices without limits. No clouds, no tracking, just freedom.

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com)
[![Deploy to Render](https://render.com/deploy/button)](https://render.com)

---

## ✨ Features

- 🔒 **End-to-End Encrypted** - Files transfer directly peer-to-peer via WebRTC
- 🚫 **No File Size Limits** - Transfer files of any size
- ⚡ **Lightning Fast** - Direct device-to-device transfer, no server storage
- 🌐 **Browser-Based** - No installation required, works on any modern browser
- 📱 **Cross-Platform** - Desktop, mobile, tablet - if it has a browser, it works
- 🎨 **Beautiful UI** - Artistic sky-themed design with smooth animations
- 🔐 **Privacy First** - No file storage, no tracking, no data collection
- 🌍 **Works Globally** - Connect devices across different networks using STUN/TURN

---

## 🚀 Quick Start

### For Users

1. Visit the hosted app: **[Your Deployed URL]**
2. Click **"Start Transfer"**
3. **Create Room** to share files OR **Join Room** with a code
4. Select a file and send!

### For Developers

#### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/crossdrop.git
cd crossdrop

# Start backend signaling server
cd backend/signaling-server
npm install
npm start
# Server runs on http://localhost:3001

# In a new terminal, start frontend
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

Visit `http://localhost:5173` and start sharing!

---

## 📦 Project Structure

```
crossdrop/
├── frontend/                 # React + Vite web application
│   ├── src/
│   │   ├── pages/           # Page components (Home, BrowserTransfer)
│   │   ├── services/        # WebRTC service
│   │   ├── api/             # Signaling API client
│   │   └── config.js        # Configuration
│   ├── public/              # Static assets
│   └── package.json
│
├── backend/
│   └── signaling-server/    # WebSocket signaling server
│       ├── src/
│       │   ├── handlers/    # WebSocket message handlers
│       │   ├── services/    # Room & peer management
│       │   ├── utils/       # Logging & utilities
│       │   └── server.js    # HTTP + WebSocket server
│       └── package.json
│
└── docs/                     # Documentation
    ├── DEPLOYMENT_GUIDE.md
    ├── QUICK_START.md
    └── DEPLOYMENT_CHECKLIST.md
```

---

## 🛠️ Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool & dev server
- **Tailwind CSS 4** - Styling
- **Framer Motion** - Animations
- **React Router** - Navigation
- **React Hot Toast** - Notifications

### Backend
- **Node.js** - Runtime
- **ws** - WebSocket library
- **Native HTTP** - Lightweight server

### Infrastructure
- **WebRTC** - Peer-to-peer data transfer
- **STUN/TURN** - NAT traversal (via public servers)
- **Vercel** - Frontend hosting
- **Render** - Backend hosting

---

## 🌐 Deployment

Deploy your own instance in minutes!

### Prerequisites
- GitHub account
- [Render](https://render.com) account (for backend)
- [Vercel](https://vercel.com) account (for frontend)

### Deploy Backend (Render)

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repository
4. Configure:
   - **Root Directory:** `backend/signaling-server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables:
   ```
   PORT=10000
   NODE_ENV=production
   CORS_ORIGIN=*
   ```
6. Deploy! 🚀

### Deploy Frontend (Vercel)

```bash
cd frontend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variable with your Render backend URL
vercel env add VITE_SIGNALING_URL production
# Enter: https://your-backend-url.onrender.com

# Deploy to production
vercel --prod
```

**Detailed Instructions:** See [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md)

---

## 🔧 Configuration

### Frontend Environment Variables

Create `frontend/.env.production`:

```env
VITE_SIGNALING_URL=https://your-backend-url.onrender.com
VITE_ENABLE_DEBUG=false
```

### Backend Environment Variables

Create `backend/signaling-server/.env`:

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=*
```

---

## 🧪 How It Works

1. **User creates/joins room** → Frontend connects to signaling server via WebSocket
2. **Room code shared** → Other user joins with the same code
3. **WebRTC negotiation** → Signaling server facilitates peer connection setup
4. **Direct connection established** → Peers connect directly using STUN/TURN for NAT traversal
5. **File transfer** → Files are transferred directly peer-to-peer, encrypted end-to-end
6. **No server storage** → Files never touch the server, only signaling messages do

### Security

- ✅ **End-to-End Encryption**: WebRTC DataChannel uses DTLS-SRTP
- ✅ **No Server Storage**: Files never stored on any server
- ✅ **Peer-to-Peer**: Direct device-to-device transfer
- ✅ **Ephemeral Rooms**: Rooms exist only during active connections
- ✅ **No Tracking**: No user data collection or analytics

---

## 📱 Browser Support

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome  | ✅      | ✅     |
| Edge    | ✅      | ✅     |
| Firefox | ✅      | ✅     |
| Safari  | ✅      | ✅     |
| Opera   | ✅      | ✅     |

**Requirements:**
- Modern browser with WebRTC support
- JavaScript enabled
- Cookies/LocalStorage enabled

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Test thoroughly before submitting
- Update documentation as needed
- Keep commits atomic and descriptive

---

## 🐛 Troubleshooting

### Connection Issues

**Problem:** Cannot connect to room
- ✅ Check if backend is running/awake (visit `/health` endpoint)
- ✅ Verify `VITE_SIGNALING_URL` is correct
- ✅ Check browser console for errors
- ✅ Ensure WebSocket connection is not blocked by firewall

**Problem:** Files not transferring
- ✅ Check WebRTC connection status in browser console
- ✅ Ensure both peers are on the same room
- ✅ Try refreshing both browsers
- ✅ Check if browser has camera/microphone permissions (for WebRTC)

**Problem:** Room not found
- ✅ Ensure room code is correct (case-sensitive)
- ✅ Check if room creator is still connected
- ✅ Backend may have restarted (rooms are in-memory)

### Deployment Issues

See [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) for detailed troubleshooting.

---

## 📊 Performance

- **Transfer Speed**: Limited by network bandwidth, not by server
- **Concurrent Users**: Backend handles signaling only, scales horizontally
- **File Size**: No limits (WebRTC DataChannel)
- **Latency**: Direct peer connection = minimal latency

### Free Tier Limits

**Render (Backend):**
- 750 hours/month
- Sleeps after 15 min idle
- First request after sleep: 30-60 seconds

**Vercel (Frontend):**
- 100GB bandwidth/month
- No sleep
- Global CDN

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **WebRTC** - The technology that makes peer-to-peer transfer possible
- **OpenRelay** - Free TURN servers for NAT traversal
- **Google** - Free STUN servers
- **React** - Amazing UI framework
- **Vite** - Lightning-fast build tool

---

## 📞 Support

- 📖 Documentation: See `/docs` folder
- 🐛 Bug Reports: [GitHub Issues](https://github.com/YOUR_USERNAME/crossdrop/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/YOUR_USERNAME/crossdrop/discussions)

---

## 🗺️ Roadmap

- [ ] Room expiry with custom timeout
- [ ] Multiple file transfers
- [ ] Folder sharing
- [ ] Transfer history (local only)
- [ ] Custom TURN server configuration
- [ ] Progressive Web App (PWA)
- [ ] QR code for room sharing
- [ ] Password-protected rooms
- [ ] File preview before accepting

---

## ⭐ Star History

If you find Crossdrop useful, please star this repository!

---

<p align="center">
  Made with ❤️ for the open web
  <br>
  <sub>Privacy-first • No tracking • Open source</sub>
</p>
