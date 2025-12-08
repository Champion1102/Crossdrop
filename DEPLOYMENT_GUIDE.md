# 🚀 Crossdrop Deployment Guide

Complete guide to deploy Crossdrop to production using Render (backend) and Vercel (frontend).

---

## 📋 Prerequisites

- [ ] GitHub account
- [ ] Render account (sign up at https://render.com)
- [ ] Vercel account (sign up at https://vercel.com)
- [ ] Your code pushed to a GitHub repository

---

## Part 1: Deploy Backend to Render 🔧

### Step 1: Prepare Backend Code

1. Make sure you're in the project root:
   ```bash
   cd /Users/zebra/agentic-projects/Crossdrop
   ```

2. Verify backend structure:
   ```bash
   ls backend/signaling-server/
   # Should see: src/, package.json, render.yaml
   ```

### Step 2: Push to GitHub

1. Initialize git if not already done:
   ```bash
   git init
   git add .
   git commit -m "Prepare for deployment"
   ```

2. Create a new repository on GitHub (https://github.com/new)
   - Name it: `crossdrop` or any name you prefer
   - Make it public or private (your choice)
   - Don't initialize with README (you already have one)

3. Push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/crossdrop.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy to Render

1. Go to https://render.com and sign in

2. Click **"New +"** → **"Web Service"**

3. Connect your GitHub repository:
   - Click "Connect account" if not connected
   - Select your `crossdrop` repository
   - Click "Connect"

4. Configure the service:
   ```
   Name: crossdrop-signaling-server
   Region: Oregon (or closest to you)
   Branch: main
   Root Directory: backend/signaling-server
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Plan: Free
   ```

5. Add Environment Variables:
   Click "Advanced" and add these:
   ```
   PORT = 10000
   NODE_ENV = production
   LOG_LEVEL = info
   CORS_ORIGIN = *
   HOST = 0.0.0.0
   ```

6. Click **"Create Web Service"**

7. Wait for deployment (5-10 minutes)

8. **SAVE YOUR BACKEND URL!** It will look like:
   ```
   https://crossdrop-signaling-server.onrender.com
   ```

9. Test your backend:
   - Visit: `https://YOUR_BACKEND_URL.onrender.com/health`
   - You should see JSON with status "ok"

---

## Part 2: Deploy Frontend to Vercel 🎨

### Step 1: Prepare Frontend Code

1. Update environment variables for production:
   ```bash
   cd frontend
   ```

2. Create `.env.production` file:
   ```bash
   cat > .env.production << 'EOF'
   # Production Environment Variables
   VITE_SIGNALING_URL=https://YOUR_BACKEND_URL.onrender.com
   VITE_ENABLE_DEBUG=false
   EOF
   ```

   **IMPORTANT:** Replace `YOUR_BACKEND_URL.onrender.com` with your actual Render URL from Part 1, Step 8!

3. Commit the changes:
   ```bash
   git add .env.production
   git commit -m "Add production environment variables"
   git push
   ```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the frontend directory:
   ```bash
   cd /Users/zebra/agentic-projects/Crossdrop/frontend
   vercel
   ```

4. Answer the prompts:
   ```
   ? Set up and deploy "~/agentic-projects/Crossdrop/frontend"? Y
   ? Which scope do you want to deploy to? [Your Account]
   ? Link to existing project? N
   ? What's your project's name? crossdrop
   ? In which directory is your code located? ./
   ```

5. Set environment variables:
   ```bash
   vercel env add VITE_SIGNALING_URL production
   # Paste: https://YOUR_BACKEND_URL.onrender.com

   vercel env add VITE_ENABLE_DEBUG production
   # Paste: false
   ```

6. Deploy to production:
   ```bash
   vercel --prod
   ```

#### Option B: Using Vercel Dashboard

1. Go to https://vercel.com and sign in

2. Click **"Add New..."** → **"Project"**

3. Import your GitHub repository:
   - Find your `crossdrop` repository
   - Click "Import"

4. Configure the project:
   ```
   Framework Preset: Vite
   Root Directory: frontend
   Build Command: npm run build (auto-detected)
   Output Directory: dist (auto-detected)
   Install Command: npm install (auto-detected)
   ```

5. Add Environment Variables:
   Click "Environment Variables" and add:
   ```
   VITE_SIGNALING_URL = https://YOUR_BACKEND_URL.onrender.com
   VITE_ENABLE_DEBUG = false
   ```

6. Click **"Deploy"**

7. Wait for deployment (2-5 minutes)

8. **SAVE YOUR FRONTEND URL!** It will look like:
   ```
   https://crossdrop.vercel.app
   ```

---

## Part 3: Test Your Deployment 🧪

### 1. Test Backend Health

Visit your backend URL:
```
https://YOUR_BACKEND_URL.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "uptime": 123.45,
  "peers": 0,
  "rooms": {
    "roomCount": 0,
    "totalPeers": 0,
    "maxRooms": 100,
    "maxPeersPerRoom": 10
  },
  "timestamp": "2025-12-08T..."
}
```

### 2. Test Frontend

1. Visit your frontend URL:
   ```
   https://crossdrop.vercel.app
   ```

2. You should see the Crossdrop landing page

3. Click "Start Transfer" → "Create Room"
   - Should generate a room code
   - Should show "Connected to room"

4. Open the same URL in another browser/device
   - Click "Join Room"
   - Enter the room code
   - Both devices should see each other

5. Test file transfer:
   - Select a small file
   - Select the peer
   - Click "Send"
   - File should transfer successfully

### 3. Check Browser Console

Open browser DevTools (F12) and check console:
- Should see: `WebSocket connected`
- Should see: `CrossDrop Config: {...}`
- Should NOT see any errors

---

## 🔧 Troubleshooting

### Backend Issues

**Problem:** Backend health check fails
- ✅ Check Render logs: Dashboard → Your Service → Logs
- ✅ Verify all environment variables are set
- ✅ Ensure `PORT` is set to `10000`

**Problem:** CORS errors
- ✅ Set `CORS_ORIGIN=*` in Render environment variables
- ✅ Redeploy backend

**Problem:** Render free tier sleeps
- ⚠️ Render free tier sleeps after 15 minutes of inactivity
- ⚠️ First request after sleep takes 30-60 seconds to wake up
- 💡 Consider upgrading to paid tier for production

### Frontend Issues

**Problem:** Cannot connect to backend
- ✅ Verify `VITE_SIGNALING_URL` is correctly set
- ✅ Check browser console for WebSocket errors
- ✅ Ensure backend URL has `https://` (not `http://`)
- ✅ Redeploy frontend after changing env vars

**Problem:** Build fails on Vercel
- ✅ Check Vercel build logs
- ✅ Verify `package.json` has correct scripts
- ✅ Ensure all dependencies are in `dependencies` (not `devDependencies`)

**Problem:** WebSocket connection fails
- ✅ Render free tier uses WebSocket - should work
- ✅ Check if backend is awake (visit `/health` first)
- ✅ Check browser console for specific error messages

---

## 📊 Monitoring

### Backend Monitoring

Check backend stats:
```
https://YOUR_BACKEND_URL.onrender.com/stats
```

Shows:
- Active peers
- Active rooms
- Memory usage
- Uptime

### Render Dashboard

Monitor:
- CPU usage
- Memory usage
- Deployment logs
- Request metrics

### Vercel Dashboard

Monitor:
- Deployment status
- Build logs
- Analytics (if enabled)
- Error tracking

---

## 🔄 Updates & Redeployment

### Update Backend

```bash
# Make changes to backend code
cd /Users/zebra/agentic-projects/Crossdrop
git add backend/
git commit -m "Update backend"
git push

# Render will automatically redeploy
```

### Update Frontend

```bash
# Make changes to frontend code
cd /Users/zebra/agentic-projects/Crossdrop
git add frontend/
git commit -m "Update frontend"
git push

# Vercel will automatically redeploy
```

### Manual Redeployment

**Render:**
- Dashboard → Your Service → Manual Deploy → "Deploy latest commit"

**Vercel:**
- Dashboard → Your Project → Deployments → "Redeploy"

---

## 💰 Cost Breakdown

### Free Tier Limits

**Render (Backend):**
- ✅ 750 hours/month free
- ✅ Sleeps after 15 min inactivity
- ✅ 512MB RAM
- ⚠️ Limited to 100 build hours/month

**Vercel (Frontend):**
- ✅ 100GB bandwidth/month
- ✅ No sleep time
- ✅ Automatic SSL
- ✅ Global CDN

Both should handle moderate traffic on free tier!

---

## 🎉 You're Done!

Your Crossdrop app is now live! Share your frontend URL with users:

```
https://crossdrop.vercel.app
```

Users can:
- Create rooms and share codes
- Transfer files peer-to-peer
- No file size limits (WebRTC direct transfer)
- End-to-end encrypted transfers

---

## 📝 Notes

- **Render Free Tier Sleep:** Backend sleeps after 15 minutes. First connection takes longer.
- **WebRTC NAT Traversal:** Uses STUN/TURN servers for connectivity (already configured)
- **Security:** All transfers are peer-to-peer and encrypted
- **Scalability:** Backend handles signaling only, not file data
- **Custom Domain:** Both Render and Vercel support custom domains (upgrade required)

---

## 🆘 Need Help?

- Backend logs: Render Dashboard → Your Service → Logs
- Frontend logs: Vercel Dashboard → Your Project → Deployments → View Function Logs
- Browser logs: DevTools → Console (F12)

Happy deploying! 🚀
