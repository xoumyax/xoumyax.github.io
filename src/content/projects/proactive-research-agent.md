---
title: Proactive Deep Research Agent
slug: proactive-research-agent
oneLiner: Trains a deep-research agent to notice an underspecified query and ask one clarifying question before it searches.
years: "2026"
statusLabel: Manuscript in preparation · ongoing
areas: [agents, post-training-eval]
metrics:
  - { value: "0.168 → 0.573", label: "underspecification-detection F1, Stage 1 to Stage 3" }
  - { value: "0.095 → 0.607", label: "detection recall, Stage 1 to Stage 3" }
links:
  - { label: "Code (V1)", href: "https://github.com/xoumyax/ProPauseLM-Playground/tree/modified-prompt" }
sponsors: []
stop: now
order: 1
featured: true
cover: { glyphs: "?>", tone: amber }
---

## Problem

A deep-research agent answers every query, even when the user has left out a detail that changes the answer. This project adds an explicit "ask" action to the agent, so it can pause on an underspecified query and ask one minimal clarifying question before it retrieves and answers. The manuscript is co-authored by a four-person team; Soumyajyoti led all model development and training.

## Approach

The agent is Gemma-4-E4B, trained with a staged SFT curriculum: a deep-research baseline with no pausing, then reflex pausing, then reasoned pausing, then mechanism-augmented pausing. It runs on a single GPU under vLLM with multi-turn KV reuse, in the Dr. Tulu framework, with web and Semantic Scholar search served through an MCP server. A structured tag protocol (think, ambiguity, ask, tool call, answer, cite) makes each decision checkable. The benchmark uses real user queries, both clear and vague, across three domains.

The current work centres on an entropy-based ambiguity metric, which tells the agent when a clarifying question is worth asking.

## Results

From Stage 1 to Stage 3, underspecification-detection F1 rises from 0.168 to 0.573, and recall from 0.095 to 0.607. The entropy-based metric improves the final answers; those figures stay unpublished while the project is ongoing.

## Links

- [V1 code on GitHub](https://github.com/xoumyax/ProPauseLM-Playground/tree/modified-prompt) (the `modified-prompt` branch). The V2 code is private for now.
- No public paper yet.
