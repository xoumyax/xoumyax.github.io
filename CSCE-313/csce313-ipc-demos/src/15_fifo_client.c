/* 15_fifo_client -- Slide 34.
 *
 * Note what the client does NOT do: it never calls mkfifo. It opens a name that
 * already exists. The server owns the rendezvous point's lifetime.
 *
 * The sleep(1) is COSMETIC -- purely so the demo is watchable. It is not
 * synchronisation, and sleep() is never synchronisation. Without it all six
 * integers land in the buffer at once and the server prints five hellos
 * instantly, which is equally correct.
 */
#include "common.h"
#include <fcntl.h>

#define FIFO_PATH "/tmp/CSCE313_FIFO"

int main(int argc, char **argv) {
    int pause_between = !(argc > 1 && strcmp(argv[1], "fast") == 0);

    banner("15 -- FIFO client");

    say("CLIENT", "calling open(O_WRONLY) -- blocks until a READER appears");
    int fifo = open(FIFO_PATH, O_WRONLY);
    if (fifo == -1) {
        perror("open " FIFO_PATH);
        fprintf(stderr,
            "\nIf that said 'No such file or directory', the server has not created\n"
            "the FIFO yet. Start ./bin/14_fifo_server first.\n");
        return 1;
    }
    say("CLIENT", "connected after %.3fs", elapsed());

    /* Raw bytes of an int -- NOT the character '5'.
     * `echo 5 > /tmp/CSCE313_FIFO` would send two bytes and the server would
     * misread them. Both ends must agree on the wire format. */
    for (int index = 5; index >= 0; index--) {
        int msg = index;
        if (write(fifo, &msg, sizeof(int)) < 0) die("write");
        say("CLIENT", "sent %d%s", msg, msg == 0 ? "  <- shutdown sentinel" : "");
        if (pause_between) sleep(1);
    }

    close(fifo);
    say("CLIENT", "closed the FIFO and exiting");
    printf("\nAnything written after the 0 would be discarded -- the server has\n"
           "already unlinked the FIFO by then.\n");
    return 0;
}
