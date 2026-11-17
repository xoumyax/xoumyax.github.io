---
title: YaraGen
slug: yaragen
oneLiner: A 139M-parameter model that writes YARA detection rules from analyst descriptions and matches a fully fine-tuned 8B model.
years: "2024–26"
statusLabel: Submission in preparation
areas: [post-training-eval, security]
metrics:
  - { value: "91.8%", label: "\"semantic correctness\" of the 139M model on 22,655 held-out pairs" }
  - { value: "57×", label: "smaller: the 139M generator vs. the fully fine-tuned 8B" }
  - { value: "17–20×", label: "generation throughput of the 139M generator vs. the 8B" }
  - { value: "~10 pp", label: "lead of the 139M pipeline over few-shot GPT-5.4" }
links: []
sponsors: ["LPS (UMD)", "Booz Allen Hamilton"]
stop: phd
order: 2
featured: true
cover: { glyphs: "{ }", tone: amber }
---

## Problem

Security analysts write YARA rules by hand to describe and detect malware families. Language models can draft a rule from a text description, but they fail in two ways. They mix up the indicators of compromise (IOCs) in the prompt, such as hashes, domains and file names. They also miss the structure of the YARA grammar. Frontier models produce rules that parse (97–99.8% parse rates), but their errors are semantic: few-shot GPT-5.4 reaches 84.0% and zero-shot Sonnet 5 75.0% "semantic correctness" on structured generation. YaraGen asks whether a small model, trained for this one task, can do better and still be cheap enough to deploy locally.

## Approach

Two components address the two failure modes. The Scooper, a 55M-parameter BiLSTM tagger, masks IOCs behind placeholders before generation; it tags IOCs at 99.4% precision and 99.6% recall over 25K prompts. The YaraAST hybrid tokenizer gives each structural construct of the YARA grammar its own atomic token and keeps subword tokens for IOC content.

Training is a staged curriculum: a structure-first foundation pass, a specialization pass with replay to limit forgetting, then passes on human-style prompts with consistency regularization (supervised cross-entropy plus a symmetric-KL term). The data comes from three corpora: 305,697 rules crawled from 59 repositories, 15M synthetic rules from 459 template families, and 15M grammar-fuzzed rules.

Evaluation uses YaraDiff, a Z3 SMT comparison of rule semantics, inside a composite training-time score. The study covers 150+ post-training runs on models from 135M to 8B parameters.

## Results

A 139M-parameter BART model reaches 91.8% "semantic correctness" on the full 22,655-pair held-out set (93.7% in-window). This matches a fully fine-tuned 8B model at 93.8%. The 139M generator is 57× smaller than that 8B model; the core pipeline, generator plus Scooper, is about 41× smaller. It delivers 17–20× the generation throughput.

The best fine-tuned models beat both frontier baselines, and the 139M pipeline leads few-shot GPT-5.4 by about 10 pp. YaraAST adds 4 pp accuracy at 139M (1.5 pp at 1B) and cuts per-rule context 11%. Against AST-T5-style structure-aware pretraining on BART, the YaraGen strategy is ~30 pp ahead on average across generation and patching; combining the two adds ~2 pp.

In downstream detection on EMBER clusters, rules generated from textual PE features reach 96±4% true positives at 0.8% false positives, against AutoYara's 93±6% at 0.5%. This is a trade-off: a higher TP rate at a higher FP rate.

## Links

No public paper or code yet. The framework runs behind [YARAikiba](/projects/yaraikiba/), the hosted analyst agent.
