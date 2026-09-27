#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec python3 server.py 2>&1 | tee -a "logs/server-$(date +%Y%m%d).log"
