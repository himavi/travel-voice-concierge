@echo off
echo Starting Travel Voice Concierge...
echo.

REM Start backend in a new terminal window
start "Backend - FastAPI" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn main:app --reload --port 8000"

REM Wait 2 seconds for backend to initialize
timeout /t 2 /nobreak > nul

REM Start frontend in a new terminal window
start "Frontend - Next.js" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers are starting...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Open http://localhost:3000 in your browser.
pause
