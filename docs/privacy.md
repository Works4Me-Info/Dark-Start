# Privacy and threat model

Dark Start aims to give **no third party a list of the sites you use**. This page sets out what it protects, how, and where its protection ends.

## Where data lives

| Data | Stored in | Sent anywhere? |
|---|---|---|
| Pages, widgets, links, notes, settings | The browser's IndexedDB, under the site's address | No |
| Uploaded backgrounds | IndexedDB, re-encoded without metadata | No |
| Backup status dates | IndexedDB | No |
| Backups and exports | Files the person downloads | Only where the person puts them |

The server only ever **sends** files: the page, `config.json`, library files and images. Nothing the person creates is ever uploaded.

## What the page does to avoid leaks

- **It loads nothing from other servers.** A strict Content-Security-Policy (`default-src 'none'`, with only `'self'` allowed for scripts, styles, images and connections) is sent as a header and repeated in a `<meta>` tag. Third-party resources are blocked by the browser, not just left out.
- **No favicons.** Icon services (Google's `s2/favicons`, DuckDuckGo's `ip3`) receive every domain you ask about. Links use a coloured letter worked out from the address instead.
- **No referrer.** `Referrer-Policy: no-referrer` is set as a header and as a meta tag, and every link has `rel="noreferrer noopener"`. Searches open with `noopener,noreferrer`.
- **No DNS prefetching.** `X-DNS-Prefetch-Control: off`, so linked domains aren't resolved before you click.
- **No link fetching.** Titles default to the hostname. The page never requests a linked page for its title, a preview or to check whether it still works. A link checker would contact every site in someone's lists, one after another, from one address, which is exactly the fingerprint this project avoids.
- **Quiet search.** There are no suggestion requests while typing, and the query is sent only on Enter or click. Search boxes have autofill off, so queries aren't kept in form history.
- **Notes have spellcheck off.** Chrome's "enhanced spell check" and Edge's Microsoft Editor send typed text to Google and Microsoft.
- **Clean images.** Uploaded backgrounds are redrawn on a canvas and saved as new JPEGs, which removes EXIF and GPS data.
- **Safe link schemes.** Only `http`, `https`, `mailto` and `ftp` are kept, including in imported files and library files.
- **Inert imports.** Bookmark HTML is parsed with `DOMParser`, which runs no scripts and loads no images. Any text people supply is inserted with `textContent`, never `innerHTML`.

## What it does not protect against

- **The web host.** Whoever hosts the site sees the IP address and browser details of people who load the page, as with any website. It doesn't see what they store.
- **Destination sites.** The sites you click through to see your IP address and browser like any visit. Dark Start hides where the click came from, not who is clicking. Use a VPN or other network measures if that matters to you.
- **Search engines.** The engine you pick receives your query.
- **The browser itself.** Browser sync can upload history, including visits to the start page and the sites opened from it. Safe-browsing features such as Microsoft SmartScreen and Google Safe Browsing check URLs as you visit them. Extensions can read the page.
- **Anyone with access to the computer.** Data in IndexedDB isn't encrypted. Anyone who can use the browser profile can open the page and see the setup.
- **Backup and export files.** They're readable JSON. Store them accordingly.

## Reporting a problem

If you find any way the page sends data to a third party, or a way imported content could run code, please report it as described in [SECURITY.md](../SECURITY.md).
