---
title: Depixelation Recoverability Frontier
slug: depixelation
oneLiner: A benchmark that maps when pixelated text can be recovered, treating recovery as search with an exact render-and-verify check.
years: "2026"
statusLabel: In progress
areas: [security]
metrics:
  - { value: "360", label: "cells in the difficulty grid" }
  - { value: "10", label: "seeds in the statistical protocol" }
links: []
sponsors: []
stop: now
order: 2
featured: false
cover: { glyphs: "#:.", tone: sand }
---

## Problem

Pixelation is a common way to hide text in images. Some pixelated text can be recovered, and some cannot. This project measures where that boundary lies.

## Approach

The benchmark is a 360-cell difficulty grid over four factors: block size, font-blindness, corruption and character-set entropy. Results use a 10-seed statistical protocol. Depixelation is treated as constrained search, not image restoration, with an exact render-and-verify check on each candidate. The scope includes retrieval-augmented recognition with calibrated abstention and a comparison of curriculum-training approaches on 4×H100 GPUs. It is framed defense-first, with responsible-use limits.

## Results

In progress. No results are published yet.

## Links

An open-source benchmark; there is no public link yet.
