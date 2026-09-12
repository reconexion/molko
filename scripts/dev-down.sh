#!/usr/bin/env bash
# Stops the Molko dev servers started by dev-up.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev-pids"

if [ ! -f "$PID_FILE" ]; then
  echo "No hay archivo $PID_FILE — no parece haber servicios corriendo (o ya se detuvieron)."
  exit 0
fi

while read -r pid; do
  [ -z "$pid" ] && continue
  if kill -0 "$pid" 2>/dev/null; then
    # setsid made each server its own process-group leader, so a negative PID
    # (the group) also kills reload/build children it spawned (uvicorn's
    # --reload worker, vite's esbuild service).
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    echo "Detenido PID $pid"
  else
    echo "PID $pid ya no estaba corriendo"
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "Listo."
