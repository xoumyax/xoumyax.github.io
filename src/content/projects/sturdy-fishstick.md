---
title: Sturdy Fishstick
slug: sturdy-fishstick
oneLiner: A self-hosted dashboard that scrapes, scores and organizes job and PhD listings with small on-device language models.
years: "2026"
statusLabel: Self-hosted
areas: [systems, agents]
metrics:
  - { value: "~750", label: "listings scored" }
  - { value: "10+", label: "ingestion sources" }
  - { value: "6", label: "ATS APIs ingested" }
  - { value: "1–2B", label: "parameters per local model, run fully on-device" }
links:
  - { label: GitHub, href: "https://github.com/xoumyax/sturdy-fishstick" }
sponsors: []
stop: now
order: 3
featured: false
cover: { glyphs: "><>", tone: sage }
---

## Problem

Job and PhD listings are spread across job boards, company career pages, intern repositories and academic boards. Sturdy Fishstick collects them in one place, in two modes (Careers and PhD), and scores them with small language models that run entirely on the local machine.

## Approach

A FastAPI backend with SQLite (with migrations) and APScheduler sits behind a React, Vite and Tailwind frontend. Ingestion covers Google Jobs through Serper with a hard daily budget cap, LinkedIn through jobspy, GitHub intern repositories, six ATS JSON APIs (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee), a Playwright fallback, and academic boards (EURAXESS, jobs.ac.uk). Local 1–2B models run through Ollama.

The model does not produce a 0–10 score. It answers categorical questions (is this a real job, what level, does the field match, do the skills overlap) that map to a score deterministically. Senior and aggregate listings are filtered out before any model call. Scoring passes are single-flight and time-boxed, and they unload every model when done. A RAG chat grounds its answers in exact database counts through SQLite FTS5 retrieval.

## Results

The platform has scored about 750 listings from 10+ sources, against a whitelist of 130+ organizations. Small local models score more reliably when they answer categorical questions than when they give a number directly. Counts in the chat come from the database, not from the model. A Kanban tracker, LAN and ngrok remote access, and optional email and calendar alerts round out the tool.

## Links

- [Code on GitHub](https://github.com/xoumyax/sturdy-fishstick). The dashboard itself is personal and not hosted publicly.
