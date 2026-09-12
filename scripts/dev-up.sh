#!/usr/bin/env bash
# Starts the Molko backend (FastAPI) and frontend (Vite) dev servers in the
# background and records their PIDs so dev-down.sh can stop them cleanly.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev-pids"
LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
  echo "Ya hay servicios corriendo (o el archivo $PID_FILE quedó de una sesión anterior)."
  echo "Corre scripts/dev-down.sh primero si quieres reiniciarlos."
  exit 1
fi

if [ ! -d "$ROOT_DIR/backend/.venv" ]; then
  echo "No existe backend/.venv — crea el entorno primero (ver README.md)."
  exit 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "No existe frontend/node_modules — corre 'npm install' en frontend/ primero (ver README.md)."
  exit 1
fi

cd "$ROOT_DIR/backend"
setsid nohup .venv/bin/uvicorn app.main:app --reload --port 8000 \
  > "$LOG_DIR/backend.log" 2>&1 < /dev/null &
BACKEND_PID=$!

cd "$ROOT_DIR/frontend"
setsid nohup node_modules/.bin/vite --port 5173 \
  > "$LOG_DIR/frontend.log" 2>&1 < /dev/null &
FRONTEND_PID=$!

echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

sleep 2
echo "Backend:  http://localhost:8000  (docs en /docs, logs en .dev-logs/backend.log)"
echo "Frontend: http://localhost:5173  (logs en .dev-logs/frontend.log)"
echo "Para detener: scripts/dev-down.sh"
