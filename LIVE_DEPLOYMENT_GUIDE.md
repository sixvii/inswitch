# 🚀 LIVE DEPLOYMENT - COMPLETE WALKTHROUGH

## ⏱️ TOTAL TIME: ~40 minutes

```
MongoDB Atlas: 5 min
GitHub Setup: 5 min
Render Backend: 10 min
Firebase Frontend: 10 min
Testing: 10 min
```

---

## 📍 STEP 1: CREATE MONGODB ATLAS ACCOUNT (5 minutes)

### 1.1 Sign Up
```
1. Open: https://www.mongodb.com/cloud/atlas
2. Click "Try Free"
3. Sign up with email (or use Google)
4. Verify email
5. Complete wizard
```

### 1.2 Create Free Cluster
```
• Tier: M0 Sandbox (FREE)
• Cloud Provider: AWS
• Region: us-east-1 (closest to Render)
• Name: trustpay
• Create Cluster (wait 2-3 minutes)
```

### 1.3 Create Database User
```
Left sidebar: Security → Database Access

• Click "Add Database User"
• Username: trustpay_app
• Password: [Click "Autogenerate Secure Password"]
• COPY THIS PASSWORD - SAVE IT!
• Built-in role: Read and write to any database
• Create User
```

### 1.4 Whitelist IP (Allow Render Access)
```
Left sidebar: Security → Network Access

• Click "Add IP Address"
• Click "Allow Access from Anywhere" (0.0.0.0/0)
• Click Confirm
```

### 1.5 Get Connection String
```
Clusters → Connect button

• Choose "Connect your application"
• Driver: Node.js 4.x or later
• Copy the connection string

Example:
mongodb+srv://trustpay_app:PASSWORD@trustpay.mongodb.net/interswitch?retryWrites=true&w=majority

REPLACE PASSWORD WITH YOUR ACTUAL PASSWORD

SAVE THIS STRING FOR LATER!
```

---

## 📍 STEP 2: PREPARE GITHUB REPOSITORY (5 minutes)

### 2.1 Check If Already a Git Repo
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch
git status
```

If you see "fatal" error, run:
```bash
git init
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

### 2.2 Create .gitignore (Important!)
```bash
# Make sure .gitignore exists and has these:
cat > .gitignore << 'EOF'
.env
.env.local
.env.production
node_modules/
dist/
build/
.DS_Store
*.log
EOF
```

### 2.3 Commit All Code
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch

git add .
git commit -m "Initial commit: TrustPay MVP - Bill Payments + Interswitch"
```

### 2.4 Push to GitHub
**Option A: If you already have a GitHub repo**
```bash
git remote add origin https://github.com/YOUR_USERNAME/trustpay
git branch -M main
git push -u origin main
```

**Option B: If you NEED to create GitHub repo**
```
1. Go to https://github.com/new
2. Repo name: trustpay
3. Description: TrustPay - Interswitch Hackathon MVP
4. Public (so Render can see it)
5. Create Repository

Then copy the commands GitHub gives you and run them
```

**SAVE YOUR GITHUB REPO URL** - needed for Render

---

## 📍 STEP 3: DEPLOY BACKEND TO RENDER (10 minutes)

### 3.1 Update Backend .env
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend/node-api

# Create/update .env file with:
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://trustpay_app:PASSWORD@trustpay.mongodb.net/interswitch?retryWrites=true&w=majority
JWT_SECRET=trustpay-secret-key-change-this-in-production
INTERSWITCH_MERCHANT_CODE=MX6072
INTERSWITCH_API_KEY=your-interswitch-key
INTERSWITCH_SANDBOX_URL=https://aat.interswitch.co.ug/collections/api
CORS_ORIGIN=https://trustpay-XXXXX.web.app
EOF
```

**IMPORTANT:** Replace `PASSWORD` with your actual MongoDB password

### 3.2 Create Procfile (Render needs this)
```bash
# In backend/node-api folder:
cat > Procfile << 'EOF'
web: npm start
EOF
```

### 3.3 Verify package.json Has build + start
```bash
# Open backend/node-api/package.json
# Make sure these scripts exist:

"scripts": {
  "dev": "nodemon src/index.ts",
  "start": "node dist/index.js",
  "build": "tsc"
}
```

If missing, add them.

### 3.4 Commit and Push
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch

git add backend/
git commit -m "Add Procfile and production .env for Render deployment"
git push origin main
```

### 3.5 Create Render Account
```
1. Go to https://render.com
2. Click "Sign up"
3. Choose "Sign up with GitHub"
4. Authorize Render
5. Wait for redirect
```

### 3.6 Deploy Backend
```
1. In Render dashboard, click "New" → "Web Service"
2. Search for and select your "trustpay" repository
3. Fill in:
   • Name: trustpay-backend
   • Environment: Node
   • Region: Oregon (closest)
   • Build Command: npm run build
   • Start Command: npm start

4. Click "Create Web Service"
5. Wait 5-10 minutes for deployment
```

### 3.7 Add Environment Variables to Render
```
While deploying, in the Environment section:

Add each variable:
• NODE_ENV = production
• PORT = 3000
• MONGODB_URI = [your MongoDB connection string]
• JWT_SECRET = trustpay-secret-key-change-this
• INTERSWITCH_MERCHANT_CODE = MX6072
• INTERSWITCH_API_KEY = [your key]
• INTERSWITCH_SANDBOX_URL = https://aat.interswitch.co.ug/collections/api
• CORS_ORIGIN = https://trustpay-XXXXX.web.app (set after Firebase URL)
```

### 3.8 Get Your Render URL
```
After deployment completes, Render shows:
https://trustpay-backend.onrender.com

Test it:
curl https://trustpay-backend.onrender.com/api/health

Should return:
{"service":"node-api","status":"ok"}

SAVE THIS URL!
```

---

## 📍 STEP 4: BUILD FRONTEND (2 minutes)

### 4.1 Update Frontend .env
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend

cat > .env << 'EOF'
VITE_NODE_API_BASE_URL=https://trustpay-backend.onrender.com
EOF
```

Replace with your actual Render URL from Step 3.8

### 4.2 Build Frontend
```bash
npm run build

# Should complete with:
# ✓ built in 45.36s
# dist/ folder created
```

### 4.3 Verify Build
```bash
ls -la dist/

# Should show index.html and assets/ folder
```

---

## 📍 STEP 5: DEPLOY FRONTEND TO FIREBASE (8 minutes)

### 5.1 Install Firebase CLI
```bash
npm install -g firebase-tools

# Verify:
firebase --version
```

### 5.2 Login to Firebase
```bash
firebase login

# Opens browser for Google login
# Select your Google account
# Allow permissions
# Return to terminal
```

### 5.3 Initialize Firebase
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend

firebase init

# Prompts - Select:
# ✓ Hosting (highlight with arrow, press space)
# ✓ Choose existing project → Select your Firebase project
# 📁 Public directory: dist
# ✓ Single page app: Yes
# ✓ GitHub deploys: No (skip for now)
```

### 5.4 Deploy Frontend
```bash
firebase deploy

# Wait for completion
# You'll get:
# Hosting URL: https://trustpay-XXXXX.web.app
# Live now!

SAVE THIS URL!
```

### 5.5 Test Live Frontend
```bash
Open: https://trustpay-XXXXX.web.app

You should see:
• Login page loads
• No console errors
• Backend API connects
```

---

## 📍 STEP 6: TEST LIVE MVP (10 minutes)

### 6.1 Test Login
```
Frontend: https://trustpay-XXXXX.web.app
Login with:
  Username: demouser
  PIN: 1234

Click Login
```

### 6.2 Test Bill Payment
```
1. Click "Transact"
2. Click "Payments" tab
3. Click "Buy Airtime"
4. Select: MTN
5. Amount: 1000
6. Click "Pay Now"
7. Enter PIN: 1234
8. See success receipt
9. Check transaction history updated
```

### 6.3 Verify Architecture
```
Open DevTools (F12)
Go to Network tab
Watch the API calls:
• POST to https://trustpay-backend.onrender.com/api/transactions/commit
• See response with transaction ID
• Frontend updates balance in real-time

THIS PROVES EVERYTHING IS CONNECTED! ✅
```

---

## ✅ VERIFICATION CHECKLIST

After deployment:

- [ ] MongoDB Atlas cluster created and accessible
- [ ] Backend deployed on Render: https://trustpay-backend.onrender.com
- [ ] Backend health check works: curl [backend-url]/api/health
- [ ] Frontend deployed on Firebase: https://trustpay-XXXXX.web.app
- [ ] Can login on deployed frontend
- [ ] Can complete bill payment on deployed frontend
- [ ] Transaction appears in history immediately
- [ ] Balance updated correctly (49,000 → 48,000)
- [ ] No CORS errors in console
- [ ] No backend errors in Render logs

---

## 🎉 YOU'RE LIVE!

Your MVP is now:

✅ **Frontend:** https://trustpay-XXXXX.web.app (Firebase Hosting)
✅ **Backend:** https://trustpay-backend.onrender.com (Render)
✅ **Database:** MongoDB Atlas (Cloud)
✅ **Real Transactions:** Working end-to-end

**For Judges:**
Instead of showing localhost, show them the LIVE URL!

```
"Here's our MVP running in production on Firebase and Render.
Let me show you a live transaction..."
```

This is **100x more impressive** than localhost demo! 🚀

---

## 🆘 TROUBLESHOOTING

### Frontend shows blank page
```
Fix: Clear browser cache + hard refresh (Cmd+Shift+R)
Or: Redeploy: firebase deploy
```

### "Cannot connect to backend"
```
Check:
1. VITE_NODE_API_BASE_URL is correct in frontend .env
2. npm run build after updating .env
3. firebase deploy
4. Render backend is running (check Render dashboard)
```

### "CORS error in console"
```
Update in Render environment:
CORS_ORIGIN=https://trustpay-XXXXX.web.app
(with your actual Firebase URL)

Then rebuild backend on Render.
```

### Backend deployment fails
```
Check Render logs:
1. Click on your service in Render
2. Scroll to "Logs"
3. Look for errors
4. Common: Missing dependencies - run npm install locally first
```

### MongoDB connection fails
```
Check:
1. Connection string has correct password
2. Network access allows Render IP (0.0.0.0/0)
3. Database user exists in MongoDB Atlas
```

---

## 📞 NEXT STEPS

**Demo Day:**
1. Instead of running locally, open live URLs
2. Show https://trustpay-XXXXX.web.app to judges
3. Perform live bill payment
4. Show transaction syncing in real-time
5. Explain architecture (Frontend → Render → MongoDB → Interswitch)

**After Hackathon (if you win or want to continue):**
1. Update Interswitch credentials from TEST to LIVE
2. Change JWT_SECRET to something random in Render
3. Scale MongoDB if needed
4. Add more features using same bill payment pattern

---

## 💰 COSTS

```
Monthly Burns (After first free tier):
• Firebase Hosting: ~$0 (1GB free)
• Render Backend: ~$7 (if using paid tier)
• MongoDB Atlas: ~$0 (512MB free)
Total: ~$7/month or completely FREE on free tiers

For hackathon: You can run completely free!
```

---

**Total Time to Go Live: ~40 minutes**
**Result: Production-deployed MVP** ✅

Ready to deploy?
