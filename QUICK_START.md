# ⚡ Quick Start - Crossdrop Deployment

Too long to read? Here's the TL;DR version!

## 🎯 Overview

- **Backend (Signaling Server)** → Render (Free)
- **Frontend (Web App)** → Vercel (Free)

## 📝 Quick Commands

### 1. Push to GitHub

```bash
cd /Users/zebra/agentic-projects/Crossdrop

# Initialize and push
git add .
git commit -m "Ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/crossdrop.git
git push -u origin main
```

### 2. Deploy Backend (Render)

1. Go to https://render.com → New + → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Root Directory:** `backend/signaling-server`
   - **Build:** `npm install`
   - **Start:** `npm start`
4. Environment Variables:
   ```
   PORT=10000
   NODE_ENV=production
   LOG_LEVEL=info
   CORS_ORIGIN=*
   HOST=0.0.0.0
   ```
5. Click "Create Web Service"
6. Copy your backend URL (e.g., `https://crossdrop-xxx.onrender.com`)

### 3. Deploy Frontend (Vercel)

```bash
cd frontend

# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Set environment variables
vercel env add VITE_SIGNALING_URL production
# Enter: https://YOUR-BACKEND-URL.onrender.com

vercel env add VITE_ENABLE_DEBUG production
# Enter: false

# Deploy to production
vercel --prod
```

### 4. Test It!

1. Visit your Vercel URL (e.g., `https://crossdrop.vercel.app`)
2. Click "Start Transfer" → "Create Room"
3. Open in another browser/device → "Join Room"
4. Try sending a file!

## ⚠️ Important Notes

- **Backend Sleep:** Render free tier sleeps after 15 min idle. First request takes 30-60s to wake up.
- **Environment Variables:** Double-check `VITE_SIGNALING_URL` points to your Render backend URL
- **HTTPS Required:** Make sure to use `https://` not `http://` for the signaling URL

## 🐛 Common Issues

**"Cannot connect to room"**
→ Check backend is awake by visiting `/health` endpoint

**"WebSocket connection failed"**
→ Verify `VITE_SIGNALING_URL` is correct in Vercel env vars

**"Room not found"**
→ Backend might have restarted (rooms are in-memory). This is normal on free tier.

## 📖 Full Guide

For detailed instructions, troubleshooting, and monitoring: See `DEPLOYMENT_GUIDE.md`

---

That's it! You're live in ~15 minutes! 🎉
