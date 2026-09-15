/* 06_pipe_fork_hang -- Slide 20. THE BUG. This program deadlocks on purpose.
 *
 * The child never closes ITS copy of the write end, so the write-end reference
 * count never reaches zero, so read() never returns 0, so the child never exits,
 * so the parent's wait() never returns. Circular wait. Real deadlock.
 *
 * A 5-second alarm rescues you so the demo terminates. In the version on the
 * slide there is no alarm and Ctrl-C is the only way out.
 */
#include "common.h"
#include <signal.h>
#include <sys/wait.h>

static volatile pid_t child_pid = -1;

static void on_alarm(int sig) {
    (void)sig;
    if (child_pid > 0) kill(child_pid, SIGKILL);   /* release the blocked child */
    const char *msg =
        "\n*** 5 seconds with no progress. This is the deadlock. ***\n"
        "    CHILD  is blocked in read()  -- waiting for EOF\n"
        "    PARENT is blocked in wait()  -- waiting for the child to exit\n"
        "    EOF needs the write-end count to hit 0. It is stuck at 1,\n"
        "    because the CHILD still holds pipefds[1] open.\n"
        "    Notice CHILD never printed \"EXITING\".\n"
        "    Fix: demo 07 adds one line -- close(pipefds[1]) in the child.\n";
    ssize_t ignored = write(STDERR_FILENO, msg, strlen(msg));
    (void)ignored;
    _exit(3);
}

int main(void) {
    banner("06 -- fork + pipe, MISSING close() in the child (hangs)");

    int pipefds[2];
    char buf[30];
    memset(buf, 0, sizeof buf);

    if (pipe(pipefds) == -1) die("pipe");
    say("MAIN", "pipe created: read fd=%d, write fd=%d", pipefds[0], pipefds[1]);
    say("MAIN", "write ends open: 1");

    pid_t pid = fork();
    if (pid < 0) die("fork");
    child_pid = pid;

    if (pid > 0) {
        /* ---------------- PARENT ---------------- */
        signal(SIGALRM, on_alarm);
        alarm(5);

        say("PARENT", "after fork, write ends open: 2 (mine + the child's)");
        close(pipefds[0]);
        say("PARENT", "closed my read end");
        if (write(pipefds[1], "CSCE 313", 9) < 0) die("write");
        say("PARENT", "wrote 9 bytes");
        close(pipefds[1]);
        say("PARENT", "closed my write end -> write ends open: 1  <-- NOT ZERO");
        say("PARENT", "calling wait(NULL) ...");
        wait(NULL);
        say("PARENT", "wait() returned (you will never see this line)");
    } else {
        /* ---------------- CHILD ----------------- */
        /*  >>> THE BUG: close(pipefds[1]) belongs right here. <<<  */
        say("CHILD", "reading one byte at a time ...");
        char c;
        while (read(pipefds[0], &c, 1) == 1)
            say("CHILD", "read from pipe -- '%c'", c ? c : ' ');
        close(pipefds[0]);
        say("CHILD", "EXITING");     /* never reached */
        _exit(0);
    }
    return 0;
}
