# Customising Dark Start

Everything a site owner normally changes is in plain JSON files and image folders. You don't need to touch the code.

## `config.json`

```json
{
  "title": "Dark Start",
  "defaultScheme": "https",
  "defaultLayout": "defaults/layout.json",
  "defaultBackground": "base-1",
  "backupReminderDays": 7,
  "backgrounds": [
    { "id": "base-1", "name": "Dusk", "file": "backgrounds/base-1.jpg", "thumb": "backgrounds/thumbs/base-1.jpg" }
  ],
  "searchEngines": [
    { "id": "ddg", "name": "DuckDuckGo", "url": "https://duckduckgo.com/?q=%s" }
  ],
  "defaultEngine": "ddg",
  "library": [
    { "name": "Reference", "description": "General reference sites", "file": "library/reference.json" }
  ]
}
```

| Key | Meaning |
|---|---|
| `title` | Browser tab title. |
| `defaultScheme` | Added when someone types an address without `http://` or `https://`. |
| `defaultLayout` | The layout a first-time visitor gets. |
| `defaultBackground` | The `id` of the background new visitors see. |
| `backupReminderDays` | How long un-backed-up changes can wait before the backup status turns amber and says "Back up now". It gets brighter in stages before then. |
| `backgrounds` | The built-in backgrounds. `thumb` is optional but saves loading full-size images in Settings. |
| `searchEngines` | Built-in search engines. `url` **must** contain `%s` where the search words go, or the engine is ignored. People can add their own in Settings. |
| `defaultEngine` | The engine new Search widgets start with, unless someone picks another default. |
| `library` | Ready-made widgets offered under **Add widget**. |

`config.json` is re-read on every visit, so changes reach everyone on their next page load.

### Finding a search engine's address

Search the site for `test`, copy the results address, and replace `test` with `%s`.

| Engine | `url` |
|---|---|
| DuckDuckGo | `https://duckduckgo.com/?q=%s` |
| Startpage | `https://www.startpage.com/do/search?q=%s` |
| Brave Search | `https://search.brave.com/search?q=%s` |
| Google | `https://www.google.com/search?q=%s` |
| Bing | `https://www.bing.com/search?q=%s` |
| Yandex | `https://yandex.com/search/?text=%s` |
| Baidu | `https://www.baidu.com/s?wd=%s` |

## `defaults/layout.json`: the first-visit layout

New visitors get this layout. **Changing it later doesn't affect anyone who has already visited**, because their own layout is saved in their browser. So get it right before you share the site.

Suggestions for a good default:

- Keep it short: a guide link, a Search widget, an empty Links widget to start in, and a welcome note.
- Mention in the welcome note that everything lives in the browser and that backups matter.
- Put anything optional in the **library** rather than on the default page.

The format is a page list. See [file-formats.md](file-formats.md).

## `library/`: ready-made widgets

Each file is one widget (or several) in the same format as a widget someone exports. List each file in `config.json` → `library`. People add a copy to their own page, which they can then change freely. Updating a library file later doesn't change copies people already have.

## Backgrounds

Put images in `backgrounds/` at about 1920×1080. Add 320×180 thumbnails in `backgrounds/thumbs/` and list them in `config.json`. JPEG at quality 80 to 85 keeps them small.

The three included backgrounds are simple generated gradients, free to use or replace.

## The user guide

`guide.html` is the built-in guide, linked from the default layout. It has placeholder boxes for screenshots. Save images into `guide/` using the names listed in `guide/README.txt` and they replace the boxes automatically, with no HTML editing.

Until the images exist, each placeholder causes a harmless 404 in your server logs.

## Updating the code

After changing anything in `css/` or `js/`, bump the `?v=` numbers in `index.html` (and `guide.html` if it uses that file) so browsers fetch the new version rather than a cached one.
