/* 04_fork_count -- how many processes does N forks make?
 *
 * Usage: ./bin/04_fork_count N            -> N unconditional forks  -> 2^N
 *        ./bin/04_fork_count N break      -> the "if child, break" idiom -> N+1
 *
 * Count them with a pipe, which is itself the point:
 *        ./bin/04_fork_count 3 | wc -l
 */
#include "common.h"
#include <sys/wait.h>

int main(int argc, char **argv) {
    int n = (argc > 1) ? atoi(argv[1]) : 2;
    int use_break = (argc > 2 && strcmp(argv[2], "break") == 0);

    if (n < 0 || n > 10) { fprintf(stderr, "pick N between 0 and 10\n"); return 1; }

    for (int i = 0; i < n; i++) {
        pid_t rc = fork();
        if (rc < 0) die("fork");
        if (use_break && rc == 0) break;   /* children stop forking */
    }

    /* write(), not printf(): see demo 05 for why printf would lie to you here. */
    say("PROC", "alive (pid %d, parent %d)", (int)getpid(), (int)getppid());

    while (wait(NULL) > 0) { }             /* reap whatever children I have */
    return 0;
}
