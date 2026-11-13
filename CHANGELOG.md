# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added
- Join from a phone with a first name, one line on what you want to talk about, and optional LinkedIn, GitHub, site and email.
- Profile reading through Apify, with names removed where found before any text goes to the model.
- Group forming by an open model on Featherless under versioned grouping rules, with up to 20 meeting spots.
- Private ratings per group and "Would you talk to them again?" per person; mutual yes pairs see each other's LinkedIn and email.
- Rules rewriting between rounds, each change with its reason.
- Organiser page: people table, rounds, rules versions, download.
- PostHog events with numbers only.
- LinkedIn search by name, off unless `NAME_SEARCH=on`.
