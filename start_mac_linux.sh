#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
echo "Career Conversation Challenge is starting on port 8000"
echo "Open http://localhost:8000, or http://YOUR-COMPUTER-IP:8000 for mobile access."
python3 app.py
