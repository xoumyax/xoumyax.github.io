/* 13_bidir_two_pipes -- the correct pattern: one pipe per direction.
 *
 *   pcfd = parent -> child
 *   cpfd = child  -> parent
 *
 * Directional names matter. With fd1/fd2 you lose track within ten lines.
 *
 * Eight descriptors exist after the fork. Each process closes FOUR.
 * Note the invariant that never changes: write uses index 1, read uses index 0,
 * on BOTH pipes.
 */
#include "common.h"
#include <sys/wait.h>

#define ROUNDS 3

int main(void) {
    banner("13 -- two pipes, ping/pong");

    int pcfd[2], cpfd[2];
    if (pipe(pcfd) == -1) die("pipe pcfd");
    if (pipe(cpfd) == -1) die("pipe cpfd");

    pid_t pid = fork();
    if (pid < 0) die("fork");

    if (pid == 0) {
        /* ---- child: reads pcfd, writes cpfd ---- */
        close(pcfd[1]);                    /* I never write to parent->child */
        close(cpfd[0]);                    /* I never read from child->parent */
        say("CHILD", "closed pcfd[1] and cpfd[0]");

        char buf[32];
        ssize_t n;
        while ((n = read(pcfd[0], buf, sizeof buf - 1)) > 0) {
            buf[n] = '\0';
            say("CHILD", "request  <- \"%s\"", buf);
            char reply[40];
            int len = snprintf(reply, sizeof reply, "PONG-%s", buf + 5);
            if (write(cpfd[1], reply, (size_t)len + 1) < 0) die("write");
            say("CHILD", "reply    -> \"%s\"", reply);
        }
        say("CHILD", "read() returned 0 -- parent closed pcfd, shutting down");
        close(pcfd[0]);
        close(cpfd[1]);
        _exit(0);
    }

    /* ---- parent: writes pcfd, reads cpfd ---- */
    close(pcfd[0]);
    close(cpfd[1]);
    say("PARENT", "closed pcfd[0] and cpfd[1]");

    for (int i = 1; i <= ROUNDS; i++) {
        char req[32];
        int len = snprintf(req, sizeof req, "PING-%d", i);
        if (write(pcfd[1], req, (size_t)len + 1) < 0) die("write");
        say("PARENT", "request  -> \"%s\"", req);

        char buf[40];
        ssize_t n = read(cpfd[0], buf, sizeof buf - 1);
        if (n <= 0) break;
        buf[n] = '\0';
        say("PARENT", "reply    <- \"%s\"", buf);
    }

    close(pcfd[1]);                        /* delivers EOF to the child */
    say("PARENT", "closed pcfd[1] -> child will now see EOF");
    close(cpfd[0]);
    wait(NULL);
    say("PARENT", "child reaped. clean exit.");

    printf("\nThis works because the protocol ALTERNATES and the messages are tiny.\n"
           "If both sides wrote megabytes before either read, both 64 KiB buffers\n"
           "would fill, both processes would block in write(), and neither would\n"
           "ever reach its read(). That is the two-pipe deadlock.\n");
    return 0;
}
