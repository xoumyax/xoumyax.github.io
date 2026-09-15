/* common.h -- tiny helpers shared by every demo.
 *
 * Nothing clever here. The point is that every demo can check errors and
 * timestamp its output without burying the idea it is trying to show.
 */
#ifndef CSCE313_COMMON_H
#define CSCE313_COMMON_H

#ifndef _GNU_SOURCE
#define _GNU_SOURCE   /* for F_GETPIPE_SZ in demo 09 */
#endif

#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

/* die("pipe") -> prints "pipe: Too many open files" and exits. */
static inline void die(const char *what) {
    perror(what);
    exit(EXIT_FAILURE);
}

/* Seconds since the first call, so you can SEE who is blocking and for how long. */
static inline double elapsed(void) {
    static struct timeval t0;
    static int started = 0;
    struct timeval now;
    gettimeofday(&now, NULL);
    if (!started) { t0 = now; started = 1; }
    return (double)(now.tv_sec - t0.tv_sec) + (double)(now.tv_usec - t0.tv_usec) / 1e6;
}

/* say("PARENT", "wrote %d bytes", n)
 *   -> [ 0.003s pid=41207] PARENT   wrote 9 bytes
 *
 * Assembles one buffer and calls write() ONCE, deliberately avoiding printf,
 * so that the demos' own output is never distorted by stdio buffering.
 * (Demo 05 is the exception -- there, the buffering IS the lesson.)
 */
static inline void say(const char *who, const char *fmt, ...) {
    char line[512];
    int n = snprintf(line, sizeof line, "[%6.3fs pid=%5d] %-8s ",
                     elapsed(), (int)getpid(), who);
    va_list ap;
    va_start(ap, fmt);
    n += vsnprintf(line + n, sizeof line - (size_t)n, fmt, ap);
    va_end(ap);
    if (n > (int)sizeof line - 2) n = (int)sizeof line - 2;
    line[n++] = '\n';
    ssize_t ignored = write(STDOUT_FILENO, line, (size_t)n);
    (void)ignored;
}

/* Read exactly n bytes unless EOF or a real error intervenes.
 * The idiom from the notes: three distinct cases, three distinct responses. */
static inline ssize_t read_fully(int fd, void *buf, size_t n) {
    size_t got = 0;
    while (got < n) {
        ssize_t r = read(fd, (char *)buf + got, n - got);
        if (r == 0) break;                    /* EOF: all writers closed */
        if (r < 0) {
            if (errno == EINTR) continue;     /* interrupted by a signal: retry */
            return -1;                        /* a real error */
        }
        got += (size_t)r;
    }
    return (ssize_t)got;
}

static inline void banner(const char *title) {
    printf("\n=== %s ===\n", title);
    fflush(stdout);
}

#endif /* CSCE313_COMMON_H */
