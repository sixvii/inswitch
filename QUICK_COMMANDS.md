# TrustPay - Quick Commands Reference Card

## 🚀 ONE-TIME SETUP

### First time running?
```bash
# Terminal 1: MongoDB (run once)
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend
docker compose up -d
```

```bash
# Terminal 2: Backend dependencies (run once)
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend/node-api
npm install
```

```bash
# Terminal 3: Frontend dependencies (run once)
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend
npm install
```

---

## ▶️ EVERY TIME YOU WANT TO RUN THE APP

### Terminal 1: MongoDB
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend
docker compose up -d
```

### Terminal 2: Backend API
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/backend/node-api
npm run dev
```

### Terminal 3: Frontend
```bash
cd /Users/king/Desktop/✘/✘banking✘/inter-switch/frontend
npm run dev
```

---

## 🌐 OPEN IN BROWSER

Visit: **http://localhost:8080**

---

## 🔐 TEST LOGIN

- Phone: `08000000000`
- Username: `demouser`
- PIN: `1234`
- Password: `password123`

---

## ✅ VERIFY EVERYTHING IS RUNNING

```bash
# Health check API
curl http://localhost:5001/api/health

# Check MongoDB is running
docker ps | grep mongo
```

---

## 🔄 RESTART EVERYTHING

```bash
# Kill port 5001 (backend)
npx kill-port 5001

# Kill port 8080 (frontend)
npx kill-port 8080

# Restart MongoDB
docker compose -C /Users/king/Desktop/✘/✘banking✘/inter-switch/backend restart
```

---

## 📁 FOLDER LOCATIONS

- **Backend API:** `/Users/king/Desktop/✘/✘banking✘/inter-switch/backend/node-api`
- **Frontend:** `/Users/king/Desktop/✘/✘banking✘/inter-switch/frontend`
- **Docker Compose:** `/Users/king/Desktop/✘/✘banking✘/inter-switch/backend`

---

## 🎯 DEMO FLOW

1. Open http://localhost:8080
2. Login with test credentials
3. See dashboard with balance
4. Click "Buy Airtime"
5. Select MTN, enter amount
6. Click Pay Now
7. Enter PIN: 1234
8. See success receipt

---

## 💡 COMMON ISSUES

| Problem | Solution |
|---------|----------|
| "Cannot find module" | Run `npm install` |
| "Port already in use" | Run `npx kill-port 5001` or `npx kill-port 8080` |
| "Cannot connect to MongoDB" | Run `docker compose up -d` in backend folder |
| "npm not found" | Make sure you're in the right folder |

---

## 📞 HELP

Running backend alone? See `HACKATHON_DEMO.md` for complete instructions.
