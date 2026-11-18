@echo off
cd /d "%~dp0"
echo.
echo Career Conversation Challenge
 echo Starting the game server on port 8000...
echo.
echo Once started, open http://localhost:8000 on this computer.
echo For phones, use http://YOUR-COMPUTER-IP:8000 instead.
echo.
py -3 app.py
if errorlevel 1 (
  echo.
  echo Couldn't start with the Python launcher. Trying python...
  python app.py
)
pause
