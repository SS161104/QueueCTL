set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLI="$ROOT/bin/queuectl.js"

echo "=== Cleaning data dir ==="
rm -rf "$ROOT/data"
mkdir -p "$ROOT/data"

echo "=== Enqueue a successful job ==="
node "$CLI" enqueue '{"command":"echo hello-success","id":"job-success","max_retries":2}'

echo "=== Enqueue a failing job (nonzero exit) ==="
node "$CLI" enqueue '{"command":"bash -c \"exit 2\"","id":"job-fail","max_retries":2}'

echo "*** Start workers (in background) with 2 workers ***"
node "$CLI" worker start --count 2 &
WORKER_PID=$!
echo "Worker pid: $WORKER_PID"
sleep 1

echo "*** Wait 8 seconds for retries/backoff ***"
sleep 8

echo "*** Show summary ***"
node "$CLI" status

echo "*** List dead jobs ***"
node "$CLI" dlq list

echo "*** Stopping worker ***"
kill -SIGINT $WORKER_PID || true
wait $WORKER_PID 2>/dev/null || true

echo "=== Test script finished ==="
