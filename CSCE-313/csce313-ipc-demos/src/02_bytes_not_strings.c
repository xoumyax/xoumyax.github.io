/* 02_bytes_not_strings -- A pipe carries bytes. It has never heard of a string.
 *
 * Sends the same 8 characters twice: once WITHOUT the terminator and once WITH.
 * The receiving buffer is deliberately pre-filled with junk so you can see what
 * printf("%s") does when there is no '\0' to stop it.
 */
#include "common.h"

static void show(const char *label, int send_terminator) {
    int fd[2];
    char buf[40];

    if (pipe(fd) == -1) die("pipe");

    /* Pre-fill with junk. In a real program this is whatever happened to be on
     * the stack -- which is why the bug is intermittent and hard to reproduce. */
    memset(buf, 'X', sizeof buf);
    buf[sizeof buf - 1] = '\0';

    size_t nbytes = send_terminator ? 9 : 8;
    if (write(fd[1], "CSCE 313", nbytes) < 0) die("write");

    ssize_t n = read(fd[0], buf, nbytes);

    printf("\n%s\n", label);
    printf("  wrote %zu bytes, read() returned %zd\n", nbytes, n);
    printf("  printf(\"%%s\") gives: \"%s\"\n", buf);
    printf("  the bytes really in the buffer: ");
    for (ssize_t i = 0; i < n; i++) printf("%02x ", (unsigned char)buf[i]);
    printf("\n");

    close(fd[0]);
    close(fd[1]);
}

int main(void) {
    banner("02 -- bytes vs strings");

    show("(a) 8 bytes sent -- NO terminator in the pipe:", 0);
    show("(b) 9 bytes sent -- terminator included:",       1);

    printf("\n(a) kept printing past the data because nothing said 'stop'.\n"
           "The fix is never to depend on a NUL arriving. Use read()'s return\n"
           "value and terminate it yourself:\n"
           "    ssize_t n = read(fd, buf, sizeof buf - 1);\n"
           "    if (n >= 0) buf[n] = '\\0';\n");
    return 0;
}
