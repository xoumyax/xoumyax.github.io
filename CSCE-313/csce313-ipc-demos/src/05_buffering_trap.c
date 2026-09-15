/* 05_buffering_trap -- why your output appears TWICE when you redirect.
 *
 *   ./bin/05_buffering_trap           -> 3 lines
 *   ./bin/05_buffering_trap | cat     -> 4 lines, and "A" shows up twice
 *
 * stdout is LINE buffered to a terminal but FULLY buffered to a pipe or file.
 * With full buffering, "A" is still sitting in the user-space stdio buffer when
 * fork() copies the entire address space -- buffer included. Both processes then
 * flush their own copy at exit.
 *
 * This is the single most common "my program's output is wrong" bug in CSCE 313.
 */
#include "common.h"

int main(void) {
    /* deliberately NOT using say() here: printf is the subject of the demo */
    printf("A");                 /* no newline, so nothing forces a flush */

    /* Uncomment the next line and the duplicate disappears: */
    /* fflush(stdout); */

    if (fork() < 0) die("fork");

    printf("B (pid %d)\n", (int)getpid());
    return 0;
}
