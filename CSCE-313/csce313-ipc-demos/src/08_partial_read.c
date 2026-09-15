/* 08_partial_read -- read() can return fewer bytes than you asked for.
 *
 * A short read is NOT an error and does NOT mean end of data. It means
 * "that is what was in the buffer when I looked".
 *
 * The child dribbles a 26-byte message out in small pieces with pauses.
 * The parent asks for all 26 at once, twice: naively, then with read_fully().
 */
#include "common.h"
#include <sys/wait.h>

#define MSG "abcdefghijklmnopqrstuvwxyz"
#define MSGLEN 26

static void dribble(int wfd) {
    const char *p = MSG;
    int chunks[] = {4, 7, 3, 12};
    for (unsigned i = 0; i < sizeof chunks / sizeof chunks[0]; i++) {
        if (write(wfd, p, (size_t)chunks[i]) < 0) die("write");
        say("CHILD", "sent %d bytes", chunks[i]);
        p += chunks[i];
        usleep(300000);                     /* 0.3s -- simulate a slow sender */
    }
    close(wfd);
}

int main(void) {
    banner("08 -- short reads");

    for (int pass = 0; pass < 2; pass++) {
        printf("\n--- pass %d: %s ---\n", pass + 1,
               pass == 0 ? "naive single read()" : "read_fully() loop");
        fflush(stdout);

        int fd[2];
        if (pipe(fd) == -1) die("pipe");

        pid_t pid = fork();
        if (pid < 0) die("fork");

        if (pid == 0) { close(fd[0]); dribble(fd[1]); _exit(0); }

        close(fd[1]);
        char buf[MSGLEN + 1];
        memset(buf, 0, sizeof buf);

        if (pass == 0) {
            ssize_t n = read(fd[0], buf, MSGLEN);
            say("PARENT", "asked for %d, read() returned %zd -> \"%s\"", MSGLEN, n, buf);
            say("PARENT", "incomplete! a naive caller would now process a truncated message");
        } else {
            ssize_t n = read_fully(fd[0], buf, MSGLEN);
            say("PARENT", "asked for %d, read_fully() returned %zd -> \"%s\"", MSGLEN, n, buf);
            say("PARENT", "complete. the loop kept calling read() until it had all 26 bytes");
        }

        close(fd[0]);
        wait(NULL);
    }

    printf("\nRule: always use read()'s return value. Three cases, three responses:\n"
           "   n > 0 : you got n bytes, maybe fewer than requested -- keep going\n"
           "   n = 0 : EOF, every write end is closed -- stop\n"
           "   n < 0 : EINTR means retry; anything else is a real error\n");
    return 0;
}
