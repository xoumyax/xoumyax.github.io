---
title: "YaraGen++"
slug: yaragen-plus-plus
oneLiner: A design for extending YaraGen models to route requests, use tools, explain rules, verify results and repair failures.
years: "2026"
statusLabel: In progress — design, no results yet
areas: [post-training-eval, agents, security]
links: []
sponsors: []
stop: now
order: 4
featured: false
cover: { glyphs: "{ }++", tone: amber }
---

## Problem

YaraGen models turn a prompt into a rule. An analyst also needs a system that works out what is being asked, gathers evidence, explains how a rule was built, checks whether it is right, and repairs it when it is not. YaraGen++ is the design for that system. Development began in September 2026.

## Approach

The design starts from four YaraGen checkpoints: BART-base 139M, T5Gemma 540M, Llama 3.1 8B and Ministral 3 8B. A typed detection specification (IOC records with provenance, match logic, scope and open assumptions) is the shared intermediate representation. Per-backbone LoRA controller adapters would issue JSON-schema tool calls through an allowlisted dispatcher. The host would run the tools, so the model never invents observations. A standalone router would classify each request as generate, patch, verify or explain.

Verification combines four independent evidence types: AST and compiler checks, specification checks, formal comparison where supported, and held-out execution. Repair is limited to two attempts. The planned optimization path is verified multi-task SFT, then failure mining and filtered SFT, then one DPO or RLVR (GRPO) pilot on a single bounded, verifiable task, compared with filtered SFT at equal inference budget. A stop rule ends the pilot if reward rises without gains on the independent checks.

## Results

No results yet. This page describes the design only.

## Links

No public links yet. See [YaraGen](/projects/yaragen/) for the base models.
