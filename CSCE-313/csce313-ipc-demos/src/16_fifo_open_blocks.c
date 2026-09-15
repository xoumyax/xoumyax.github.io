/* 16_fifo_open_blocks -- open() on a FIFO is a RENDEZVOUS.
 *
 * The number-one source of "my server is broken" reports. It is not broken.
 * It is waiting in open(), and the deck never mentions that open() blocks.
 *
 * This demo forks a writer that deliberately arrives 3 seconds late, and
 * timestamps the reader's open() so you can watch it wait.
 *
 * It also shows the asymmetry of O_NONBLOCK:
 *     O_RDONLY | O_NONBLOCK  -> succeeds immediately, no writer needed
 *     O_WRONLY | O_NONBLOCK  -> fails with ENXIO if there is no reader
 */
#include "common.h"
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/wait.h>

#define FIFO_PATH "/tmp/CSCE313_RENDEZVOUS"

int main(void) {
    banner("16 -- open() on a FIFO blocks until the other side arrives");

    unlink(FIFO_PATH);
    if (mkfifo(FIFO_PATH, 0600) == -1) die("mkfifo");

    /* --- part 1: the non-blocking asymmetry, with nobody on the other end --- */
    errno = 0;
    int r = open(FIFO_PATH, O_RDONLY | O_NONBLOCK);
    say("MAIN", "open(O_RDONLY|O_NONBLOCK) with no writer -> fd=%d errno=%d (%s)",
        r, errno, errno ? strerror(errno) : "none");
    if (r >= 0) close(r);

    errno = 0;
    int w = open(FIFO_PATH, O_WRONLY | O_NONBLOCK);
    say("MAIN", "open(O_WRONLY|O_NONBLOCK) with no reader -> fd=%d errno=%d (%s)",
        w, errno, errno ? strerror(errno) : "none");
    say("MAIN", "  ^ ENXIO. Readers may wait alone; writers may not.");
    if (w >= 0) close(w);

    /* --- part 2: the blocking rendezvous --- */
    pid_t pid = fork();
    if (pid < 0) die("fork");

    if (pid == 0) {
        say("WRITER", "sleeping 3s on purpose before I open the FIFO ...");
        sleep(3);
        int fd = open(FIFO_PATH, O_WRONLY);
        say("WRITER", "opened for writing");
        ssize_t ig = write(fd, "hi", 3); (void)ig;
        close(fd);
        _exit(0);
    }

    say("READER", "calling open(O_RDONLY) -- blocking now");
    double t0 = elapsed();
    int fd = open(FIFO_PATH, O_RDONLY);
    if (fd == -1) die("open");
    say("READER", "open() returned after %.2f seconds", elapsed() - t0);

    char buf[16] = {0};
    ssize_t n = read(fd, buf, sizeof buf - 1);
    if (n > 0) say("READER", "received \"%s\"", buf);
    n = read(fd, buf, sizeof buf - 1);
    say("READER", "next read() returned %zd -- writer closed, so EOF", n);

    close(fd);
    wait(NULL);
    unlink(FIFO_PATH);

    printf("\nThat pause was not a bug. Tell students: start the server, see\n"
           "nothing, that is correct -- now start the client.\n");
    return 0;
}
