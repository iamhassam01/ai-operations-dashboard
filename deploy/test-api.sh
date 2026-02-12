#!/bin/bash
# Test the API endpoints
echo "=== Testing Task Creation ==="
curl -s -X POST http://127.0.0.1:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"type":"other","title":"API Test Task","description":"Created via test script","priority":"low"}'

echo ""
echo "=== Testing Task List ==="
curl -s http://127.0.0.1:3000/api/tasks?limit=5

echo ""
echo "=== Testing Stats ==="
curl -s http://127.0.0.1:3000/api/stats

echo ""
echo "=== Done ==="
