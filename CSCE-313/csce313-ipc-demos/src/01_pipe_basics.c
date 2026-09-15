/* 01_pipe_basics -- Slide 5, with the error checks spelled out.
 *
 * One process, one pipe. Useless in practice, but it proves the mechanism:
 * bytes written to fd[1] become readable from fd[0].
 */
#include "common.h"

int main(void) {
    banner("01 -- write to fd[1], read from fd[0]");

    int fd[2];
    char buf[30];

    if (pipe(fd) == -1) die("pipe");

    printf("writing to file descriptor #%d\n", fd[1]);

    /* 9, not 8: "CSCE 313" is 8 characters plus the '\0' the compiler appends.
     * The NUL has to travel through the pipe too, or the reader has no string. */
    ssize_t w = write(fd[1], "CSCE 313", 9);
    printf("  write() returned %zd\n", w);

    printf("reading from file descriptor #%d\n", fd[0]);
    ssize_t n = read(fd[0], buf, sizeof buf - 1);
    printf("  read() returned %zd\n", n);

    /* The habit: terminate the string YOURSELF using read()'s return value.
     * Do not rely on a NUL having been sent. */
    if (n >= 0) buf[n] = '\0';
    printf("read \"%s\"\n", buf);

    close(fd[0]);
    close(fd[1]);
    return 0;
}
