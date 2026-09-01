# Local development domains

Local dev servers are easy to lose track of by port number alone. On macOS, T3 Code can give one a
memorable `.tandem` name instead — `shop.tandem` rather than `localhost:5173` — that keeps working
across restarts.

## Publishing a domain

1. Open **Ports** from the sidebar footer to see every local dev server T3 Code has detected.
2. Next to a server, type a name (or keep the suggested one) and select **Publish local domain**.
3. The first publish on a machine asks for administrator permission once, to add the mapping to
   `/etc/hosts`. Approve it to continue.

The server is now reachable at `http://<name>.tandem`, including from a browser. Select **Open** to
launch it or **Copy** to grab the URL. WebSocket connections (Vite's HMR, for example) work the same
way as the plain port URL did.

Selecting **Publish local domain** again with a different name moves the domain; selecting
**Unpublish** removes it and cleans up the `/etc/hosts` entry.

## Limitations

- macOS only, for now.
- Only one T3 Code environment on a machine can hold the local domain proxy at a time — it listens
  on port 80. If another environment (or another app) already has it, publishing fails with a
  message saying so; unpublishing everything in that other environment, or closing it, frees the
  port for the next attempt.
- Names are one label under `.tandem` (`shop`, not `shop.staging`) to keep the `/etc/hosts` block
  T3 Code manages easy to read and safe to regenerate.
