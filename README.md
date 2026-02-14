# TimeFlow - Time Organizer App

A beautiful, full-stack time organizing application with modern UI/UX.

![TimeFlow](https://img.shields.io/badge/React-18-blue) ![Node](https://img.shields.io/badge/Node-18+-green) ![License](https://img.shields.io/badge/license-MIT-purple)

## Features

- **Dashboard** - Overview with stats, upcoming tasks, and habits
- **Task Management** - Full CRUD with categories, priorities, due dates
- **Calendar View** - Monthly calendar with task visualization  
- **Focus Timer** - Pomodoro with 5 presets + custom times
- **Habits Tracker** - Build routines with streak tracking
- **Notes** - Quick notes storage
- **Dark/Light Mode** - Theme switching
- **Responsive Design** - Works on all devices

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express
- **Storage**: JSON file (SQLite-like persistence)

## Quick Start

### Local Development

```bash
# Double-click start.bat (Windows)
# OR run manually:

# Terminal 1 - Backend
cd backend && npm install && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm install && npm run dev
```

- Frontend: http://localhost:4567
- Backend: http://localhost:3456

---

## Deploy to Render (Free)

### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Push your code:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/timeflow.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [Render.com](https://render.com) and sign up (free)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Render will detect `render.yaml` automatically
5. Click **"Apply"**

That's it! Your app will be live at `https://timeflow.onrender.com`

---

## Manual Deployment (Alternative)

If Blueprint doesn't work, create services manually:

### Backend Web Service
1. **New +** → **Web Service**
2. Connect GitHub repo
3. Settings:
   - **Name**: `timeflow-api`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

### Frontend Static Site  
1. **New +** → **Static Site**
2. Settings:
   - **Name**: `timeflow`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

---

## Environment Variables

No environment variables required for basic setup!

---

## Project Structure

```
timeflow/
├── backend/
│   ├── server.js      # Express API server
│   ├── package.json
│   └── db.json        # Data storage (auto-created)
├── frontend/
│   ├── src/
│   │   ├── App.jsx    # Main React app
│   │   └── index.css  # Tailwind styles
│   ├── package.json
│   └── vite.config.js
├── render.yaml        # Render deployment config
└── start.bat          # Windows launcher
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/tasks` | Task management |
| GET/POST | `/api/categories` | Categories |
| GET/POST | `/api/habits` | Habits |
| POST | `/api/habits/:id/complete` | Complete habit |
| GET/POST | `/api/notes` | Notes |
| GET | `/api/stats` | Dashboard statistics |

## License

MIT