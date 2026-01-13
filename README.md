# Omni-Channel Project

## Prerequisites
- Docker Desktop installed
- Docker Compose installed

## Setup Instructions

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your API keys:
   - `GROQ_API_KEY`

3. Build and run the containers:
   ```bash
   docker compose up --build
   ```

4. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - API Health Check: http://localhost:8000/health

## ElevenLabs TTS (frontend)

To enable text-to-speech playback for voice-originated queries (voice mode and audio recordings), configure the following **frontend** environment variables (for example in `frontend/.env`):

- `VITE_ELEVENLABS_API_KEY=<your_elevenlabs_api_key>`
- `VITE_ELEVENLABS_VOICE_ID=<optional_voice_id>`

If `VITE_ELEVENLABS_VOICE_ID` is not set, a default ElevenLabs voice ID will be used. When the user submits input that includes audio, LLM responses will be sent to ElevenLabs and played back in the browser. Pure text-only queries are not spoken.

## Stopping the containers
Press `Ctrl+C` or run:

```bash
docker compose down
```

## Troubleshooting
- If port 80 is already in use, change it in `docker-compose.yml`
- Make sure Docker Desktop is running
- Check logs: `docker compose logs`