# Explanations

What each demo proves, what you should expect to see, and what to change if you want to break it.

Slide numbers refer to the lecture deck *Inter Process Communication: Pipes and FIFO*.

---

## The three ideas everything else hangs off

Read these once before the demos. Almost every confusing result below is one of the three.

### 1. File descriptors have three levels, not two

```
  process A                    kernel                      object
  ┌──────────┐            ┌──────────────────┐        ┌──────────────┐
  │ fd table │ ────────▶  │ open file        │ ─────▶ │ pipe buffer  │
  │ 0 1 2 3 4│            │ description      │        │  (64 KiB)    │
  └──────────┘            │ (offset, flags)  │        └──────────────┘
                          └──────────────────┘
                             ▲
  process B                  │
  ┌──────────┐               │
  │ fd table │ ──────────────┘
  └──────────┘
```

- **`fork()` copies level 1 and shares levels 2 and 3.** The child gets its own array; the entries
  point at the *same* descriptions. That is why pipe inheritance works, and why closing a
  descriptor in one process does not close it in the other.
- **`dup2()` copies a level-1 entry.** Two slots, one description, shared offset and flags.
- **The kernel reference-counts level 2.** That count is what decides EOF.

### 2. EOF means "nobody anywhere can still write to me"

A blocked `read()` returns `0` **only** when the number of open write ends reaches zero. Not when
the writer finishes. Not when the buffer empties. That is why every process must close every end it
does not use — not for tidiness, for correctness.

### 3. `open()` on a FIFO is a rendezvous

`open(path, O_RDONLY)` blocks until somebody opens the same path for writing, and vice versa. A
FIFO server that prints nothing at startup is working correctly.

---

## 00 — `00_fd_inspect` · what a file descriptor is

**Proves:** 0/1/2 are already open before `main` runs; `pipe()` takes the lowest free slots;
a pipe has no name on disk; a pipe is not seekable.

**Expect:**
```
STDIN_FILENO  = 0   STDOUT_FILENO = 1   STDERR_FILENO = 2
fd[0] = 3   <- READ  end
fd[1] = 4   <- WRITE end
  fd 3 -> pipe:[912345]
  fd 4 -> pipe:[912345]
lseek(fd[0], 0, SEEK_SET) = -1, errno = 29 (Illegal seek)
```

**Why:** the program inherits 0, 1, 2 from the shell, so the next free slots are 3 and 4. The
`pipe:[N]` target is an inode in `pipefs`, a filesystem that is never backed by storage — there is
nothing anywhere you could `ls`. `ESPIPE` from `lseek` is the kernel saying there is no rewind:
bytes that have been read are gone.

**Try:** run it again as `./bin/00_fd_inspect | cat` and watch `isatty(STDOUT_FILENO)` flip from 1
to 0. Programs *can* tell whether they are in a pipeline, and many change behaviour when they are.

> Slides 4, 24.

---

## 01 — `01_pipe_basics` · write to `fd[1]`, read from `fd[0]`

**Proves:** the basic mechanism. Bytes written to the write end become readable from the read end.

**Expect:** `writing to file descriptor #4` / `reading from file descriptor #3` / `read "CSCE 313"`.

**Why the count is 9 and not 8:** `"CSCE 313"` is eight characters. The ninth byte is the `'\0'`
the compiler appends to the string literal. The program sends 9 so the terminator travels through
the pipe too — which is the only reason `printf("%s")` works on the other side.

**The habit this demo teaches:** do not rely on a NUL arriving. Use `read()`'s return value and
terminate the string yourself:

```c
ssize_t n = read(fd, buf, sizeof buf - 1);
if (n >= 0) buf[n] = '\0';
```

> Slides 5, 6.

---

## 02 — `02_bytes_not_strings` · a pipe has never heard of a string

**Proves:** a pipe moves bytes. Structure is entirely the application's problem.

**Expect:** pass (a) sends 8 bytes and prints `"CSCE 313XXXXXXXXX..."` — `printf` ran off the end
of the data. Pass (b) sends 9 and prints `"CSCE 313"`.

**Why:** the receiving buffer is pre-filled with `'X'` so the overrun is visible. In a real program
it is whatever happened to be on the stack, which is why this bug is intermittent and miserable to
reproduce. The hex dump under each pass shows exactly what crossed the pipe.

**Wider point:** a pipe is a *byte stream*, not a message queue. Three writes of ten bytes can
arrive as one read of thirty. If your protocol needs message boundaries, you must add them —
length prefixes, delimiters, fixed-size records.

> Slide 4 ("data is received in the order it is sent" — order yes, boundaries no).

---

## 03 — `03_fork_basics` · `fork()` returns twice

**Proves:** one call, two returns; memory is copied, descriptors are shared.

**Expect:** the child reports `fork() returned 0` and `x = 101`; the parent reports the child's PID
and `x = 1100`. Neither sees the other's change.

**Why:** there is no "child's code" in the file. Both processes execute the same instructions from
the `fork` onward. The *only* thing that differs is the return value — `0` in the child, the
child's PID in the parent. The child gets 0 because it can always call `getpid()`, whereas the
parent has no other way to learn the child's PID; the scarce information goes to the parent.

**The distinction that matters for the rest of the module:** `x` is copied, so the child's
increment is invisible. Open file descriptions are *shared*, so a pipe created before the fork is
the same pipe on both sides.

> Slide 15.

---

## 04 — `04_fork_count` · counting processes

**Proves:** `2^n` for unconditional forks, and why memorising `2^n` is a trap.

**Expect:**
```
./bin/04_fork_count 3 | wc -l          ->  8
./bin/04_fork_count 3 break | wc -l    ->  4
```

**Why:** in the first, every process executes every remaining `fork`, so the population doubles
three times: 1 → 2 → 4 → 8. In the second, each child `break`s out of the loop immediately, so only
the original parent keeps forking: one parent plus three children = 4.

**Precision note:** after three unconditional forks, **8 processes exist** and **7 were created**.
The deck says "processes created = 2^n"; say "processes running" and the ambiguity goes away.

**Also notice:** you counted the processes *using a pipe*. `| wc -l` is the subject of this lecture
being used as a tool inside it.

> Slides 16, 17.

---

## 05 — `05_buffering_trap` · `printf` + `fork` = duplicated output

**Proves:** `stdio` is a user-space library sitting on top of the kernel, and `fork` copies its
buffers along with everything else.

**Expect:**
```
$ ./bin/05_buffering_trap          ->  AB (pid 1234)
                                       B (pid 1235)
$ ./bin/05_buffering_trap | cat    ->  AB (pid 1240)
                                       AB (pid 1241)      <- the A appears TWICE
```

**Why:** `stdout` is *line buffered* when it is a terminal but *fully buffered* (4 KiB) when it is
a pipe or a file. With full buffering, `printf("A")` leaves the `A` sitting in the user-space
buffer. `fork()` then copies the entire address space, **buffer included**. Two processes now each
hold an unflushed `A`, and each flushes at exit.

**Fixes, any one of them:**
- `fflush(stdout)` immediately before the `fork` (uncomment the line in the source)
- `setvbuf(stdout, NULL, _IONBF, 0)` to disable buffering
- use `write(1, "A", 1)` — an unbuffered syscall — instead of `printf`

Every "my output is duplicated / out of order" report in this course is this. That is also why
every other demo in this repository uses `say()`, which calls `write()` once, rather than `printf`.

> Slide 18 area; not on any slide, but it will happen to your students.

---

## 06 — `06_pipe_fork_hang` · **the bug**

**Proves:** a missing `close()` in *one* process deadlocks *both*.

**Expect:** the child reads all nine bytes, then everything stops. After five seconds an alarm
prints the diagnosis and exits. Note what is **missing** from the output: the child never printed
`EXITING`.

**Why:** trace the write-end count.

| Event | Write ends open | EOF possible? |
|---|---|---|
| after `pipe()` | 1 | — |
| after `fork()` | 2 | no |
| parent closes its write end | **1** — the child's, never closed | **no** |
| child drains the 9 bytes | 1 | no |
| child calls `read()` again | 1 | no — **blocks** |

The child is waiting for a write end to close, and it is holding that write end itself. The kernel's
reasoning is sound: *somebody* can still write, so more data might arrive, so `read` must wait. It
has no way to know the somebody is the reader, and that the reader has no intention of writing.

**And it is worse than a stuck child — it is a genuine two-party deadlock:**
- the child blocks in `read()`, waiting for EOF;
- the parent blocks in `wait(NULL)`, waiting for the child to exit.

Circular wait, no timeout. Without the alarm, `Ctrl-C` is the only way out.

**"But the parent closed the write end."** Yes — *its own*. `close()` acts on your fd-table slot,
not on the pipe. Go back to the three-level picture and count arrows.

> Slide 20.

---

## 07 — `07_pipe_fork_fixed` · one line

**Proves:** `close(pipefds[1])` in the child is the entire fix.

**Expect:** same output as demo 06, plus `read() returned 0`, `CHILD EXITING`, and
`child reaped, exiting cleanly`.

**Why:** the count now goes 2 → 1 (child closes) → 0 (parent closes). `read` returns 0, the loop
ends, the child exits, `wait` returns.

**Confirm it is the only difference:**
```bash
diff src/06_pipe_fork_hang.c src/07_pipe_fork_fixed.c
```

**The checklist — four closes per pipe per pair:**
1. The **writer** closes its read end.
2. The **reader** closes its write end.
3. The writer closes its write end when it has finished writing — *this delivers EOF*.
4. The reader closes its read end when it has finished reading.

**If a program hangs, count your closes first.**

> Slide 21.

---

## 08 — `08_partial_read` · short reads

**Proves:** `read()` returning fewer bytes than requested is normal, not an error, and not EOF.

**Expect:** pass 1 asks for 26 bytes and gets 4. Pass 2 uses `read_fully()` and gets all 26.

**Why:** the child dribbles the message out in chunks of 4, 7, 3 and 12 with pauses. A single
`read()` returns whatever happened to be in the buffer at that moment. The writer may still be
mid-transmission.

**The idiom** (in `src/common.h`) — three distinct cases, three distinct responses:

```c
ssize_t r = read(fd, (char *)buf + got, n - got);
if (r == 0)  break;                          // EOF: all writers closed
if (r < 0) { if (errno == EINTR) continue;   // interrupted: retry
             return -1; }                    // a real error
got += r;
```

Code that collapses these into `if (read(...) <= 0) break;` has intermittent bugs waiting for it.

> Not on the slides; the deck's one-byte-at-a-time loop hides this. It will bite in the machine
> problems.

---

## 09 — `09_pipe_capacity` · how big is a pipe?

**Proves:** the buffer is finite, and the number is real.

**Expect:** `write() stopped after 65536 bytes (errno = 11, Resource temporarily unavailable)` —
64 KiB, and `PIPE_BUF = 4096`.

**Why two different numbers:**
- **Capacity (64 KiB)** — how much unread data fits before `write()` blocks. Tunable per pipe with
  `fcntl(fd, F_SETPIPE_SZ, n)`.
- **`PIPE_BUF` (4096)** — the *atomicity* threshold. A single `write()` of at most `PIPE_BUF` bytes
  is guaranteed not to interleave with another writer's data. Above that, no guarantee. This is why
  multi-writer logging protocols keep records under 4 KiB.

**Try:** delete the `fcntl(... O_NONBLOCK)` line. The program now hangs at exactly 65536 bytes,
because with blocking descriptors a full pipe means the writer waits for a reader that never comes.

> Not on the slides. It is the answer to "what if I never read from the pipe?"

---

## 10 — `10_sigpipe` · writing with no reader

**Proves:** `SIGPIPE` is the mirror image of EOF. EOF protects the reader from a dead writer;
`SIGPIPE` protects the writer from a dead reader.

**Expect:**
```
$ ./bin/10_sigpipe          -> output stops abruptly; echo $? says 141
$ ./bin/10_sigpipe ignore   -> write() returned -1, errno = 32 (Broken pipe)
```

**Why:** 141 = 128 + 13, i.e. killed by signal 13, `SIGPIPE`. Its default action is to terminate
the process. If you `signal(SIGPIPE, SIG_IGN)`, `write` returns `-1` with `errno == EPIPE` instead,
and you handle it like any other error.

**Where you have already seen this:** `yes | head -3`. `yes` writes forever; `head` prints three
lines and exits, closing the read end; `yes` gets `SIGPIPE` on its next write and dies. That is the
entire reason the command returns to your prompt. It is also an efficiency mechanism — it stops
upstream stages doing work nobody will consume.

Servers usually ignore `SIGPIPE` so that a disconnecting client cannot kill them.

> Not on the slides; it is the other half of Slide 20's EOF story.

---

## 11 — `11_shell_pipeline` · `ls | sort`, built by hand

**Proves:** everything at once. `pipe` + `fork` + `dup2` + `close` + `exec` is a shell pipeline.

**Expect:** a size-sorted `ls -l`. Then `./bin/11_shell_pipeline broken` hangs and reports why.

**The order of operations in each child:**
```c
close(fd[0]);                  // ls never reads from the pipe
dup2(fd[1], STDOUT_FILENO);    // stdout IS the pipe now
close(fd[1]);                  // the original copy is redundant
execlp("ls", "ls", "-l", NULL);
```

**Four things worth understanding here:**

1. **`dup2(oldfd, newfd)` is an assignment**, source first, destination second — like `memcpy`. It
   *silently closes* `newfd` first if it was open. Reverse the arguments and it compiles, runs, and
   does the opposite of what you meant.
2. **The parent must close both ends.** This is demo 06's bug in a different costume. If the parent
   keeps `fd[1]`, then when `ls` exits the write count is still 1, `sort` never sees EOF, `sort`
   never exits, `wait` never returns, the shell hangs. The parent is not part of the data flow, so
   it must get out of the way completely. Run `broken` to watch it.
3. **`exec` keeps the descriptor table.** It replaces the program image — code, data, stack — but
   not the descriptors (unless they are marked `FD_CLOEXEC`). That is the entire mechanism behind
   shell redirection.
4. **Neither `ls` nor `sort` contains one line of pipe code.** They write to descriptor 1 and read
   from descriptor 0. The plumbing was arranged before they started running. That abstraction is
   why Unix composition works at all.

> Slides 7, 13, 14, 24, 25.

---

## 12 — `12_bidir_one_pipe` · the silent failure

**Proves:** one pipe cannot do two-way communication, and it fails *without telling you*.

**Expect:** the child receives `PING`, sends `PONG` into the same pipe, reads again, and gets back
its own `PONG`.

**Why:** a pipe is a single queue with no notion of sender. The child still holds a read end, so
when it writes a reply those bytes join the queue and whoever calls `read` next takes them —
including the child itself.

**The important part is the failure mode**, not the prohibition. Slide 22 says this "will fail";
be precise with students:
- **non-deterministic** — depends on scheduling, and may appear to work in testing;
- **silent** — no error, no signal;
- **self-referential** — a process talking to itself while believing it has a peer.

Slide 35's last bullet says the same thing about FIFOs. Same mechanism, same fix.

> Slide 22, Slide 35.

---

## 13 — `13_bidir_two_pipes` · the correct pattern

**Proves:** one pipe per direction works, and shows the closing discipline at full scale.

**Expect:** three clean PING/PONG rounds, then the parent closes `pcfd[1]`, the child sees EOF and
shuts down.

**Naming matters more than it sounds.** `pcfd` = parent-to-child, `cpfd` = child-to-parent. With
`fd1`/`fd2` you will lose track within ten lines.

**The invariant that never changes:** `write` uses index 1, `read` uses index 0 — on *both* pipes.

**Eight descriptors after the fork; each process closes four:**

|  | parent keeps | child keeps |
|---|---|---|
| `pcfd` (parent → child) | `pcfd[1]` write | `pcfd[0]` read |
| `cpfd` (child → parent) | `cpfd[0]` read | `cpfd[1]` write |
| **closes** | `pcfd[0]`, `cpfd[1]` | `pcfd[1]`, `cpfd[0]` |

**The hazard this demo avoids.** It works because the protocol *alternates* and the messages are
tiny. If both sides wrote megabytes before either read:

1. the parent fills the 64 KiB `pcfd` buffer and blocks in `write`;
2. the child fills the 64 KiB `cpfd` buffer and blocks in `write`;
3. neither ever reaches its `read`.

Circular wait again — but this one is a *protocol* bug, not a missing `close`. Every line is
correct and the program as a whole is wrong. It passes on small test inputs and fails in grading.
Fixes are structural: bounded alternating messages, `O_NONBLOCK` with `poll`/`select`, a thread per
direction, or `socketpair()`.

> Slides 23, 26.

---

## 14 + 15 — `14_fifo_server`, `15_fifo_client` · a real client and server

**Proves:** two unrelated programs, no shared ancestor, connected by a pathname.

**Expect:** the server prints `hello` five times (for 5, 4, 3, 2, 1), reads `0`, shuts down and
unlinks the FIFO.

**Run them in two terminals.** That is not a formality — it is the demonstration. These processes
have no ancestry relationship at all. Different programs, started at different times, possibly by
different users. The only thing they share is `/tmp/CSCE313_FIFO`. That is what a FIFO buys you and
an anonymous pipe cannot.

**Asymmetry worth pointing out:** the client never calls `mkfifo`. It opens a name that already
exists. The server owns the rendezvous point's lifetime, including the `unlink`.

**`close` is not `unlink`.** `close` releases your descriptor; `unlink` removes the directory entry.
A server that closes but never unlinks leaves the FIFO behind for the next run to trip over.

**Two bugs in the slide version that this code fixes:**

1. **`assert(mkfifo(...) == 0)`** puts a call with side effects inside an assertion. Compile with
   `-DNDEBUG` — the default for release builds — and the preprocessor deletes the whole expression,
   `mkfifo` call included. The FIFO is then never created, and the failure depends on compiler
   flags. **Never put a side-effecting call inside `assert`.** This version checks the return value
   and tolerates `EEXIST`, which also fixes the second-run problem.

2. **`if (read(...) != sizeof(int)) continue;`** busy-waits at 100% CPU if the client dies without
   sending `0`: all writers are gone, `read` returns 0 forever, `0 != 4`, the loop spins. This
   version distinguishes the three cases — `0` means shut down, `EINTR` means retry, a genuine
   partial read means continue.

**`sleep(1)` in the client is cosmetic.** It exists so the demo is watchable. It is *not*
synchronisation, and `sleep()` is never synchronisation. Run `./bin/15_fifo_client fast` to remove
it; all six integers land at once and the server prints five `hello`s instantly, which is equally
correct.

**The client writes raw bytes of an `int`, not the character `'5'`.** Try
`echo 5 > /tmp/CSCE313_FIFO` and watch the server misread it. Both ends must agree on the wire
format. That is the framing problem from demo 02, made concrete.

> Slides 31, 32, 33, 34.

---

## 16 — `16_fifo_open_blocks` · the rendezvous

**Proves:** `open()` on a FIFO blocks until the other side arrives. **This is the number-one source
of "my server is broken" reports, and the deck never mentions it.**

**Expect:** the writer sleeps three seconds on purpose; the reader's `open()` returns after exactly
three seconds.

**The blocking rules:**

| Open mode | Behaviour |
|---|---|
| `O_RDONLY` | **blocks** until some process opens for writing |
| `O_WRONLY` | **blocks** until some process opens for reading |
| `O_RDONLY \| O_NONBLOCK` | succeeds immediately, no writer needed |
| `O_WRONLY \| O_NONBLOCK` | **fails with `ENXIO`** if there is no reader |
| `O_RDWR` | returns immediately; works on Linux, undefined by POSIX |

Note the asymmetry in the middle two rows: **readers may wait alone; writers may not.** The demo
shows both, back to back, with the errno printed.

**What to tell students before lab:** start the server, see nothing, that is correct — now start
the client.

**The 15-second shell version**, worth doing live:
```bash
mkfifo /tmp/demo
cat < /tmp/demo          # terminal A: hangs
echo hi > /tmp/demo      # terminal B: both unblock instantly
```

> Not on any slide. Add it.

---

## Where this sits in the wider landscape

| Mechanism | Scope | Shape | Use when |
|---|---|---|---|
| Anonymous pipe | related processes | byte stream | shell pipelines, parent/child plumbing |
| FIFO | same machine | byte stream | simple local client/server, unrelated processes |
| Unix socket | same machine | stream or datagram | bidirectional, message boundaries, fd passing |
| `socketpair()` | related processes | bidirectional stream | a two-way pipe in one call |
| POSIX message queue | same machine | messages + priority | you need real message boundaries |
| Shared memory | same machine | raw memory | bulk data, and you will write the synchronisation |
| TCP socket | network | byte stream | different machines |
| Signals | same machine | one bit | notification only, no data |

---

## The five rules

1. `fd[0]` reads, `fd[1]` writes. (0 = stdin, 1 = stdout.)
2. `pipe()` **before** `fork()`, never after.
3. Close every end you do not use, in every process.
4. EOF happens only when the **last** write end closes.
5. `read()` may return fewer bytes than you asked for.

**If it hangs, count your closes.**

---

## Man pages

`man 2 pipe` · `man 2 fork` · `man 2 dup2` · `man 3 mkfifo` · `man 7 pipe` · `man 7 fifo`

Section 7 is where the behaviour tables live, and most students do not know it exists.
