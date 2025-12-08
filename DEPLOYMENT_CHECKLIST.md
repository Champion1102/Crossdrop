# ✅ Deployment Checklist

Use this checklist to ensure smooth deployment!

## 📦 Pre-Deployment

- [ ] All code is tested locally and working
- [ ] `git` is installed
- [ ] GitHub account is created
- [ ] Render account is created (https://render.com)
- [ ] Vercel account is created (https://vercel.com)

## 🔧 Code Preparation

- [ ] `.gitignore` file exists in project root
- [ ] Environment variable examples are created:
  - [ ] `backend/signaling-server/.env.example`
  - [ ] `frontend/.env.example`
- [ ] `render.yaml` exists in backend directory
- [ ] `vercel.json` exists in frontend directory

## 📤 GitHub Setup

- [ ] Create new GitHub repository
- [ ] Initialize git in project:
  ```bash
  cd /Users/zebra/agentic-projects/Crossdrop
  git init
  git add .
  git commit -m "Initial commit - ready for deployment"
  ```
- [ ] Add GitHub remote:
  ```bash
  git remote add origin https://github.com/YOUR_USERNAME/crossdrop.git
  ```
- [ ] Push to GitHub:
  ```bash
  git push -u origin main
  ```
- [ ] Verify files are on GitHub (visit your repo URL)

## 🖥️ Backend Deployment (Render)

- [ ] Login to Render dashboard
- [ ] Click "New +" → "Web Service"
- [ ] Connect GitHub repository
- [ ] Configure service:
  - [ ] Name: `crossdrop-signaling-server`
  - [ ] Root Directory: `backend/signaling-server`
  - [ ] Build Command: `npm install`
  - [ ] Start Command: `npm start`
  - [ ] Plan: Free
- [ ] Add environment variables:
  - [ ] `PORT` = `10000`
  - [ ] `NODE_ENV` = `production`
  - [ ] `LOG_LEVEL` = `info`
  - [ ] `CORS_ORIGIN` = `*`
  - [ ] `HOST` = `0.0.0.0`
- [ ] Click "Create Web Service"
- [ ] Wait for deployment to complete (5-10 min)
- [ ] **Copy backend URL** (e.g., `https://crossdrop-signaling-server.onrender.com`)
- [ ] Test backend health:
  - [ ] Visit: `https://YOUR_BACKEND_URL/health`
  - [ ] Should see JSON with `"status": "ok"`

## 🎨 Frontend Deployment (Vercel)

### Option 1: Vercel CLI (Recommended)

- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Login: `vercel login`
- [ ] Navigate to frontend: `cd frontend`
- [ ] Deploy: `vercel`
- [ ] Answer prompts:
  - [ ] Deploy? **Yes**
  - [ ] Link to existing? **No**
  - [ ] Project name: `crossdrop`
- [ ] Add environment variables:
  ```bash
  vercel env add VITE_SIGNALING_URL production
  # Enter: https://YOUR_BACKEND_URL.onrender.com

  vercel env add VITE_ENABLE_DEBUG production
  # Enter: false
  ```
- [ ] Deploy to production: `vercel --prod`
- [ ] **Copy frontend URL** (e.g., `https://crossdrop.vercel.app`)

### Option 2: Vercel Dashboard

- [ ] Login to Vercel dashboard
- [ ] Click "Add New..." → "Project"
- [ ] Import GitHub repository
- [ ] Configure:
  - [ ] Framework: Vite (auto-detected)
  - [ ] Root Directory: `frontend`
  - [ ] Build Command: `npm run build`
  - [ ] Output Directory: `dist`
- [ ] Add environment variables:
  - [ ] `VITE_SIGNALING_URL` = `https://YOUR_BACKEND_URL.onrender.com`
  - [ ] `VITE_ENABLE_DEBUG` = `false`
- [ ] Click "Deploy"
- [ ] Wait for deployment (2-5 min)
- [ ] **Copy frontend URL**

## 🧪 Testing

### Backend Tests

- [ ] Visit health endpoint: `https://YOUR_BACKEND_URL/health`
  - [ ] Returns JSON with status "ok"
  - [ ] Shows 0 peers and 0 rooms
- [ ] Visit stats endpoint: `https://YOUR_BACKEND_URL/stats`
  - [ ] Returns detailed statistics
- [ ] Check Render logs for any errors

### Frontend Tests

- [ ] Visit frontend URL in browser
- [ ] Check browser console (F12) for errors
- [ ] Verify CrossDrop landing page loads
- [ ] Test "Create Room" flow:
  - [ ] Click "Start Transfer"
  - [ ] Click "Create Room"
  - [ ] Room code is displayed
  - [ ] Console shows "WebSocket connected"
  - [ ] Console shows "Connected to room"
- [ ] Test "Join Room" flow (in different browser/device):
  - [ ] Click "Start Transfer"
  - [ ] Click "Join Room"
  - [ ] Enter room code from first device
  - [ ] Click "Join"
  - [ ] Both devices show each other as connected
- [ ] Test file transfer:
  - [ ] Select a small test file (< 10MB)
  - [ ] Select the peer
  - [ ] Click "Send"
  - [ ] Other device receives file
  - [ ] File downloads automatically
  - [ ] File matches original

### Cross-Browser Testing

- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if on Mac)
- [ ] Mobile browser (iOS/Android)

### Connection Persistence Tests

- [ ] Switch browser tabs → Connection maintained
- [ ] Switch desktop windows → Connection maintained
- [ ] Minimize browser → Connection maintained
- [ ] Click "Back" button → Properly disconnects
- [ ] Leave room explicitly → Cleans up connection

## 🎉 Post-Deployment

- [ ] Save your URLs:
  - Backend: `https://__________________________.onrender.com`
  - Frontend: `https://__________________________.vercel.app`
- [ ] Share frontend URL with test users
- [ ] Monitor Render dashboard for backend health
- [ ] Monitor Vercel dashboard for frontend analytics
- [ ] Check logs regularly for first few days
- [ ] Set up status page monitoring (optional)

## 📊 Monitoring Setup

- [ ] Bookmark Render dashboard
- [ ] Bookmark Vercel dashboard
- [ ] Set up browser bookmark to backend `/health` endpoint
- [ ] Consider setting up UptimeRobot (optional, free monitoring)

## 🔄 Update Process

For future updates:

- [ ] Make changes locally
- [ ] Test thoroughly locally
- [ ] Commit changes: `git commit -m "Description"`
- [ ] Push to GitHub: `git push`
- [ ] Render auto-deploys backend ✅
- [ ] Vercel auto-deploys frontend ✅
- [ ] Verify deployment succeeded in dashboards
- [ ] Test production site

## 🆘 Troubleshooting Resources

If issues arise:

- [ ] Check `DEPLOYMENT_GUIDE.md` troubleshooting section
- [ ] Review Render logs (Dashboard → Service → Logs)
- [ ] Review Vercel logs (Dashboard → Project → Deployments)
- [ ] Check browser console (F12)
- [ ] Verify environment variables are set correctly
- [ ] Ensure backend URL uses `https://` not `http://`

## 📝 Notes

- ⏰ Render free tier: Backend sleeps after 15 min idle (normal)
- 🔄 First request after sleep: Takes 30-60 seconds (normal)
- 💾 Rooms are in-memory: Lost on backend restart (expected)
- 🌐 CORS is set to `*`: All origins allowed (fine for public app)
- 🔒 WebRTC transfers: Direct peer-to-peer (not via backend)

---

## ✅ Completion

When all items are checked:

🎉 **Congratulations!** Your Crossdrop app is live and ready for users!

Share your URL: `https://crossdrop.vercel.app` (or your custom domain)
