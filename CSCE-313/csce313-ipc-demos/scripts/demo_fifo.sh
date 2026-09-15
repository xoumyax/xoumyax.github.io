#!/usr/bin/env bash
# demo_fifo.sh -- run the FIFO server and client together in one terminal.
#
# In lab, do it the real way instead, in TWO terminals:
#
#   Terminal 1:  ./bin/14_fifo_server     <- appears to hang. That is open().
#   Terminal 2:  ./bin/15_fifo_client
#
# This script just automates that so it fits in a single scrollback.

set -u
cd "$(dirname "$0")/.." || exit 1
rm -f /tmp/CSCE313_FIFO

echo "--- starting server in the background ---"
./bin/14_fifo_server 2>&1 | sed 's/^/[server] /' &
SRV=$!

sleep 1
echo "--- server has been blocked in open() for 1 second; starting client ---"
./bin/15_fifo_client fast 2>&1 | sed 's/^/[client] /'

wait $SRV 2>/dev/null
rm -f /tmp/CSCE313_FIFO
echo "--- done ---"
