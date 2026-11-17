---
title: Multiperspective Hawkeye
slug: hawkeye
oneLiner: The Hawkeye cache-replacement policy from ISCA 2016, implemented in the zsim simulator and extended with PC tracking.
years: "2025"
statusLabel: Group project · CSCE 614
areas: [systems]
metrics: []
links: []
sponsors: []
stop: phd
order: 7
featured: false
cover: { glyphs: "L1$", tone: storm }
---

## Problem

When a cache is full, the replacement policy decides which line to evict, and that choice affects how well the memory system performs. This group project for CSCE 614 (Computer Architecture) at Texas A&M reproduces the Hawkeye replacement policy, published at ISCA 2016, and extends it.

## Approach

The policy is implemented in zsim, a simulator for computer architecture research. The implementation is then extended with PC tracking and with benchmarking across multiple replacement policies.

## Results

The extended zsim setup benchmarks several replacement policies side by side. No quantitative results are recorded for this page.

## Links

The code is in a private course repository.
