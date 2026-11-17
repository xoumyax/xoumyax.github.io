---
title: Course Attendance Tracker
slug: attendance-wizard
oneLiner: A self-hosted attendance tracker any instructor can run for their course; students check in by phone with short-lived codes.
years: "2026"
statusLabel: Open source · self-hosted
areas: [systems]
metrics: []
links:
  - { label: GitHub, href: "https://github.com/xoumyax/CourseAttendanceTracker" }
sponsors: []
stop: now
order: 5
featured: false
cover: { glyphs: "[x]", tone: sand }
---

## Problem

Taking attendance by hand in a large class is slow, and a sign-in sheet is easy to fill in for a friend. Course Attendance Tracker lets students check in from their own device with a code that is announced in class and expires within minutes.

## Approach

A FastAPI backend with SQLAlchemy serves a student portal and an admin portal. Everything course-specific lives in one settings file: course name, timezone, class times, code lifetime and grade scale.

- **Instructors** import a roster CSV, hand each student a one-time enrollment code, create sessions and generate check-in codes, all from one command-line tool or the dashboard. An Excel report turns each student's attendance rate into points.
- **Students** register with their enrollment code, then submit the six-digit code for the current session. Check-in is open only during class times, and a second check-in for the same session is refused.

Passwords are hashed with bcrypt, enrollment codes are stored only as hashes, and repeated wrong guesses are slowed down per account and network address.

## Results

It was first built for a course Soumyajyoti taught as a TA, then rewritten as a general-purpose release that anyone can clone and set up for their own class. The release has 102 automated tests that run on every push.

## Links

- [Code on GitHub](https://github.com/xoumyax/CourseAttendanceTracker), with setup steps in the README.
