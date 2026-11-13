# Hosting Dark Start

Dark Start is a folder of static files. Any web server that can serve HTML can host it. The only server-side work is sending a few **security headers**, and ready-made configs are included for the common hosts.

## What to upload

The site itself is:

```
index.html   guide.html   config.json
css/  js/  backgrounds/  defaults/  library/  guide/
```

plus the header file for your host (`.htaccess`, `web.config` or `_headers`).

`docs/`, `deploy/`, `.github/` and the Markdown files are for the repository. You can leave them out. If you upload everything anyway, the included configs hide them.

## One address only

Browsers store each person's setup under the **exact** site address. `https://example.org`, `https://www.example.org` and `http://example.org` are three different stores, so someone who arrives by a different address finds an empty page.

Pick one address, ideally `https://` without `www.`, and redirect everything else to it. The included `.htaccess` and `nginx.conf` do this. On other hosts, set the redirect in the host's dashboard.

## Serve over HTTPS

HTTPS isn't strictly required, but use it:

- browsers give HTTPS sites more dependable storage;
- the `Strict-Transport-Security` header in the configs only works over HTTPS;
- a plain-HTTP start page can be altered in transit by anyone on the network path.

## The headers and why they matter

| Header | Purpose |
|---|---|
| `Content-Security-Policy` | The page can only load files from its own site. Blocks third-party scripts, fonts, images and connections, even if someone adds one by mistake. |
| `Referrer-Policy: no-referrer` | Sites people click through to aren't told where the click came from. |
| `X-DNS-Prefetch-Control: off` | Browsers don't look up every linked domain in advance. |
| `X-Content-Type-Options: nosniff` | Files are only treated as the type the server says they are. |
| `X-Frame-Options: DENY` and `frame-ancestors 'none'` | Other sites can't embed the page. |
| `Cross-Origin-Opener-Policy`, `Permissions-Policy` | General hardening. The page needs no camera, microphone, location and so on. |
| `X-Robots-Tag: noindex, nofollow` | Asks search engines not to list the site. **Remove it if you want people to find yours.** |
| `Strict-Transport-Security` | Browsers stick to HTTPS for a year. Only add it once HTTPS works. |

`index.html` and `guide.html` repeat the most important of these as `<meta>` tags (Content-Security-Policy, referrer and DNS prefetch). Those protections still apply on hosts that can't set headers.

## Apache and LiteSpeed (most shared hosting)

The `.htaccess` at the root of the repo is ready to use. It needs `mod_headers` and `mod_rewrite`, which almost every host has.

**CDNs can strip headers.** Some hosts put a CDN in front of the site that drops custom headers. Hostinger's CDN is one. If the headers are missing after upload, turn the host's CDN off for this site.

## IIS

The `web.config` at the root is ready to use. It also hides the repository files and sets MIME types for `.json` and `.webp`.

If IIS shows a **500.19** error, a setting in `web.config` clashes with the server's configuration. The usual cause is a MIME type that's already defined. The file removes `.json` and `.webp` before adding them, which covers most servers.

Windows Server 2016 (1709) and later can also hide the `Server: Microsoft-IIS` header. See the comment in `web.config`.

## nginx

See [`deploy/nginx.conf`](../deploy/nginx.conf). Replace `example.org` and the certificate paths.

One nginx-specific trap: an `add_header` inside a `location` block **replaces** all the `add_header` lines above it. The config avoids that by choosing Cache-Control values with a `map`, so don't add `add_header` lines inside `location` blocks.

## Netlify and Cloudflare Pages

Copy [`deploy/_headers`](../deploy/_headers) to the root of the published site, next to `index.html`. Set the `www` and HTTPS redirects in the dashboard.

## GitHub Pages

GitHub Pages can't set custom headers, but Dark Start still works well there:

- **What's covered:** the `<meta>` tags apply the Content-Security-Policy, the referrer policy and the DNS-prefetch setting, and GitHub Pages enforces HTTPS itself.
- **What's missing:** protection against other sites embedding the page (`frame-ancestors` doesn't work in a `<meta>` tag) and the other hardening headers.

For a personal start page that trade-off is usually fine.

## Checking it worked

1. Open the site, press **F12**, open the **Network** tab and reload.
2. Click the first request (the page itself) and look at the **response headers**. You should see `content-security-policy`, `referrer-policy: no-referrer` and, on HTTPS, `strict-transport-security`.
3. In the **Console** tab there should be no "Refused to load" messages. If there are, something is trying to load a file from another site.

## Managed computers

On organisation-managed Edge or Chrome where `DefaultCookiesSetting` is 4 ("session only"), all site storage is cleared when the browser closes, including Dark Start's. An administrator can exempt just this site by adding its exact address to `CookiesAllowedForUrls`. Keep the pattern narrow, e.g. `https://start.example.org`, rather than a whole domain.
