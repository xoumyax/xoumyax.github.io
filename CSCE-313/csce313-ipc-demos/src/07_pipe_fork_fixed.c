/* 07_pipe_fork_fixed -- Slide 21. One extra line and the deadlock is gone.
 *
 * Diff against demo 06 to see it:
 *     diff src/06_pipe_fork_hang.c src/07_pipe_fork_fixed.c
 *
 * The only change that matters is close(pipefds[1]) in the child.
 */
#include "common.h"
#include <sys/wait.h>

int main(void) {
    banner("07 -- fork + pipe, done correctly");

    int pipefds[2];
    if (pipe(pipefds) == -1) die("pipe");
    say("MAIN", "pipe created: read fd=%d, write fd=%d", pipefds[0], pipefds[1]);

    pid_t pid = fork();
    if (pid < 0) die("fork");

    if (pid > 0) {
        /* ---------------- PARENT: writer ---------------- */
        say("PARENT", "write ends open: 2");
        close(pipefds[0]);                 /* rule 1: writer closes its read end */
        say("PARENT", "closed my read end");
        if (write(pipefds[1], "CSCE 313", 9) < 0) die("write");
        say("PARENT", "wrote 9 bytes");
        close(pipefds[1]);                 /* rule 3: this is what delivers EOF */
        say("PARENT", "closed my write end -> write ends open: 0  <-- EOF is now possible");
        wait(NULL);
        say("PARENT", "child reaped, exiting cleanly");
    } else {
        /* ---------------- CHILD: reader ----------------- */
        close(pipefds[1]);                 /* rule 2: reader closes its write end */
        say("CHILD", "closed my write end -> write ends open: 1 (just the parent's)");
        char c;
        ssize_t n;
        while ((n = read(pipefds[0], &c, 1)) == 1)
            say("CHILD", "read from pipe -- '%c'", c ? c : ' ');
        say("CHILD", "read() returned %zd  <-- 0 means EOF: every write end is closed", n);
        close(pipefds[0]);                 /* rule 4 */
        say("CHILD", "EXITING");
        _exit(0);
    }
    return 0;
}
