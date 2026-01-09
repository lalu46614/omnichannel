# Omni-Channel Project

## Prerequisites
- Docker Desktop installed
- Docker Compose installed

## Setup Instructions

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your API keys:h
   cp .env.example .env
   3. Edit `.env` and add your `GROQ_API_KEY`

4. Build and run the containers:
   docker compose up --build
   5. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - API Health Check: http://localhost:8000/health

## Stopping the containers
Press `Ctrl+C` or run:
docker compose down

## Troubleshooting
- If port 80 is already in use, change it in `docker-compose.yml`
- Make sure Docker Desktop is running
- Check logs: `docker compose logs`