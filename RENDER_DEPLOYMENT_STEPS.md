# 🚀 Deploy Backend to Render - Step by Step

Your code is now on GitHub! Now let's deploy it to Render.

## Step 1: Go to Render Dashboard
```
1. Open: https://dashboard.render.com/
2. Click "New +" button
3. Select "Web Service"
```

## Step 2: Connect Your GitHub Repository
```
1. Click "Connect your own"
2. Search for: "inswitch"
3. Select: sixvii/inswitch
4. Click "Connect"
```

## Step 3: Configure the Web Service

Fill in these details:

```
Name:                  trustpay-backend
Environment:           Node
Build Command:         npm install && npm run build
Start Command:         npm start
Instance Type:         Free (for now)
```

## Step 4: Add Environment Variables

Click "Advanced" → "Add Environment Variable"

Add EACH of these variables (copy from backend/.env):

```
NODE_ENV                = production
PORT                    = 3000
MONGODB_URI             = mongodb+srv://xivi9x:interswitchpay@cluster0.mjzsglo.mongodb.net/Cluster0?appName=Cluster0
ALLOWED_ORIGIN          = https://inswit-ch.web.app
ALLOWED_ORIGINS         = https://inswit-ch.web.app,http://localhost:5173,http://localhost:8080
INTERSWITCH_MERCHANT_CODE    = MX275874
INTERSWITCH_PAY_ITEM_ID      = Default_Payable_MX275874
INTERSWITCH_CLIENT_ID        = IKIAD3CB129318DC116F360353858C8918A6A2E6BDDC
INTERSWITCH_SECRET           = SorVGTxGVZKTvr_
INTERSWITCH_AUTH_MODE   = bearer
INTERSWITCH_TOKEN_URL   = https://qa.interswitchng.com/passport/oauth/token
INTERSWITCH_MODE        = TEST
INTERSWITCH_PAY_BILL_MODE = live
INTERSWITCH_BASE_URL    = https://qa.interswitchng.com
INTERSWITCH_INLINE_SCRIPT_URL = https://newwebpay.qa.interswitchng.com/inline-checkout.js
INTERSWITCH_REDIRECT_BASE_URL = https://newwebpay.qa.interswitchng.com/collections/w/pay
CLOUDINARY_CLOUD_NAME   = dddslqueq
CLOUDINARY_API_KEY      = 495367344885423
CLOUDINARY_API_SECRET   = g7iJGQYL_reKVDmVv5ntX0ioXfY
CLOUDINARY_FOLDER       = interswitch/profiles
JWT_SECRET              = fhsjdjfjfjdjdkdkkkks
JWT_EXPIRES_IN          = 12h
```

## Step 5: Deploy!

```
1. Click "Create Web Service"
2. Wait 3-5 minutes for build
3. You'll see status: "Building..." → "Live"
4. Get your URL like: https://trustpay-backend.onrender.com
```

## Step 6: Update Frontend with Backend URL

Once deployed, update your frontend:

```bash
# frontend/.env
VITE_NODE_API_BASE_URL=https://trustpay-backend.onrender.com
```

Then rebuild and redeploy:
```bash
cd frontend
npm run build
firebase deploy
```

---

## ✅ VERIFICATION AFTER RENDER DEPLOYMENT

Test your backend:

```bash
curl https://trustpay-backend.onrender.com/api/health

# Should return:
{"service":"node-api","status":"ok","timestamp":"..."}
```

---

## 📍 DO THIS NOW:

1. Go to https://dashboard.render.com/
2. Follow steps 1-5 above
3. Wait for deployment to complete
4. Come back and tell me your backend URL
5. I'll update the frontend and redeploy
