# Security and privacy reports

Dark Start's whole purpose is to keep people's link lists private, so privacy leaks count as security bugs here.

## Please report

- any way the page sends data (links, notes, searches, page names) to a third party, or to the server;
- any request to a server other than the site's own, triggered by viewing or editing a page (clicking a link or running a search is expected, of course);
- any way an imported file (backup, page, widget, library or bookmarks HTML) can run script, inject markup or add a link with a dangerous scheme;
- weaknesses in the included server configs (`.htaccess`, `web.config`, `deploy/`).

## How to report

Please **don't open a public issue** for these. Use GitHub's private reporting instead: go to the repository's **Security** tab and choose **Report a vulnerability**.

Include what you did, what was sent or what ran, the browser and version, and ideally a minimal file or steps to reproduce.

This is a volunteer project, so there's no bounty and no fixed response time, but reports are taken seriously and credited in the changelog if you'd like.

## Out of scope

- Things the README already lists as outside the threat model: the web host seeing visits, destination sites seeing your connection, browser sync, extensions, and local access to the computer.
- Missing headers on hosts that can't set them, such as GitHub Pages. This is documented in `docs/hosting.md`.
