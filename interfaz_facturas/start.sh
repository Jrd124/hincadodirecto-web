#!/bin/bash
# Start Telegram bot in background, then start Gunicorn (web)
python bot_telegram.py &
exec gunicorn --bind 0.0.0.0:8000 --workers 2 --timeout 120 --access-logfile - backend:app
