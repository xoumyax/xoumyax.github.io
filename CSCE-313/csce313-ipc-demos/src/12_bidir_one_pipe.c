/* 12_bidir_one_pipe -- why ONE pipe cannot do two-way communication.
 *
 * Slide 22 says this "will fail". It fails silently and non-deterministically,
 * which is worse than failing loudly. Here it is, made deterministic so you can
 * see the mechanism: the child reads back its own reply.
 *
 * A pipe is a queue, not a routed channel. Nobody is addressing anybody.
 */
#include "common.h"
#include <sys/wait.h>

int main(void) {
    banner("12 -- one pipe, two directions: the silent failure");

    int fd[2];
    if (pipe(fd) == -1) die("pipe");

    pid_t pid = fork();
    if (pid < 0) die("fork");

    if (pid == 0) {
        /* ---- child: reads a request, writes a reply, then reads again ---- */
        char buf[32] = {0};
        ssize_t n = read(fd[0], buf, sizeof buf - 1);
        if (n > 0) buf[n] = '\0';
        say("CHILD", "got request: \"%s\"", buf);

        if (write(fd[1], "PONG", 5) < 0) die("write");
        say("CHILD", "sent reply: \"PONG\" (into the SAME pipe)");

        usleep(100000);
        memset(buf, 0, sizeof buf);
        n = read(fd[0], buf, sizeof buf - 1);
        if (n > 0) buf[n] = '\0';
        say("CHILD", "read again and got: \"%s\"   <-- MY OWN REPLY", buf);
        say("CHILD", "no error, no signal. it just silently talked to itself.");
        _exit(0);
    }

    /* ---- parent ---- */
    if (write(fd[1], "PING", 5) < 0) die("write");
    say("PARENT", "sent request: \"PING\"");
    wait(NULL);

    printf("\nThe child holds a read end too, so whoever calls read() next takes\n"
           "the bytes -- regardless of who wrote them. The parent's reply never\n"
           "arrived, and nothing reported an error. See demo 13 for the fix.\n");

    close(fd[0]);
    close(fd[1]);
    return 0;
}
