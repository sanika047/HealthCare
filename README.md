# HealthAI — Predictive Health Dashboard

A full-stack health prediction application that collects patient blood test results and uses AI to generate health risk assessments.

## Features
- **CRUD** — Create, Read, Update, Delete patient records
- **AI Analysis** — Groq LLaMA3 generates health predictions from blood values
- **Data Validation** — Email format, future DOB prevention, numeric checks
- **Dashboard** — Live stats for total patients and average blood values
- **Light UI** — Clean, professional white interface built with Flask + vanilla JS

## Tech Stack
- **Backend**: Python / Flask / SQLAlchemy
- **Database**: SQLite (local) / PostgreSQL (production)
- **AI**: Groq API (LLaMA3-8b) with rule-based fallback
- **Frontend**: HTML, CSS, JavaScript (no framework)

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/healthai.git
cd healthai

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your Groq API key
copy .env.example .env
# Edit .env and add: GROQ_API_KEY=your_key_here

# 5. Run
python app.py
# Open http://localhost:5000
```

## Get a Free Groq API Key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up → API Keys → Create key
3. Paste it in your `.env` file

## Deploy to Render (Free)
See deployment instructions below or visit [render.com](https://render.com)

## Environment Variables
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Your Groq API key for AI predictions |
| `DATABASE_URL` | PostgreSQL URL (auto-set by Render) |
| `FLASK_ENV` | Set to `production` on live server |
