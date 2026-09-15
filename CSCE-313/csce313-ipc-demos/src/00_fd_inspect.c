/* 00_fd_inspect -- What a file descriptor actually is.
 *
 * Shows: 0/1/2 are already open; pipe() takes the lowest free slots;
 *        a pipe has no name on disk; programs can tell if fd 1 is a terminal.
 *
 * Try:  ./bin/00_fd_inspect
 *       ./bin/00_fd_inspect | cat      <-- watch the isatty() answer change
 */
#include "common.h"
#include <fcntl.h>

static void list_open_fds(const char *when) {
    char path[64];
    printf("\n  open descriptors %s:\n", when);
    for (int fd = 0; fd < 10; fd++) {
        if (fcntl(fd, F_GETFD) == -1) continue;        /* not open */
        snprintf(path, sizeof path, "/proc/self/fd/%d", fd);
        char target[256];
        ssize_t n = readlink(path, target, sizeof target - 1);
        if (n < 0) { printf("    fd %d -> (open, target unknown)\n", fd); continue; }
        target[n] = '\0';
        printf("    fd %d -> %s\n", fd, target);
    }
    fflush(stdout);
}

int main(void) {
    banner("00 -- file descriptors before and after pipe()");

    printf("STDIN_FILENO  = %d\n", STDIN_FILENO);
    printf("STDOUT_FILENO = %d\n", STDOUT_FILENO);
    printf("STDERR_FILENO = %d\n", STDERR_FILENO);

    printf("\nisatty(STDOUT_FILENO) = %d  (1 = a terminal, 0 = a pipe or a file)\n",
           isatty(STDOUT_FILENO));
    printf("  ^ this is why 'ls' prints columns on screen but one-per-line into a pipe.\n");

    list_open_fds("BEFORE pipe()");

    int fd[2];
    if (pipe(fd) == -1) die("pipe");

    printf("\npipe() returned 0 and filled the array:\n");
    printf("  fd[0] = %d   <- READ  end  (0 ~ stdin  ~ you read from it)\n", fd[0]);
    printf("  fd[1] = %d   <- WRITE end  (1 ~ stdout ~ you write to it)\n", fd[1]);

    list_open_fds("AFTER pipe()");

    printf("\nNote the 'pipe:[NNNNN]' targets. That number is an inode in an\n"
           "internal filesystem that is never backed by disk. Nothing was created\n"
           "anywhere you can 'ls'.\n");

    /* A pipe is not seekable. */
    errno = 0;
    off_t r = lseek(fd[0], 0, SEEK_SET);
    printf("\nlseek(fd[0], 0, SEEK_SET) = %ld, errno = %d (%s)\n",
           (long)r, errno, strerror(errno));
    printf("  ^ ESPIPE. There is no 'rewind' on a pipe. Bytes read are gone.\n");

    close(fd[0]);
    close(fd[1]);
    return 0;
}
