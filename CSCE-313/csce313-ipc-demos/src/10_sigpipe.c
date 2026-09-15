/* 10_sigpipe -- writing to a pipe nobody is reading.
 *
 * EOF protects the reader from a dead writer.
 * SIGPIPE protects the writer from a dead reader. Mirror images.
 *
 * Pass 1: default disposition -- the writer process is KILLED.
 * Pass 2: SIGPIPE ignored     -- write() returns -1 with errno == EPIPE.
 *
 * This is why "yes | head -3" terminates instead of running forever.
 */
#include "common.h"
#include <signal.h>
#include <sys/wait.h>

static void writer(int ignore_sigpipe) {
    int fd[2];
    if (pipe(fd) == -1) die("pipe");

    pid_t pid = fork();
    if (pid < 0) die("fork");

    if (pid == 0) {
        /* child: the reader that gives up immediately */
        close(fd[1]);
        close(fd[0]);
        say("CHILD", "closed BOTH ends -- there is now no reader at all");
        _exit(0);
    }

    close(fd[0]);                     /* parent is not a reader either */
    wait(NULL);                       /* make sure the child is gone first */
    usleep(50000);

    if (ignore_sigpipe) signal(SIGPIPE, SIG_IGN);

    say("PARENT", "writing into a pipe with zero readers ...");
    errno = 0;
    ssize_t n = write(fd[1], "hello", 5);
    say("PARENT", "write() returned %zd, errno = %d (%s)",
        n, errno, errno ? strerror(errno) : "none");
    close(fd[1]);
}

int main(int argc, char **argv) {
    int ignore = (argc > 1 && strcmp(argv[1], "ignore") == 0);
    banner(ignore ? "10 -- SIGPIPE ignored (write returns EPIPE)"
                  : "10 -- SIGPIPE default (this process is about to die)");

    if (!ignore) {
        printf("Run me again as './bin/10_sigpipe ignore' to see the other half.\n");
        printf("If the next line is the last thing you see, SIGPIPE killed me.\n");
        printf("Check the exit status: 141 = 128 + 13 = killed by signal 13.\n\n");
        fflush(stdout);
    }

    writer(ignore);

    say("PARENT", "still alive -- so the signal was ignored and we got EPIPE instead");
    return 0;
}
