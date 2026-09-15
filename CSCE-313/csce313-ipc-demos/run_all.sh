#!/usr/bin/env bash
# run_all.sh -- run every non-interactive demo in teaching order.
#
#   ./run_all.sh            run straight through
#   ./run_all.sh -p         pause for ENTER between demos (good for lecture)
#
# Demos 06 and 11-broken deliberately hang; each has a 5-second alarm that
# prints the diagnosis and exits, so this script always terminates.

set -u
PAUSE=0
[ "${1:-}" = "-p" ] && PAUSE=1

hr()  { printf '\n\033[35m%s\033[0m\n' "----------------------------------------------------------------------"; }
head_() { printf '\033[1;35m>> %s\033[0m\n' "$1"; }
pause() { [ "$PAUSE" -eq 1 ] && { printf '\n\033[2m(ENTER to continue)\033[0m'; read -r _; }; return 0; }

run() {
  local title="$1"; shift
  hr; head_ "$title"; printf '\033[2m$ %s\033[0m\n' "$*"
  "$@" 2>&1
  printf '\033[2m[exit status: %d]\033[0m\n' $?
  pause
}

if [ ! -x bin/01_pipe_basics ]; then echo "Run 'make' first."; exit 1; fi

run "00  what a file descriptor is"            ./bin/00_fd_inspect
run "01  pipe basics"                          ./bin/01_pipe_basics
run "02  a pipe carries bytes, not strings"    ./bin/02_bytes_not_strings
run "03  fork returns twice"                   ./bin/03_fork_basics

hr; head_ "04  counting processes"
printf '\033[2m$ ./bin/04_fork_count 3 | wc -l   (3 unconditional forks -> 2^3)\033[0m\n'
./bin/04_fork_count 3 | wc -l
printf '\033[2m$ ./bin/04_fork_count 3 break | wc -l   (the if-child-break idiom -> n+1)\033[0m\n'
./bin/04_fork_count 3 break | wc -l
pause

hr; head_ "05  the stdio buffering trap"
printf '\033[2m$ ./bin/05_buffering_trap        (stdout is a terminal: line buffered)\033[0m\n'
./bin/05_buffering_trap
printf '\033[2m$ ./bin/05_buffering_trap | cat  (stdout is a pipe: FULLY buffered)\033[0m\n'
./bin/05_buffering_trap | cat
printf '\033[33m^ the A appears twice: fork() copied the unflushed stdio buffer\033[0m\n'
pause

run "06  fork+pipe with a MISSING close  (deadlocks on purpose)" ./bin/06_pipe_fork_hang
run "07  the same program, one close added"    ./bin/07_pipe_fork_fixed
run "08  short reads"                          ./bin/08_partial_read
run "09  pipe capacity and PIPE_BUF"           ./bin/09_pipe_capacity
run "10  SIGPIPE, default disposition"         ./bin/10_sigpipe
run "10  SIGPIPE ignored -> EPIPE"             ./bin/10_sigpipe ignore
run "11  ls | sort, built by hand"             ./bin/11_shell_pipeline
run "11  ls | sort with the parent's close omitted (hangs)" ./bin/11_shell_pipeline broken
run "12  one pipe, two directions: silent failure" ./bin/12_bidir_one_pipe
run "13  two pipes, done correctly"            ./bin/13_bidir_two_pipes
run "16  open() on a FIFO is a rendezvous"     ./bin/16_fifo_open_blocks

hr; head_ "14 + 15  FIFO client/server"
printf '\033[2m(normally these go in two terminals -- see scripts/demo_fifo.sh)\033[0m\n'
./scripts/demo_fifo.sh
hr
printf '\n\033[1;32mAll demos finished.\033[0m Re-read the source of each demo to see what it proves.\n\n'
