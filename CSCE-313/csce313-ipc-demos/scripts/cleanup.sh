#!/usr/bin/env bash
# cleanup.sh -- remove FIFOs left behind by a crashed run.
#
# A server that dies before reaching its unlink() leaves the FIFO on disk, and
# the NEXT run then fails with EEXIST for a reason unrelated to your new code.
# This is the single most common false bug report in the FIFO lab.
for f in /tmp/CSCE313_FIFO /tmp/CSCE313_RENDEZVOUS /tmp/csce313_demo; do
  if [ -e "$f" ]; then echo "removing $f"; rm -f "$f"; fi
done
echo "clean."
