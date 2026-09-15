/* 11_shell_pipeline -- build "ls -l | sort -n -k 5" by hand.
 *
 * This is the payoff. pipe + fork + dup2 + close + exec, all in one place.
 * Everything the lecture covered shows up here.
 *
 * Usage: ./bin/11_shell_pipeline            correct version
 *        ./bin/11_shell_pipeline broken     parent forgets to close -> hangs
 *
 * The "broken" mode is Slide 20's bug wearing a different costume: if the
 * PARENT keeps the write end open, sort never sees EOF, so sort never exits,
 * so wait() never returns.
 */
#include "common.h"
#include <signal.h>
#include <sys/wait.h>

static volatile pid_t kid1 = -1, kid2 = -1;

static void on_alarm(int sig) {
    (void)sig;
    if (kid1 > 0) kill(kid1, SIGKILL);
    if (kid2 > 0) kill(kid2, SIGKILL);
    const char *msg =
        "\n*** hung for 5 seconds ***\n"
        "    'sort' is blocked in read(), waiting for EOF on the pipe.\n"
        "    'ls' already exited, but the PARENT still holds fd[1] open,\n"
        "    so the write-end count is 1, not 0, and EOF never arrives.\n"
        "    The parent is not part of the data flow. It must close BOTH ends.\n";
    ssize_t ignored = write(STDERR_FILENO, msg, strlen(msg));
    (void)ignored;
    _exit(3);
}

int main(int argc, char **argv) {
    int broken = (argc > 1 && strcmp(argv[1], "broken") == 0);

    banner(broken ? "11 -- ls | sort, parent forgets to close (hangs)"
                  : "11 -- ls | sort, built by hand");

    int fd[2];
    if (pipe(fd) == -1) die("pipe");

    /* ---------------- stage 1: ls ---------------- */
    pid_t p1 = fork();
    if (p1 < 0) die("fork");
    kid1 = p1;
    if (p1 == 0) {
        close(fd[0]);                       /* ls never reads from the pipe */
        dup2(fd[1], STDOUT_FILENO);         /* stdout IS the pipe now */
        close(fd[1]);                       /* the original copy is redundant */
        execlp("ls", "ls", "-l", (char *)NULL);
        die("execlp ls");                   /* only reached if exec fails */
    }

    /* ---------------- stage 2: sort -------------- */
    pid_t p2 = fork();
    if (p2 < 0) die("fork");
    kid2 = p2;
    if (p2 == 0) {
        close(fd[1]);                       /* sort never writes to the pipe */
        dup2(fd[0], STDIN_FILENO);          /* stdin IS the pipe now */
        close(fd[0]);
        execlp("sort", "sort", "-n", "-k", "5", (char *)NULL);
        die("execlp sort");
    }

    /* ---------------- the parent ----------------- */
    close(fd[0]);
    if (broken) {
        signal(SIGALRM, on_alarm);
        alarm(5);
        /* deliberately NOT closing fd[1] */
    } else {
        close(fd[1]);                       /* <-- the line students omit */
    }

    waitpid(p1, NULL, 0);
    waitpid(p2, NULL, 0);

    fprintf(stderr, "\n(ls and sort both exited. Neither program contains one line\n"
                    " of pipe code -- the plumbing was arranged before they started.)\n");
    return 0;
}
