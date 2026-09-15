# CSCE 313 -- IPC demos
#
#   make            build everything into bin/
#   make run        run every non-interactive demo in order
#   make clean      remove bin/ and any leftover FIFOs
#
# Works with gcc or clang. Override the compiler if you need to:
#   make CC=clang-20

CC      ?= cc
CFLAGS  ?= -std=gnu11 -Wall -Wextra -Wpedantic -g -O0
SRCDIR   = src
BINDIR   = bin

SRCS := $(wildcard $(SRCDIR)/[0-9]*.c)
BINS := $(patsubst $(SRCDIR)/%.c,$(BINDIR)/%,$(SRCS))

.PHONY: all run clean help
all: $(BINS)

$(BINDIR):
	mkdir -p $(BINDIR)

$(BINDIR)/%: $(SRCDIR)/%.c $(SRCDIR)/common.h | $(BINDIR)
	$(CC) $(CFLAGS) -o $@ $<

run: all
	@./run_all.sh

clean:
	rm -rf $(BINDIR)
	rm -f /tmp/CSCE313_FIFO /tmp/CSCE313_RENDEZVOUS /tmp/csce313_demo

help:
	@echo "make        - build all demos into bin/"
	@echo "make run    - build, then run every non-interactive demo"
	@echo "make clean  - remove binaries and stale FIFOs"
