# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub's private vulnerability reporting](https://github.com/lightmorphic/fossstudio/security/advisories/new)
on this repository. You'll get a response as soon as possible, normally
within a few days. Please don't open public issues for security problems
before they're fixed.

## Supported versions

Only the latest release (what `main` deploys) is supported. FOSSStudio
is self-hosted: run the newest version.

## Security design notes

For self-hosters assessing the project:

- **Authentication**: scrypt password hashing, HMAC-signed HttpOnly
  cookies (`Secure`, `SameSite=Lax`), per-IP login rate limiting with
  lockout, optional TOTP two-factor.
- **One account**: an install has one login and no way to make a
  second - no account creation, no invitations, nothing to escalate to.
  Host powers in a session are granted from the server-side session
  check, never from client claims; guests join by link with no account
  at all, and a link is never treated as one.
- **Session links** must exist in the session registry - arbitrary room
  IDs are rejected. The view-only output (`?output=1`) carries the same
  trust as the link itself: anyone holding the link could join and
  listen as a guest anyway, so it grants nothing extra. Those
  connections are receive-only at the server (they cannot publish
  media), are capped separately from guests, and never enter
  recordings.
- **Uploads**: recording chunks are gated by per-peer HMAC tokens;
  logo, wallpaper and ad-banner uploads are login-gated, content-type
  and size limited, and written under server-controlled names (never a
  client-supplied path). Banner snapshots (the lower-third images baked
  into recordings) are host-only, PNG-only, size-capped, and written
  under server-controlled names for peers that actually exist in the
  room.
- **Transport**: HTTPS everywhere (via the bundled Caddy with TLS
  1.2/1.3 and HSTS, or your own TLS-terminating proxy); WebRTC media is
  DTLS-SRTP encrypted end-to-server; the app binds to loopback behind
  the proxy by default (`BIND_HOST` can widen this for private-network
  setups such as Tailscale, and must never expose the app port to the
  open internet). A strict Content-Security-Policy, X-Frame-Options,
  nosniff and Referrer-Policy are set by the app on every response, so
  they hold regardless of which proxy sits in front; HSTS is the one
  header your own proxy must add itself.
- **Least privilege**: the application container runs as a non-root
  user; data files holding credentials are stored owner-only (0600).
  Deployment is a dedicated SSH key, used nowhere else, that is itself
  forced-command restricted server-side to a fixed set of deploy
  actions (upload a release, switch to it, start it, health-check,
  prune old releases, roll back) - the key cannot open a shell or run
  any other command, even though the account it logs into is root.
  File uploads through it (the release itself) are confined to the
  releases directory by `rrsync`; the key also has no PTY, agent
  forwarding, or port forwarding.
- **No third parties**: no CDNs, trackers, or external calls from any
  page; fonts and libraries are self-hosted. One thing does leave the
  server, and only because you asked for it: if notifications are
  turned on, the nudge goes through that browser's own push service.
- **Data deletion**: deleting a recording, wallpaper, logo or ad-banner
  removes the stored file from disk, not just the database
  record. (Rotating local backups may retain snapshots until they age
  out of the retention window - 5 backups by default, set between 1 and
  100 in the dashboard.)
- **Secrets** live in the server's `.env` and the data directory -
  never in the repository.
- **Unauthenticated endpoints** are deliberately few: `/healthz` (up
  or not), `/tls-allowed` (a yes/no answer Caddy consults before
  fetching a certificate on demand; it approves only the dashboard
  domain derived from `DOMAIN`, so a stranger pointing their name at
  the server can never mint a certificate), the session page at
  `/s/<session>` (session ids are unguessable, and the page still has
  to join through the signaling socket), and the studio's advertising
  banner, which is drawn into every guest's screen anyway.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, and a restrictive `Permissions-Policy`.
