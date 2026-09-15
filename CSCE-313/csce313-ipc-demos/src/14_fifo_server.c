/* 14_fifo_server -- Slides 32-33, with the two bugs fixed.
 *
 * Prints "hello" for every non-zero integer a client sends. Shuts down on 0.
 *
 * Two fixes versus the slide:
 *   (1) mkfifo is NOT inside assert(). A side effect inside an assertion
 *       vanishes under -DNDEBUG. EEXIST is also tolerated, so a second run
 *       after a crash still works.
 *   (2) read() returning 0 means "all writers are gone" and ends the loop.
 *       The slide's `continue` busy-waits at 100% CPU if a client is killed.
 *
 * Run this first. It will appear to hang -- that is open() blocking, and it
 * is correct. Start 15_fifo_client in a second terminal.
 */
#include "common.h"
#include <fcntl.h>
#include <sys/stat.h>

#define FIFO_PATH "/tmp/CSCE313_FIFO"

int main(void) {
    banner("14 -- FIFO server");

    /* (1) create the rendezvous point */
    if (mkfifo(FIFO_PATH, S_IRUSR | S_IWUSR) == -1) {
        if (errno != EEXIST) die("mkfifo");
        say("SERVER", "%s already exists -- reusing it", FIFO_PATH);
    } else {
        say("SERVER", "created FIFO %s", FIFO_PATH);
    }

    say("SERVER", "calling open(O_RDONLY) -- THIS BLOCKS until a writer appears");
    say("SERVER", "  (start the client now; seeing nothing here is correct)");

    int fifo = open(FIFO_PATH, O_RDONLY);
    if (fifo == -1) { perror("open"); unlink(FIFO_PATH); return 1; }

    say("SERVER", "open() returned after %.3fs -- a client connected", elapsed());

    /* (2) the listening loop */
    for (;;) {
        int req = 0;
        ssize_t n = read(fifo, &req, sizeof(int));

        if (n == 0) {                       /* every writer closed */
            say("SERVER", "read() returned 0 -- all clients disconnected");
            break;
        }
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("read");
            break;
        }
        if (n != (ssize_t)sizeof(int)) {    /* a genuine partial read */
            say("SERVER", "partial read of %zd bytes, ignoring", n);
            continue;
        }

        say("SERVER", "request = %d", req);
        if (req == 0) { say("SERVER", "zero received -- shutting down"); break; }
        say("SERVER", "hello");
    }

    close(fifo);
    say("SERVER", "unlinking %s", FIFO_PATH);
    unlink(FIFO_PATH);                      /* removes the NAME, not the data */
    return 0;
}
