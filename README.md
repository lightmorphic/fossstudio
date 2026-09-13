> ## Public beta. Not ready to be relied on.
>
> **This is a public beta. It is not ready to be relied on. Data loss
> and breaking changes are possible. Please do not put a real show on
> it yet.**
>
> We want people to install it, break it and tell us what happened.
> That is what a beta is for. What we are not ready for is being the
> only thing standing between you and a recording you cannot make
> again. Record a test show first, and keep a second recording running
> for anything that matters.
>
> Releases are marked as pre-release on GitHub. The current version is
> `0.1.0`.

# FOSSStudio

Self-hosted video podcast studio. Guests join by link with no account;
the host runs the session from a panel on the same page and gets the
recording afterwards.

## Free, and staying free

FOSSStudio is free software under the AGPL, and it always will be. Put
the compose file on a machine you control and it is yours: no account,
no key, no tier, no per-guest charge, no watermark, nothing phoning
home. Everything in this repository is everything there is.

A studio needs a server with open UDP ports and enough bandwidth for
everyone's video, which is more to think about than most web apps. If
you would rather not, the people who write FOSSStudio also host it:
**[Castmorphic](https://castmorphic.com)** runs this same software for
you, with more built on top of it, and paying for that is what funds
the work here. It is an alternative to self-hosting, not a better
version of it. You will not find an advert for it inside the software,
and you never will.

## What it does

<!-- Every claim below is something the current code does. If you find
     one that isn't, that is a bug report we want. -->

- **Guest flow:** open link, then a preview screen - camera, microphone
  and speaker pick, a test sound, a microphone meter, **camera zoom**
  (the real lens where the camera supports it, a digital crop
  everywhere else), a mirror toggle, a name, noise suppression on by
  default - then join, arriving muted so there are no accidental hot
  mics. The room holds ten people, plus up to four view-only
  connections. Choices are remembered for next time.
- **Roles:** admins create **hosts** and look after the system; each
  host owns their sessions, recordings and branding. Creating a host
  gives you an invite link to send them; they open it and choose their
  own password. The admin panel (`/admin/`) and host dashboards
  (`/host/`) are separate sessions, so both can be open in one browser
  at once - and each can have its own domain: point admin.<your-domain>
  and host.<your-domain> at the server and they work, certificate
  included. Either panel can be locked with a second factor.
- **In-session host controls:** spotlight or grid, per-guest volume,
  per-session automatic level balancing, mute one or mute everyone,
  lower a raised hand, start and stop recording, and two overlays -
  a subscribe reminder and your own advertising banner - that everyone
  sees and the recording keeps.
- **Recording:** each person is recorded in their own browser, on their
  own track, and uploaded as it is made. Nothing here converts anything,
  so what you download is the file that browser wrote: uncompressed
  audio where the browser can record it (a Chromium-based browser such as Chrome, Brave or Edge can), Opus where it
  cannot. Print worth reading before a long show: uncompressed
  comes to about 1.4 GB per person per hour, and a camera track is
  whatever the browser's own encoder makes of the picture.
- **One video of the whole thing:** while a take is running, the host's
  browser also draws the show as everyone sees it onto a 1280x720
  canvas, mixes every voice into one track and encodes it. That arrives
  as a single finished file, so the server has nothing to do when a
  show ends however long it was. It carries
  everyone's tile, their lower-third name banners, the podcast logo and
  episode title block (the host drags it anywhere, resizes it, and
  right-clicks it for the rest: logo left of the title, right, above or
  below, the block's background colour, or drop either for a session),
  the spotlight when the host has spotlit someone, and any overlay
  triggered, at the moment it was triggered.
- **Downloads:** everything is in the dashboard when you stop - per
  file, or as a zip of everyone's audio or of the lot. Tile sizes,
  spacing and corners come from one set of frame-relative fractions the
  page and the mixer share, so the video is the picture people were on -
  the exception is a phone, which deliberately uses a two-column layout
  so faces stay big enough to see.
- **View-only output:** every session has a view-only link
  (`?output=1`) with no join screen and no controls. It works as a
  browser source in [OBS](https://obsproject.com) or anything like it,
  which is how a host who wants to broadcast the show does it, and it
  is just as useful for putting the session on a second screen. It is
  invisible to
  everyone in the session and can never appear in the recording. Copy
  it from the session row in the dashboard.
- **Session blocking:** for when a session link has been shared openly
  and someone joins to abuse it. Every guest's row in the in-session
  host panel has a block button - one click arms it (it turns red and
  asks), a second removes them and bars them from every session on
  the server, matched by IP address and a persistent marker their
  browser presents, so a changed address alone does not walk them back
  in. The dashboard's "Blocked from sessions" list undoes any block
  in one click, every block and unblock is logged server-side, and
  the stored address never reaches any browser. An honest limit: a
  determined person with a fresh network and a cleared browser can get
  past an address block. This stops the casual repeat offender.
- **Publish to FOSSCast:** one click on a finished recording sends the
  video to your own [FOSSCast](https://github.com/lightmorphic/fosscast)
  instance as a draft episode, for you to review there before it goes
  public. The publisher token stays on the server and never reaches a
  browser. FOSSCast is a separate self-hosted app that publishes a
  podcast; neither needs the other to run.
- **Backdrops, switched mid-show:** the host panel's Backdrop control
  holds it all - pick a colour (palette or hex) and wear it solid, or
  as any of six logo layouts generated on the spot from your logo in
  that colour (a 3D scatter, a dense mosaic, aligned rows, brick
  offset, a tilted diagonal grid, or a single corner watermark) - or
  switch to the uploaded wallpaper. A new look for a new segment, on
  every screen at once; sessions open on the colour you used last.
- **One look per show:** the theme (wallpaper, background colour, logo,
  episode title) is pinned the moment the first person joins and holds
  until the session empties, so everyone and the recording see the same
  thing even if settings change or the session is renamed mid-show. The
  host's backdrop switch is the one deliberate exception, and it
  switches between copies pinned at that same moment; a recording keeps
  the backdrop it started with.
- **Noise suppression:** RNNoise in the guest's browser (WASM worklet).
- **Notifications, if you want them:** the dashboard can ask your
  browser for permission to nudge you when a guest joins or a recording
  is ready. Off unless you turn it on, and it goes through your own
  browser's push service, which is outside this software.
- **Backups:** settings and session history are backed up daily, kept
  to a number you choose, restorable from the dashboard; everything in
  the data folder can be downloaded as one archive. Recordings are not
  in the backup - download those from the Recordings screen.

## What it does not do

FOSSStudio records a show. It does not publish one, and it does not
broadcast one.

- **No broadcasting.** The studio does not push the show anywhere.
  Every session has a view-only output link that works as a browser
  source in [OBS](https://obsproject.com) or anything like it, so a
  host who wants to broadcast does it from software built for that job
  and sends the show wherever it can reach.
- **No podcast hosting.** No RSS feed, no episode website, no download
  statistics, no directory submission. That is
  [FOSSCast](https://github.com/lightmorphic/fosscast), a separate app.
  One click sends a finished recording from here to there; neither
  needs the other to run.
- **No editing, and no processing of any kind.** Nothing on the server
  opens a recording, converts it, mixes it or re-encodes it - there is
  no media tool installed and no long-running child process anywhere in
  the product. You get the tracks as they were recorded; trimming,
  cutting and mixing happen in whatever editor you already use.
- **No transcription and no captions.**
- **No audience accounts, memberships or payments.**
- **No telephone dial-in and no SIP.** Guests join in a browser.
- **No screen sharing.** FOSSStudio records people talking to each
  other.
- **No cloud anything.** There is no service behind this: no relay we
  run, no account with us, no limit we could lift. If your server
  cannot do it, it does not happen.

## Reporting a problem

- **Something broken, something confusing, something missing:** open an
  issue on GitHub. During the beta this is the most useful thing you
  can do. Tell us what you did, what you expected and what happened.
  If it is a media problem (people join but see a black screen), run
  the setup check described below and paste what it says.
- **A security problem:** please report it privately first.
  [SECURITY.md](SECURITY.md) says how.
- **Code:** we are not merging pull requests during the beta.
  [CONTRIBUTING.md](CONTRIBUTING.md) explains why in full, and says what
  changes after the beta.

## Licence

Free software under the [GNU AGPL v3](LICENSE).

[NOTICE.md](NOTICE.md) records who wrote what. FOSSStudio is
Lightmorphic's own work throughout; the third-party material is
mediasoup-client (ISC), RNNoise via `@jitsi/rnnoise-wasm` (Apache-2.0
over BSD-3-Clause) and the Manrope typeface (SIL OFL 1.1). Four runtime
npm dependencies, listed there with their licences.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Stack

Node.js + [mediasoup](https://mediasoup.org) SFU, Caddy (HTTPS and
certificates - commented out in the compose file, so bringing your own
reverse proxy means leaving it that way),
coturn (TURN relay), flat JSON files, no database. One Docker Compose
stack,
everything self-hosted. No page loads anything from another domain: the
typeface, the scripts and the WASM all come from your own server.

## Layout

- `server/`: the app, signaling, media, auth, recording, ops
- `server/client/`: sources for the two bundled browser assets
- `server/test/`: end-to-end tests (Playwright, fake camera/mic)
- `web/`: everything the browser loads (guest pages, host dashboard)
- `scripts/`: server setup, deploy, rollback
- `docs/runbook.md`: plain-language operations guide
- `data/`: settings, recordings, backups (created at runtime; not in git)

## Running it

You need a Linux server with Docker, a public IP, a domain pointed at
it, and ports 80/443 (TCP) plus 3478 and the media ranges 40000-40100
and 49160-49200 (UDP) open. (Running more than one studio on a host?
`RTC_MIN_PORT`/`RTC_MAX_PORT` move the public media range and
`LOCAL_PORT_BASE` moves the loopback-only range the recording capture
uses, so instances never collide.)

**The one-paste install.** Save
[`quickstart-compose.yml`](quickstart-compose.yml) as
`docker-compose.yml` anywhere on the server, fill in the five values
at the top (domain, IP, a password, two random secrets), and:

```bash
docker compose up -d
```

Nothing else: no clone, no `.env`, no config files. The app image
builds straight from this repository (the web pages ship inside it),
Caddy fetches your HTTPS certificate by itself, and the studio is at
your domain - sign in as `admin` with the password you set, then
change it in the dashboard.

**The full checkout** (for hacking on it, or the deploy-from-a-dev-box
flow): clone the repo, and then

1. On a fresh server, `bash scripts/server-setup.sh` installs Docker,
   sets the firewall and creates the folder layout.
2. Copy `.env.example` to `.env` and fill it in (domain, public IP,
   secrets; each value is explained in the file).
3. Start the stack:

```bash
docker compose up -d --build
```

Caddy fetches HTTPS certificates for your domain automatically. If
other apps on the same host need to share ports 80/443, point
`CADDY_SITES_PATH` at a folder of extra `.caddy` site files and the
bundled Caddy serves those too (set `CADDY_WWW_PATH` as well for their
static files - a site file then uses `root * /srv/www/<name>`). To
deploy updates from a dev machine instead of building on the server:
`FOSSSTUDIO_HOST=root@<ip> scripts/deploy.sh` (release folders with
instant rollback via `scripts/rollback.sh`).

### Bring your own reverse proxy (Nginx, Apache, etc.)

Already running Nginx or another proxy on your server and don't want
a second one? Then leave the `caddy` service in `docker-compose.yml`
commented out, which is how it ships, and start the stack as usual:

```bash
docker compose up -d --build
```

The app binds to `127.0.0.1:${HTTP_PORT}` (3000 by default), so your
proxy just needs to run on the same host (or in another host-networked
container) and point at that address. Terminating TLS is then yours to
do: browsers refuse camera and microphone access without HTTPS.

**Proxy on a different machine?** Also fine - the proxy only ever
carries the web half; guests' WebRTC media and the TURN relay go
directly to this machine and never pass through a proxy. Three
settings make it work:

- `BIND_HOST` - set it to this machine's private/VPN address (or
  `0.0.0.0`) so the proxy can reach the app, then firewall the app
  port so **only the proxy's IP** can connect to it. The app must
  never be reachable from the open internet directly: cameras and
  cookies only work through the HTTPS front door.
- `PUBLIC_IP` stays this machine's public IPv4, and the UDP ranges
  (3478, 40000-40100, 49160-49200) stay open **here**, not on the
  proxy box - media doesn't follow the proxy.
- `TURN_HOST` - set it to an address that reaches this machine
  directly. `DOMAIN` now resolves to the proxy, so without this the
  relay traffic would knock on the wrong door.

The Nginx block below is then identical, with `proxy_pass` pointing
at this machine's address instead of `127.0.0.1:3000`. Two things Nginx doesn't do automatically that
Caddy does, both required or the app silently breaks:

1. **WebSocket upgrade headers.** The app's signaling socket runs over
   `/ws`; without these headers the page loads but nothing ever
   connects.
2. **TLS termination.** Browsers only allow camera and microphone
   access on HTTPS pages, and session cookies are sent `Secure`-only,
   so the app requires HTTPS end-to-end. Terminate TLS in Nginx (e.g.
   with certbot) - plain HTTP cannot work.

Example server block:

```nginx
server {
    listen 443 ssl http2;
    server_name studio.example.com;

    ssl_certificate     /etc/letsencrypt/live/studio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/studio.example.com/privkey.pem;

    # The app sets its own security headers (CSP etc.); HSTS belongs
    # here at the TLS terminator, matching the bundled Caddy setup.
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name studio.example.com;
    return 301 https://$host$request_uri;
}
```

Everything else - the media ports (40000-40100/udp), coturn
(3478 + 49160-49200/udp), `PUBLIC_IP`/`DOMAIN` in `.env` - is
identical to the Caddy path; only the HTTP(S) front door changes.

### Cloudflare Tunnel

The web side works through a Cloudflare Tunnel (`cloudflared` pointing
at `http://127.0.0.1:3000`), with two things to know:

- **Media cannot go through the tunnel.** WebRTC video/audio is UDP
  straight between guests and your server, so the media ports
  (40000-40100/udp) and coturn ports (3478 + 49160-49200/udp) must
  still be open to the internet directly, and `PUBLIC_IP` set to your
  server's real public IP. A tunnel hides the web pages, not the
  media.
- **Set `TURN_HOST`.** With Cloudflare in front, `DOMAIN` resolves to
  Cloudflare's edge, which does not forward the TURN port. Point
  `TURN_HOST` in `.env` at an unproxied (grey-cloud) hostname or your
  raw server IP so guests behind strict NATs can still connect.

### Tailscale (private, no open ports at all)

For a studio reachable only inside your tailnet - nothing exposed to
the internet - leave the `caddy` service commented out and:

1. Set `BIND_HOST` in `.env` to your machine's Tailscale IP (the
   `100.x.y.z` address).
2. Serve it over HTTPS with `tailscale serve` (browsers refuse
   camera/microphone access on plain HTTP):
   `tailscale serve --bg https / http://100.x.y.z:3000`
3. Set `DOMAIN` to your machine's tailnet name (the
   `machine.tailnet-name.ts.net` one `tailscale serve` prints) and
   `PUBLIC_IP` to the Tailscale IP, so the media engine hands out an
   address every tailnet member can reach.

Guests then need to be on your tailnet (Tailscale's sharing features
cover inviting others). Everyone connects directly over the tailnet;
the TURN relay is rarely needed since Tailscale already handles
NAT traversal.

### Everyone joins but nobody can see or hear anything

Almost always the media ports never reach the server. Video and audio
go straight between guests and the server over UDP, so a reverse
proxy, a Cloudflare tunnel or an SSH tunnel carries the pages only.
On a home server, those UDP ranges need forwarding on the router.

Two more that catch people: the page has to reach the browser over
HTTPS, because browsers refuse camera and microphone access without
it; and `PUBLIC_IP` has to be an address guests can actually reach.

## Tests

```bash
cd server
node test/call-test.mjs <url> <guests>   # multi-guest video flows
node test/host-controls-test.mjs <url> <password>
node test/recording-test.mjs <url> <password> browser|server
node test/audio-energy-test.mjs          # noise suppression audio flows
node test/title-block-test.mjs <url> <password>  # logo/title block matches the video, host tools
node test/geometry-test.mjs <url> <password>     # on-screen tile layout matches the compositor, grid and spotlight
node test/spotlight-record-test.mjs <url> <password>  # a spotlit session records as a spotlight
node test/obs-feed-test.mjs              # the view-only output: no controls, invisible, never recorded
node test/session-block-test.mjs         # blocking a guest, and undoing it
node test/fosscast-publish-test.mjs      # publish-to-FOSSCast flow against a stub instance
node test/ten-guest-fit.mjs              # ten people in one room, every tile the same size
node test/firefox-compat-test.mjs <url> <password>  # same flows, real Firefox engine
```

The tests that need moving faces feed Chromium fake camera clips
(`.y4m`). They are generated locally rather than carried in the repo:
put them in `server/test/cams`, or point `CAMS_DIR` at wherever yours
live.

Day-to-day operations are dashboard buttons; see the
[runbook](docs/runbook.md) for the rare terminal cases.
