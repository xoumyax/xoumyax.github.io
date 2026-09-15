#!/usr/bin/env bash
# demo_eof.sh -- EOF needs the LAST write end to close. No C required.
#
# This is demo 06's lesson reproduced with nothing but shell builtins, which
# makes it easy to do live at the front of the room.

set -u
FIFO=/tmp/csce313_demo
rm -f "$FIFO"
mkfifo "$FIFO"

echo "1) start a reader in the background:  cat < $FIFO"
cat < "$FIFO" | sed 's/^/   reader saw: /' &
READER=$!
sleep 0.3

echo "2) open a writer and HOLD it open:   exec 3> $FIFO"
exec 3> "$FIFO"
sleep 0.3

echo "3) send two lines through it"
echo "one" >&3
echo "two" >&3
sleep 0.5

echo "   ...the reader has printed both lines but has NOT exited."
echo "   A write end is still open, so there is no EOF."
sleep 1

echo "4) close the last write end:         exec 3>&-"
exec 3>&-
wait $READER 2>/dev/null
echo "   the reader exited the instant the last write end closed."

rm -f "$FIFO"
