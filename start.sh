#!/bin/bash
# Start both the detection server and Vite dev server
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKPOINT="${SCRIPT_DIR}/server/checkpoint/blurball_ep27.pth"
VENV_DIR="${SCRIPT_DIR}/.venv"

echo "🏓 PingPonger — Starting services..."
echo ""

# Check if checkpoint exists
if [ ! -f "$CHECKPOINT" ]; then
    echo "✗ Model checkpoint not found at: $CHECKPOINT"
    echo "  Please ensure the checkpoint file is in server/checkpoint/"
    exit 1
fi

# Check venv exists
if [ ! -f "${VENV_DIR}/bin/python3" ]; then
    echo "✗ Virtual environment not found. Run: python3 -m venv .venv && .venv/bin/python3 -m pip install -r requirements.txt"
    exit 1
fi
echo "✓ Virtual environment found"

PYTHON="${VENV_DIR}/bin/python3"

# Start detection server
echo "▶ Starting detection server..."
cd "$SCRIPT_DIR"
$PYTHON -m server.server --model_path "$CHECKPOINT" &
SERVER_PID=$!

# Wait for server to initialize
sleep 3

# Start Vite dev server
echo "▶ Starting Vite dev server..."
npx vite --port 5175 --host &
VITE_PID=$!

echo ""
echo "✓ Both servers running!"
echo "  Detection server PID: $SERVER_PID"
echo "  Vite dev server PID: $VITE_PID"
echo ""
echo "  Open https://localhost:5175/ in your browser"
echo "  Press Ctrl+C to stop both servers"
echo ""

# Trap Ctrl+C to kill both
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $VITE_PID 2>/dev/null
    wait
    echo "✓ Done."
}
trap cleanup INT TERM

# Wait for either to exit
wait
