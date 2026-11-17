---
title: YARA SentencePiece Tokenizer
slug: yara-sentencepiece
oneLiner: SentencePiece tokenizers trained on a synthetic corpus of 250K English descriptions paired with YARA rules.
years: "2025"
statusLabel: Experiment
areas: [post-training-eval, security]
metrics:
  - { value: "52K", label: "vocabulary size" }
  - { value: "250K", label: "description–rule pairs in the training corpus" }
links:
  - { label: GitHub, href: "https://github.com/xoumyax/yarasentencepiece" }
sponsors: []
stop: phd
order: 9
featured: false
cover: { glyphs: "▁ru le", tone: amber }
---

## Problem

A model that turns English descriptions into YARA rules reads and writes both kinds of text. This experiment trains a tokenizer on that paired text directly.

## Approach

A data-preparation script reads a synthetic corpus of 250K pairs, each an English description and its YARA rule, and writes both sides as training text. SentencePiece then trains a unigram model with a 52K vocabulary and full character coverage. The repository also holds a BPE model trained on the same text. Training ran as a SLURM job on a large-memory CPU node.

## Results

The trained tokenizer models and their vocabularies are in the repository. No evaluation is recorded for this page.

## Links

- [Code and models on GitHub](https://github.com/xoumyax/yarasentencepiece).
