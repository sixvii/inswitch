# 🚀 Deployment Guide: Firebase + Render

## ✅ OVERVIEW

```
Your Current Setup (Local):
  Frontend (React)    → Backend (Node.js)    → MongoDB (Docker)
  localhost:8080        localhost:5001         localhost:27017

After Deployment:
  Firebase Hosting    → Render Backend        → MongoDB Atlas
  trustpay.web.app      trustpay.onrender.com   cloud database
```

---

## 📋 DEPLOYMENT CHECKLIST

### Phase 1: Prepare MongoDB Cloud (5 minutes)
### Phase 2: Deploy Backend to Render (10 minutes)
### Phase 3: Configure Frontend Environment (2 minutes)
### Phase 4: Deploy Frontend to Firebase (5 minutes)
### Total: ~22 minutes

---

## 🗄️ PHASE 1: SETUP MONGODB ATLAS (Cloud Database)

### Step 1: Create MongoDB Atlas Account (Free Tier)
```bash
1. Go to: https://www.mongodb.com/cloud/atlas
2. Click "Register"
3. Sign up with email
4. Verify email
5. Complete setup wizard
```

### Step 2: Create a Free Cluster
```
• Select free tier (M0)
• Cloud provider: AWS
• Region: us-east-1 (for latency to Render)
• Cluster name: "trustpay"
• Create cluster
```

### Step 3: Create Database User
```
Security → Database Access
• Username: trustpay_app
• Password: [Generate strong password, SAVE IT]
• Built-in role: "Read and write to any database"
```

### Step 4: Whitelist IP Address
```
Security → Network Access
• Click "Add IP Address"
• Click "Allow Access from Anywhere" (for Render)
• Confirm (This is safe since DB user has weak permissions)
```

### Step 5: Get Connection String
```
Clusters → Connect → Connect your Application
• Driver: Node.js
• Version: 4 or higher
• Copy connection string

Example:
mongodb+srv://trustpay_app:PASSWORD@trustpay.mongodb.net/interswitch?retryWrites=true&w=majority
```

**SAVE THIS CONNECTION STRING** - You'll need it for Render

---

## 🔧 PHASE 2: DEPLOY BACKEND TO RENDER

### Step 1: Prepare Backend Code
```bash
# Make sure your backend is git-ready
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend/node-api

# Check git status (should show no uncommitted changes)
git status

# If not a git repo yet:
cd /Users/king/Desktop/✘/✘banking✘/inter-switch
git init
git add .
git commit -m "Initial commit - TrustPay MVP"
```

### Step 2: Create Procfile (Render needs this)
```bash
# In backend/node-api folder, create file named "Procfile" (no extension)
# Content:
web: npm start
```

Copy this to your file:
```
web: npm start
```

### Step 3: Update package.json start script
```bash
# Open backend/node-api/package.json
# Make sure "start" script exists:

"scripts": {
  "dev": "nodemon src/index.ts",
  "start": "node dist/index.js",  ← Ensure this exists
  "build": "tsc"                  ← Ensure this exists
}
```

### Step 4: Prepare .env for Production
```bash
# In backend/node-api/.env, add:

NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://trustpay_app:PASSWORD@trustpay.mongodb.net/interswitch?retryWrites=true&w=majority
JWT_SECRET=your-secret-key-here-change-this
INTERSWITCH_MERCHANT_CODE=MX6072
INTERSWITCH_API_KEY=your-api-key
INTERSWITCH_SANDBOX_URL=https://aat.interswitch.co.ug/collections/api
CORS_ORIGIN=https://trustpay.web.app

# Replace PASSWORD with actual MongoDB password
# Replace JWT_SECRET with a strong random string
# Keep Interswitch credentials as they are (for testing)
```

### Step 5: Push to GitHub (Render deploys from GitHub)
```bash
# If not already on GitHub, create repo:
cd /Users/king/Desktop/✘/✘banking✘/inter-switch

# Initialize git if needed
git init
git add .
git commit -m "Initial commit - TrustPay MVP"

# Connect to GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/trustpay
git branch -M main
git push -u origin main
```

### Step 6: Deploy on Render
```
1. Go to https://render.com
2. Click "Sign up" (use GitHub account)
3. Authorize Render to access GitHub
4. Click "New" → "Web Service"
5. Search for "trustpay" repository
6. Fill in details:
   • Name: trustpay-backend
   • Environment: Node
   • Build Command: npm run build
   • Start Command: npm start

7. Scroll to "Environment" section
8. Add environment variables:
   • Copy all from your .env file
   • Special attention to MONGODB_URI and CORS_ORIGIN

9. Click "Create Web Service"
10. Wait 3-5 minutes for deployment
```

### Step 7: Verify Backend Deployment
```bash
# Get your Render URL from dashboard (will be like: https://trustpay-backend.onrender.com)

# Test health check:
curl https://trustpay-backend.onrender.com/api/health

# Should return:
{"service":"node-api","status":"ok","timestamp":"..."}
```

**SAVE YOUR RENDER URL** - Needed for Frontend

---

## ⚙️ PHASE 3: CONFIGURE FRONTEND FOR PRODUCTION

### Step 1: Update Frontend .env
```bash
# frontend/.env (or create if doesn't exist)

VITE_NODE_API_BASE_URL=https://trustpay-backend.onrender.com
```

### Step 2: Build Frontend
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend

npm run build

# This creates: frontend/dist/ folder
# This folder is what gets deployed to Firebase
```

### Step 3: Verify Build
```bash
# Make sure build succeeded with no errors
ls -la dist/

# Should show index.html, assets/, etc.
```

---

## 🔥 PHASE 4: DEPLOY FRONTEND TO FIREBASE

### Step 1: Create Firebase Project
```bash
1. Go to https://console.firebase.google.com
2. Click "Create project"
3. Project name: "TrustPay"
4. Accept terms
5. Choose analytics (optional)
6. Create project
7. Wait for setup
```

### Step 2: Install Firebase CLI
```bash
npm install -g firebase-tools
```

### Step 3: Login to Firebase
```bash
firebase login
# Opens browser for authentication
# Select your Google account
# Allow permissions
```

### Step 4: Initialize Firebase in Your Project
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend

firebase init

# Prompts:
# ✓ Select features: Hosting
# ✓ Select project: TrustPay (from dropdown)
# ✓ Public directory: dist
# ✓ Single page app (rewrite all URLs): Yes
# ✓ Automatic builds with GitHub: Skip for now
```

### Step 5: Deploy to Firebase
```bash
firebase deploy

# Wait for deployment to complete
# You'll get URL like: https://trustpay-xxxxx.web.app
```

### Step 6: Test Live Deployment
```bash
# Visit: https://trustpay-xxxxx.web.app
# Should load homepage
# Login with test credentials
# Try a bill payment
```

---

## ✅ VERIFICATION CHECKLIST

After deployment, verify everything works:

### Frontend (Firebase)
```bash
❌ Can access app at https://trustpay-xxxxx.web.app
❌ Homepage loads without errors
❌ Can log in with test credentials
❌ Can navigate all pages
```

### Backend (Render)
```bash
❌ Health check works: curl backend-url/api/health
❌ Login endpoint works
❌ Transaction endpoints work
```

### Integration
```bash
❌ Frontend connects to backend (check Network tab in DevTools)
❌ Bill payment works end-to-end
❌ Transaction appears in history
❌ Balance updates correctly
```

---

## 🔗 CONFIGURE CORS (Important!)

If you get CORS errors, update your backend:

```typescript
// backend/node-api/src/index.ts

import cors from 'cors';

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
}));
```

**OR** in Render environment variables:

```
CORS_ORIGIN=https://trustpay-xxxxx.web.app
```

---

## 🆘 TROUBLESHOOTING

### Firebase: "Cannot GET /"
**Solution:** Make sure `firebase init` was run and `dist/` folder exists

### Render: Build fails
**Check:**
```bash
# Make sure package.json has build + start scripts
npm run build  # Test locally first
```

### Frontend can't connect to backend
**Check:**
1. CORS is configured on backend
2. `VITE_NODE_API_BASE_URL` is correct
3. Backend is running on Render (check logs)

### MongoDB connection fails
**Check:**
1. MongoDB Atlas whitelist has Render IP
2. Connection string is correct
3. Username/password are correct

### Login doesn't work
**Check:**
1. Test user exists in MongoDB
2. JWT_SECRET is consistent
3. Backend logs on Render

---

## 📊 COST BREAKDOWN

```
Firebase Hosting:
  • Free tier: Up to 1GB/month (enough for MVP)
  • Overage: $0.18 per GB

Render Backend:
  • Free tier: Sleeps after 15 min inactivity ⚠️
  • Paid: $7/month (recommended for hackathon)

MongoDB Atlas:
  • Free tier: 512MB storage (enough for MVP)
  • Paid: $57/month (upgrade if needed)

Total for Hackathon MVP:
  • Option 1 (All free): $0 ⚠️ (Render sleeps)
  • Option 2 (Recommended): ~$7-8/month
  • Option 3 (Production): ~$65/month
```

---

## ⏱️ DEPLOYMENT TIMING

```
First Time:
  • Setup MongoDB Atlas: 5 min
  • Deploy Backend: 10 min
  • Deploy Frontend: 5 min
  • Testing: 5 min
  TOTAL: ~25 minutes

Updates (after first deploy):
  • Update code: 2 min
  • Rebuild frontend: 1 min
  • Deploy frontend: 2 min
  • Backend: Auto-deploys on git push (if connected)
  TOTAL: ~5 minutes per update
```

---

## 🎯 QUICK START COMMAND SEQUENCE

```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Push to GitHub (make sure Render is connected)
cd .. && git add . && git commit -m "Update" && git push

# 3. Backend auto-redeploys on Render (wait 2 min)

# 4. Deploy frontend
firebase deploy

# 5. Test
# Visit: https://trustpay-xxxxx.web.app

# Done! ✅
```

---

## 📱 DEMO WITH LIVE DEPLOYMENT

Instead of running locally, judges can:

```
1. Visit: https://trustpay-xxxxx.web.app
2. Login with test credentials
3. Execute bill payment
4. See live transaction sync

This is MUCH more impressive than local localhost demo!
```

---

## 🔄 UPDATE WORKFLOW (After Deployment)

```bash
# Make changes locally
# Test on localhost

# When ready to deploy:
git add .
git commit -m "Feature: Add X"
git push origin main

# Render auto-deploys backend (2-3 min)
# Then:
npm run build
firebase deploy

# Done! Everyone sees updates live
```

---

## ⚠️ IMPORTANT REMINDERS

1. **Never commit .env files with secrets**
   ```bash
   # Add to .gitignore (check if exists):
   .env
   .env.local
   ```

2. **Keep MongoDB password safe**
   - Only add to Render environment variables
   - Never in code or git history

3. **JWT_SECRET must be same on all instances**
   - Generated JWT on local must work on deployed backend
   - Keep it consistent

4. **CORS_ORIGIN must match your Firebase URL**
   - Frontend: https://trustpay-xxxxx.web.app
   - Backend CORS_ORIGIN must match this exactly

5. **Test bill payment after deployment**
   - This verifies frontend ↔ backend ↔ Interswitch works
   - Don't assume it's working without testing

---

## 🎊 YOU'RE LIVE!

After these steps, your MVP is:
✅ Globally accessible
✅ Production-deployed
✅ Judges can see live transactions
✅ Impressive to demos

**This beats localhost demo by 100x** 🚀

---

## 📞 SUPPORT LINKS

- Firebase Docs: https://firebase.google.com/docs/hosting
- Render Docs: https://render.com/docs
- MongoDB Atlas: https://docs.atlas.mongodb.com
- Firebase CLI: https://firebase.google.com/docs/cli

---

**Ready to go live?** Let me know if you hit any issues!
