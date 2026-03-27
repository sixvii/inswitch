# 🚀 DEPLOYMENT QUICK START - MANUAL STEPS

## Your code is ready! Here are the 3 manual steps:

---

## ✅ STEP 1: CREATE GITHUB REPO & PUSH CODE (5 minutes)

### 1a. Create GitHub Repo
```
1. Go to: https://github.com/new
2. Repo name: trustpay
3. Description: TrustPay - Interswitch Hackathon MVP
4. Make it PUBLIC
5. Click "Create Repository"
6. GitHub will show you commands to run
```

### 1b. Connect & Push
```bash
# Copy these commands from GitHub and run them:
git remote add origin https://github.com/YOUR_USERNAME/trustpay
git branch -M main
git push -u origin main

# Wait for push to complete (should be fast)
```

### 1c. Verify on GitHub
```
Go to: https://github.com/YOUR_USERNAME/trustpay
Should show your code ✅
```

---

## ✅ STEP 2: DEPLOY BACKEND TO RENDER (10 minutes)

### 2a. Create Render Account
```
1. Go to: https://render.com
2. Click "Sign up with GitHub"
3. Authorize Render
4. Verify email
```

### 2b. Create Web Service
```
In Render Dashboard:

1. Click "New" → "Web Service"
2. Search for and select your "trustpay" repository
3. Select the "main" branch
4. Fill in:
   • Service Name: trustpay-backend
   • Build Command: npm run build
   • Start Command: npm start
5. Select Region: Oregon (or closest to you)
6. Click "Create Web Service"
```

### 2c. Add Environment Variables
```
In Render dashboard, go to "Environment" section and add:

NODE_ENV          = production
PORT              = 3000
MONGODB_URI       = mongodb+srv://xivi9x:interswitchpay@cluster0.mjzsglo.mongodb.net/Cluster0?appName=Cluster0
JWT_SECRET        = fhsjdjfjfjdjdkdkkkks
INTERSWITCH_MERCHANT_CODE      = MX275874
INTERSWITCH_PAY_ITEM_ID        = Default_Payable_MX275874
INTERSWITCH_CLIENT_ID          = IKIAD3CB129318DC116F360353858C8918A6A2E6BDDC
INTERSWITCH_SECRET             = SorVGTxGVZKTvr_
INTERSWITCH_AUTH_MODE          = bearer
INTERSWITCH_TOKEN_URL          = https://qa.interswitchng.com/passport/oauth/token
INTERSWITCH_MODE               = TEST
INTERSWITCH_PAY_BILL_MODE      = live
INTERSWITCH_BASE_URL           = https://qa.interswitchng.com
INTERSWITCH_INLINE_SCRIPT_URL  = https://newwebpay.qa.interswitchng.com/inline-checkout.js
INTERSWITCH_REDIRECT_BASE_URL  = https://newwebpay.qa.interswitchng.com/collections/w/pay
CLOUDINARY_CLOUD_NAME          = dddslqueq
CLOUDINARY_API_KEY             = 495367344885423
CLOUDINARY_API_SECRET          = g7iJGQYL_reKVDmVv5ntX0ioXfY
CLOUDINARY_FOLDER              = interswitch/profiles
JWT_EXPIRES_IN                 = 12h
ALLOWED_ORIGIN                 = https://trustpay-*.web.app
ALLOWED_ORIGINS                = https://trustpay-*.web.app,http://localhost:5173,http://localhost:8080,http://localhost:8081
```

### 2d. Wait for Deployment
```
Render will:
1. Pull your code from GitHub
2. Run: npm run build
3. Run: npm start
4. Deploy (takes 5-10 minutes)

Status will change to: "Live" when done
```

### 2e. Get Your Backend URL
```
In Render dashboard, look for:
"https://trustpay-backend.onrender.com"

(Your URL will be slightly different)

Test it:
curl https://trustpay-backend.onrender.com/api/health

Should return: {"service":"node-api","status":"ok"}

✅ SAVE THIS URL!
```

---

## ✅ STEP 3: DEPLOY FRONTEND TO FIREBASE (8 minutes)

### 3a. Create Firebase Account
```
1. Go to: https://console.firebase.google.com
2. Sign in with Google
3. Click "Create project"
4. Project name: TrustPay
5. Accept terms
6. Choose analytics (optional)
7. Create project
8. Wait for setup (~1 minute)
```

### 3b. Install Firebase CLI
```bash
npm install -g firebase-tools

# Verify:
firebase --version
```

### 3c. Login to Firebase
```bash
firebase login

# Opens browser for Google sign-in
# Select your Google account
# Allow permissions
# Wait for "Success!"
```

### 3d. Update Frontend .env
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend

# Create/update .env:
cat > .env << 'EOF'
VITE_NODE_API_BASE_URL=https://trustpay-backend.onrender.com
EOF

# Replace with YOUR actual Render URL from Step 2e
```

### 3e. Build Frontend
```bash
npm run build

# Should complete with:
# ✓ built in 45.36s
```

### 3f. Initialize Firebase
```bash
firebase init

# Prompts - select:
# ✓ Hosting (arrow down + space)
# ✓ Choose existing project → Select TrustPay
# 📁 Public directory: dist
# ✓ Single page app: Yes
# ✓ GitHub deploys: No
```

### 3g. Deploy Frontend
```bash
firebase deploy

# Wait for completion
# Copy the URL shown:
# "Hosting URL: https://trustpay-xxxxx.web.app"

✅ SAVE THIS URL!
```

### 3h. Test Live Frontend
```
Open: https://trustpay-xxxxx.web.app

Should see:
✅ Login page loads (no errors)
✅ Backend API connects
✅ Can log in with test credentials
```

---

## 🎉 NOW VERIFY EVERYTHING WORKS

### Test 1: Login
```
1. Open: https://trustpay-xxxxx.web.app
2. Username: demouser
3. PIN: 1234
4. Click Login

Expected: See homepage with balance ₦49,000
```

### Test 2: Bill Payment
```
1. Click "Transact"
2. Click "Payments" tab
3. Click "Buy Airtime"
4. Provider: MTN
5. Amount: 1000
6. Click "Pay Now"
7. Enter PIN: 1234
8. Click "Confirm"

Expected:
✅ Payment Success screen
✅ Transaction appears in history
✅ Balance updated: 49,000 → 48,000
```

### Test 3: Check Network
```
1. Open DevTools (F12)
2. Network tab
3. Do another bill payment
4. Watch the API calls:
   - POST to https://trustpay-backend.onrender.com/api/transactions/commit
   - See 200 response

Expected: Real backend call working ✅
```

---

## 📊 YOUR LIVE DEPLOYMENT URLS

After deployment, you'll have:

```
Frontend (Firebase):  https://trustpay-XXXXX.web.app
Backend (Render):     https://trustpay-backend.onrender.com
Database (MongoDB):   Atlas Cloud

All 3 connected and working! ✅
```

---

## 💡 IF SOMETHING FAILS

### Frontend shows blank page
```
Fix:
1. Clear browser cache (Cmd+Shift+R)
2. Or run: firebase deploy
3. Wait 1-2 minutes
```

### "Cannot connect to backend"
```
Check:
1. VITE_NODE_API_BASE_URL in frontend/.env is correct
2. npm run build (after updating .env)
3. firebase deploy
4. Backend is running on Render (check Render dashboard)
```

### Render deployment fails
```
Check Render dashboard:
1. Click your service
2. Go to "Logs"
3. Look for error messages
4. Common fix: Push code again to GitHub
5. Render auto-redeploys
```

### CORS errors in console
```
Fix: In Render environment variables, make sure:
ALLOWED_ORIGINS includes your Firebase URL
```

---

## ✅ FINAL CHECKLIST

- [ ] GitHub repo created with code pushed
- [ ] Render account created
- [ ] Backend deployed on Render (status: "Live")
- [ ] Backend health check works: `curl [backend-url]/api/health`
- [ ] Firebase account created
- [ ] Firebase CLI installed locally
- [ ] Frontend .env updated with Render URL
- [ ] Frontend built: `npm run build`
- [ ] Frontend deployed with Firebase
- [ ] Can access deployed frontend
- [ ] Can login with test credentials
- [ ] Can complete bill payment
- [ ] Transaction appears in history
- [ ] Balance updated correctly

---

## 🎯 TOTAL TIME

```
GitHub repo:     5 min
Render backend:  10 min
Firebase setup:  15 min
Testing:         10 min
─────────────────────
TOTAL:           ~40 minutes

You'll be LIVE after this! ✅
```

---

**Ready to go live?** 🚀
