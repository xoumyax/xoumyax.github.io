/* 09_pipe_capacity -- a pipe buffer is finite, and you can measure it.
 *
 * Fills a pipe one byte at a time with O_NONBLOCK set, so instead of hanging
 * forever the write fails with EAGAIN and we can report the exact capacity.
 *
 * Remove the fcntl() line and this program becomes demo 06's cousin: it hangs
 * at exactly the byte count printed below, because nobody is reading.
 */
#include "common.h"
#include <fcntl.h>
#include <limits.h>

int main(void) {
    banner("09 -- how big is a pipe?");

    int fd[2];
    if (pipe(fd) == -1) die("pipe");

    int flags = fcntl(fd[1], F_GETFL);
    if (flags == -1) die("fcntl F_GETFL");
    if (fcntl(fd[1], F_SETFL, flags | O_NONBLOCK) == -1) die("fcntl F_SETFL");

    char c = 'x';
    long n = 0;
    while (write(fd[1], &c, 1) == 1) n++;

    printf("write() stopped after %ld bytes (errno = %d, %s)\n",
           n, errno, strerror(errno));
    printf("  -> the pipe capacity on this machine is %ld bytes (%.0f KiB)\n",
           n, n / 1024.0);

#ifdef F_GETPIPE_SZ
    int sz = fcntl(fd[1], F_GETPIPE_SZ);
    if (sz > 0) printf("  -> fcntl(F_GETPIPE_SZ) agrees: %d\n", sz);
#endif

    printf("\nPIPE_BUF = %d bytes.\n", (int)PIPE_BUF);
    printf("  Capacity and PIPE_BUF are different things:\n"
           "    capacity  = how much unread data fits before write() blocks\n"
           "    PIPE_BUF  = the largest write() guaranteed NOT to interleave\n"
           "                with another writer's data\n");

    close(fd[0]);
    close(fd[1]);
    return 0;
}
