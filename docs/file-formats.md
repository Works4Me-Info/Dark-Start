# File formats

All Dark Start files are plain JSON. Unknown fields are ignored. Anything invalid is dropped with no error, including links with unsupported schemes and search engines without `%s`.

## Widget

```json
{
  "type": "startpage-widget",
  "version": 1,
  "widget": {
    "type": "links",
    "title": "Reference",
    "color": "#3fb68b",
    "view": "grid",
    "links": [
      { "kind": "section", "title": "Encyclopedias" },
      { "title": "Wikipedia", "url": "https://www.wikipedia.org/" },
      { "kind": "section", "title": "" },
      { "title": "Internet Archive", "url": "https://archive.org/" }
    ]
  }
}
```

| Field | Values |
|---|---|
| `type` | `"links"` (default), `"search"` or `"notes"` |
| `title` | Up to 100 characters |
| `color` | A hex colour such as `"#5b8def"` |
| `collapsed` | `true` to start collapsed |
| `view` | Links only: `"list"` (default) or `"grid"` (icons) |
| `links` | Links only: links and sections, in order |
| `text` | Notes only: the note text |
| `engine` | Search only: the `id` of an engine from `config.json` |

A **link** is `{ "title": "...", "url": "..." }`. Only `http`, `https`, `mailto` and `ftp` addresses are kept. Paths on the same site, such as `guide.html` or `/page`, are allowed too.

A **section** is `{ "kind": "section", "title": "..." }`. An empty title gives a plain line.

A file can hold several widgets instead of one: `{ "widgets": [ {...}, {...} ] }`. Library files and imports accept both.

## Page

```json
{
  "type": "startpage-page",
  "version": 1,
  "page": {
    "name": "Research",
    "ncols": 3,
    "cols": [
      [ { "title": "Column one, first widget", "links": [] } ],
      [ ],
      [ { "type": "notes", "title": "Notes", "text": "..." } ]
    ]
  }
}
```

`cols` is a list of columns, and each column is a list of widgets from top to bottom. `ncols` is 1 to 6.

`defaults/layout.json` uses the same idea for several pages: `{ "tabs": [ page, page, ... ] }`, where each page is `{ "name", "ncols", "cols" }`.

## Full backup

Made by **Download backup**. It has `"type": "startpage-backup"` and holds the person's whole layout and settings, plus any uploaded backgrounds as data URLs. Restoring one **replaces** everything in that browser.

Backups contain people's links and notes in readable text. Treat them as private files.

## Bookmarks import

Importing accepts the standard bookmarks HTML file every browser can export (the "Netscape bookmark" format). Each folder becomes a widget, nested folders get names like `Parent / Child`, and the widgets go on a new page called "Imported".
