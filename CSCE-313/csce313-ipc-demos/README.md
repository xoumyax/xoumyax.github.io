# CSCE 313 — IPC Demos: Pipes and FIFOs

Runnable companion to the lecture *Inter Process Communication: Pipes and FIFO*.
Seventeen small C programs, one idea each. Two of them deadlock on purpose.

```bash
make
./run_all.sh -p           # runs all
```

- **[instructions.md](instructions.md)** — build, run, two-terminal FIFO workflow,
  troubleshooting table, exercises.
- **[explanations.md](explanations.md)** — what each demo proves, expected output, and why.

Start with [explanations.md § The three ideas everything else hangs off](explanations.md).

## The five rules

1. `fd[0]` reads, `fd[1]` writes.
2. `pipe()` before `fork()`, never after.
3. Close every end you do not use, in every process.
4. EOF happens only when the **last** write end closes.
5. `read()` may return fewer bytes than you asked for.

**If it hangs, count your closes.**
