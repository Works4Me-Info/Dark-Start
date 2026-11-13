# Contributing to Dark Start

Thanks for helping. Dark Start stays useful by staying small and private, so contributions are judged against a few firm rules first and features second.

## The rules

1. **No external requests.** The page must never load or contact anything outside its own site: no CDNs, web fonts, analytics, favicon services, link previews or "is this link alive" checks. The Content-Security-Policy enforces this. Don't loosen it.
2. **No dependencies and no build step.** Plain HTML, CSS and JavaScript that runs as written. Anyone should be able to read and check the whole thing.
3. **Data stays in the browser.** Nothing a person creates is sent to the server. Features that need server storage are out of scope for this repository.
4. **People's text is never HTML.** Insert user-supplied text with `textContent` (the `h()` helper in `js/app.js` does this for you). Never put it into `innerHTML`.
5. **Imports are untrusted.** Anything read from a file goes through the `norm*` functions, which validate types, lengths, colours and URL schemes.
6. **Keep it simple to host.** If a change needs server configuration, it must work with the provided `.htaccess`, `web.config`, `nginx.conf` and `_headers`. Update all four.

## Before opening a pull request

- Serve the folder locally (`python -m http.server 8080`) and test in at least one Chromium-based browser and Firefox if you can.
- Open the browser's developer tools and check:
  - the **Console** has no errors and no "Refused to load" messages;
  - the **Network** tab shows requests only to the site itself while you use the feature.
- If you changed files in `css/` or `js/`, bump the `?v=` numbers in `index.html` (and `guide.html` if it loads that file).
- If you changed the saved data format, make sure older backups and exports still import, and describe the change in `docs/file-formats.md`.
- Update `guide.html` if people will notice the change, and add a line to `CHANGELOG.md`.

## Ideas that need discussion first

Please open an issue before building anything that:

- adds a new kind of widget;
- changes the saved data format;
- adds a setting to the Settings window. It's getting full, and every setting is something to explain;
- records anything about how people use their links, such as click counts or "last used" dates. That raises a privacy question that needs agreeing first.

## Reporting bugs

Use the issue templates. For anything that leaks data or could run code from an imported file, see [SECURITY.md](SECURITY.md) instead.
