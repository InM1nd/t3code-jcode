# Local development domains

Local dev servers are easy to lose track of by port number alone. Tandem can give one a memorable
`.localhost` name instead — `shop.localhost` in the packaged macOS desktop app (or
`shop.localhost:7777` in web/CLI/development builds or when port 80 is already taken) — that keeps
working across restarts and needs no administrator permission.

## Publishing a domain

1. Open **Ports** from the sidebar footer (**Dev servers** view) to see every local dev server
   Tandem has detected.
2. Next to a server, type a name (or keep the suggested one) and select **Publish local domain**.
3. Tandem starts a local proxy on `127.0.0.1:7777`. Every `*.localhost` name resolves to your own
   machine without a hosts-file entry or custom DNS; only names published in Dev servers are routed
   to a development server.
4. In the packaged macOS desktop app, Tandem also starts a native loopback forwarder on
   `127.0.0.1:80` (without sudo) that forwards traffic to `:7777`, so published links open cleanly
   as `http://<name>.localhost`. If port 80 is busy or unavailable, Tandem logs a warning and falls
   back to `http://<name>.localhost:7777`.

Select **Open** to launch the domain in your browser or **Copy** to grab the URL. WebSocket
connections (Vite's HMR, for example) work the same way as the plain port URL did.

Selecting **Update local domain** with a different name moves the port's domain to the new name;
selecting **Unpublish** removes it. Domains whose dev server is currently stopped remain visible
under **Published domains** with **Copy URL** and **Unpublish** actions. Routes are restored from
saved local-domain state after a Tandem restart. No system files are changed.

Saved `.tandem` bindings are migrated to the same single-label `.localhost` name when Tandem starts.
Older Tandem versions may have created clearly marked entries in `/etc/hosts` or
`/etc/resolver/tandem`; this version leaves them untouched. Remove only those Tandem-managed
entries after confirming that no other tool still uses them.

## Limitations

- One Tandem environment on a machine can hold the local domain proxy at a time — it listens on
  port 7777 (and port 80 in the packaged macOS desktop app). If another app holds port 7777,
  publishing reports the conflict instead of changing system networking.
- Names are one label under `.localhost` (`shop`, not `shop.staging`).
