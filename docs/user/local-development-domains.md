# Local development domains

Local dev servers are easy to lose track of by port number alone. T3 Code can give one a memorable
`.localhost` name instead — `shop.localhost:7777` rather than `localhost:5173` — that keeps working
across restarts and needs no administrator permission.

## Publishing a domain

1. Open **Ports** from the sidebar footer to see every local dev server T3 Code has detected.
2. Next to a server, type a name (or keep the suggested one) and select **Publish local domain**.
3. T3 Code starts a local proxy on port 7777. Every `*.localhost` name resolves to your own machine
   without a hosts-file entry or custom DNS; only names published in Ports are routed to a development
   server.

The server is now reachable at `http://<name>.localhost:7777`, including from a browser. Select **Open** to
launch it or **Copy** to grab the URL. WebSocket connections (Vite's HMR, for example) work the same
way as the plain port URL did.

Selecting **Publish local domain** again with a different name moves the domain; selecting
**Unpublish** removes it. The routes are restored from the saved local domain state after a T3 restart.
No system files are changed.

Saved `.tandem` bindings are migrated to the same single-label `.localhost` name when T3 Code starts.
Update bookmarks and OAuth callbacks to include `:7777`.
Older T3 Code versions may have created clearly marked entries in `/etc/hosts` or
`/etc/resolver/tandem`; this version leaves them untouched. Remove only those T3 Code-managed
entries after confirming that no other tool still uses them.

## Limitations

- One T3 Code environment on a machine can hold the local domain proxy at a time — it listens on port 7777. If another app has that port, publishing reports the conflict instead of changing system
  networking.
- Names are one label under `.localhost` (`shop`, not `shop.staging`).
