# 🎨 Crossdrop Frontend

Beautiful, artistic web interface for peer-to-peer file sharing.

## 📖 Overview

The Crossdrop frontend is a React-based single-page application that provides:
- Elegant sky-themed UI with smooth animations
- WebRTC-powered peer-to-peer file transfers
- Room-based connection management
- Real-time transfer progress
- Mobile-responsive design

---

## 🚀 Quick Start

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open browser
# Visit http://localhost:5173
```

### Build for Production

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

Build output goes to `dist/` directory.

---

## ⚙️ Configuration

### Environment Variables

Create `.env.local` for development:

```env
# Signaling server URL
VITE_SIGNALING_URL=http://localhost:3001

# Enable debug mode
VITE_ENABLE_DEBUG=true
```

Create `.env.production` for production:

```env
# Your deployed signaling server
VITE_SIGNALING_URL=https://your-backend.onrender.com

# Disable debug in production
VITE_ENABLE_DEBUG=false
```

---

## 🚀 Deployment

See the main project `DEPLOYMENT_GUIDE.md` for complete deployment instructions.

Quick deploy to Vercel:

```bash
cd frontend
npm install -g vercel
vercel login
vercel
```

---

## 📝 License

MIT License - Part of the Crossdrop project
