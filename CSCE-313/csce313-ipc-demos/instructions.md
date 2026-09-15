# Instructions

A runnable companion to the CSCE 313 lecture *Inter Process Communication: Pipes and FIFO*.
Seventeen small C programs. Each one isolates exactly one idea, prints timestamps and PIDs so
you can see who is blocked and for how long, and either succeeds visibly or fails visibly.

Two of them **deadlock on purpose**. That is the point.

---

## 1. Requirements

- Linux (the course VM: Ubuntu Server 26.04 arm64) or macOS
- A C compiler: `gcc`, `clang`, or `cc`
- `make`

Nothing else. No libraries, no network, no root.

> On the course VM everything is already present. If you are on macOS, `/proc` does not exist,
> so demo 00's descriptor listing will be shorter — everything else behaves identically.

---

## 2. Build

```bash
unzip csce313-ipc-demos.zip -d /path/to/directory
cd csce313-ipc-demos
make
```

Binaries land in `bin/`. The build is warning-clean under `-Wall -Wextra -Wpedantic`; if you see
a warning, tell your TA, because that is a bug in the demo and not in your setup.

Using a specific compiler:

```bash
make CC=clang-20
make CC=gcc
```

---

## 3. Run everything

```bash
./run_all.sh          # straight through, about 30 seconds
./run_all.sh -p       # pause for ENTER between demos -- use this in lecture
```

`run_all.sh` always terminates. The two demos that hang have a five-second alarm that prints the
diagnosis and exits.

---

## 4. Run them one at a time

This is the better way to actually learn the material. Read the source first, predict the output,
then run it.

```bash
./bin/00_fd_inspect            # what a file descriptor is
./bin/01_pipe_basics           # write to fd[1], read from fd[0]
./bin/02_bytes_not_strings     # a pipe has never heard of a string
./bin/03_fork_basics           # fork returns twice
./bin/04_fork_count 3          # 2^n processes
./bin/04_fork_count 3 break    # the "if child, break" idiom -> n+1
./bin/05_buffering_trap        # printf + fork = duplicated output
./bin/06_pipe_fork_hang        # THE BUG (deadlocks, exits after 5s)
./bin/07_pipe_fork_fixed       # one close() later
./bin/08_partial_read          # read() can return fewer bytes than asked
./bin/09_pipe_capacity         # how big is a pipe?
./bin/10_sigpipe               # writing with no reader kills you
./bin/10_sigpipe ignore        # ...unless you ignore it, then EPIPE
./bin/11_shell_pipeline        # ls | sort, built by hand
./bin/11_shell_pipeline broken # the parent forgets to close -> hangs
./bin/12_bidir_one_pipe        # one pipe two ways: silent failure
./bin/13_bidir_two_pipes       # the correct pattern
./bin/16_fifo_open_blocks      # open() on a FIFO is a rendezvous
```

Some demos are meant to be run **both** ways. These pairs matter:

```bash
./bin/00_fd_inspect            # then again:
./bin/00_fd_inspect | cat      # watch isatty() flip to 0

./bin/05_buffering_trap        # 2 lines
./bin/05_buffering_trap | cat  # 3 lines -- the A is duplicated

./bin/04_fork_count 3 | wc -l        # 8
./bin/04_fork_count 3 break | wc -l  # 4
```

---

## 5. The FIFO demos need two terminals

Demos 14 and 15 are a real client and a real server. They are separate programs with **no shared
ancestor** — that is the whole point of a FIFO — so run them the way they are meant to be run.

**Terminal 1:**
```bash
./bin/14_fifo_server
```

It will print two lines and then appear to hang. **This is correct.** It is blocked inside
`open(FIFO, O_RDONLY)`, which does not return until some process opens the same path for writing.

**Terminal 2:**
```bash
./bin/15_fifo_client
```

Both unblock at the same instant. The server prints `hello` five times, reads a `0`, shuts down,
and unlinks the FIFO.

If you only have one terminal:

```bash
./scripts/demo_fifo.sh
```

---

## 6. Shell-only demos

No compiler needed. Good for lecture, because there is no code to read.

```bash
./scripts/demo_eof.sh      # EOF needs the LAST write end to close
```

Two more worth typing live:

```bash
yes | head -3              # terminates because head's exit sends SIGPIPE to yes
echo $?                    # 0 -- head's status is what the shell reports

ls                         # columns
ls | cat                   # one per line -- ls calls isatty(1)
```

---

## 7. Cleaning up

```bash
make clean                 # remove bin/ and any stale FIFOs
./scripts/cleanup.sh       # just the stale FIFOs
```

**Read this before reporting a bug.** If a FIFO program crashes or you `Ctrl-C` it before it
reaches its `unlink()`, the FIFO stays on disk at `/tmp/CSCE313_FIFO`. Your *next* run then fails
with `EEXIST` for a reason that has nothing to do with whatever you just changed. This is the most
common false bug report in the FIFO lab. Run `./scripts/cleanup.sh` first.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server prints nothing and sits there | Blocked in `open()`, waiting for a writer. **Correct behaviour.** | Start the client. |
| `open: No such file or directory` from the client | The server has not created the FIFO yet | Start the server first |
| `open: No such device or address` (ENXIO) | Non-blocking write-open with no reader | Drop `O_NONBLOCK`, or start a reader |
| `mkfifo: File exists` | A previous run died before `unlink()` | `./scripts/cleanup.sh` |
| Program dies silently, `echo $?` says 141 | `SIGPIPE` (128 + 13) — you wrote to a pipe with no readers | Expected in demo 10 |
| Output appears twice when redirected | `stdio` buffer copied by `fork()` | `fflush(stdout)` before forking |
| Reader never exits | A write end is still open somewhere | Count all four closes |
| Works small, hangs on large input | Buffer filled (64 KiB) and nobody is draining it | Read and write concurrently |
| Demo hangs past 5 seconds | Only 06 and `11 broken` are supposed to hang, and they self-terminate | `Ctrl-C`, then tell your TA |

---

## 9. Exercises

Break things deliberately. That is what the repository is for.

1. **Demo 07** — delete the `close(pipefds[1])` in the child, rebuild, run. You have just
   reproduced demo 06. Now diff the two files and confirm it was the only difference:
   ```bash
   diff src/06_pipe_fork_hang.c src/07_pipe_fork_fixed.c
   ```
2. **Demo 09** — delete the `fcntl(... O_NONBLOCK)` line. The program now hangs at exactly the
   byte count it used to print. Why is that number the same?
3. **Demo 11** — swap the arguments: `dup2(STDOUT_FILENO, fd[1])`. It compiles, it runs, and it
   silently does the opposite of what you meant. What actually happens?
4. **Demo 13** — make both sides send 1 MB before either reads. Find the byte count at which it
   deadlocks and explain it in terms of the pipe capacity from demo 09.
5. **Demo 14** — start the server, start the client, then `Ctrl-C` the *client*. What does the
   server do? Now put the slide's original `if (read(...) != sizeof(int)) continue;` back and try
   again with `top` open in another window.
6. **Demo 15** — replace the client with `echo 5 > /tmp/CSCE313_FIFO`. Explain the server's output.
7. **New program** — extend demo 11 into a three-stage pipeline:
   `ls -l | sort -n -k 5 | tail -n 1`. How many pipes? How many closes in the parent?

---

## 10. Layout

```
csce313-ipc-demos/
├── instructions.md        this file -- how to build and run
├── Makefile
├── run_all.sh
├── src/
│   ├── common.h           say(), die(), read_fully()
│   └── NN_*.c             one idea per file
└── scripts/
    ├── demo_fifo.sh       server + client in one terminal
    ├── demo_eof.sh        EOF demonstrated with shell builtins only
    └── cleanup.sh         remove stale FIFOs
```
