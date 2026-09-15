/* 03_fork_basics -- called once, returns twice.
 *
 * There is no "child's code" in this file. Both processes run the same
 * instructions from the fork onward. The ONLY difference is the return value.
 */
#include "common.h"
#include <sys/wait.h>

int main(void) {
    banner("03 -- fork() returns twice");

    int x = 100;                     /* watch what happens to this */

    say("BEFORE", "only one process exists here. x = %d", x);

    pid_t rc = fork();
    if (rc < 0) die("fork");

    if (rc == 0) {
        /* ---- child ---- */
        x += 1;
        say("CHILD", "fork() returned %d  (0 means: I am the child)", (int)rc);
        say("CHILD", "my pid = %d, my parent = %d", (int)getpid(), (int)getppid());
        say("CHILD", "x = %d  <- I incremented MY copy", x);
        _exit(0);
    } else {
        /* ---- parent ---- */
        x += 1000;
        say("PARENT", "fork() returned %d (>0 means: I am the parent, and that "
                      "is my child's pid)", (int)rc);
        say("PARENT", "my pid = %d", (int)getpid());
        say("PARENT", "x = %d  <- the child's change is invisible to me", x);
        int status = 0;
        wait(&status);
        say("PARENT", "child reaped; WIFEXITED=%d WEXITSTATUS=%d",
            WIFEXITED(status), WEXITSTATUS(status));
    }

    say("PARENT", "memory is COPIED. file descriptors are SHARED. "
                  "That distinction is the whole lecture.");
    return 0;
}
