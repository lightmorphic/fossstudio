> ## Public beta. Not ready to be relied on.
>
> **This is a public beta. It is not ready to be relied on. Data loss
> and breaking changes are possible. Please do not put a real show, or
> a meeting that matters, on it yet.**
>
> We want people to install it, break it and tell us what happened.
> That is what a beta is for. What we are not ready for is being the
> only thing standing between you and a recording you cannot make
> again. Record a test session first, and keep a second recording
> running for anything that matters.
>
> Releases are marked as pre-release on GitHub. The current version is
> `0.1.0`.

# FOSSStudio

Self-hosted video studio for podcasts and meetings. Guests join by link
with no account and no email address; the host runs the session from a
panel on the same page and gets the recording afterwards.

A podcast and a meeting are the same thing until the end - a link,
people talking, a recording - and the studio is built for both. What
differs is what you do with the files: publish them, or keep them.
Nobody needs an account, there is no charge per seat and no time limit
on a session, and the recording lands on the server you control and
goes nowhere else.

## Free, and staying free

FOSSStudio is free software under the AGPL, and it always will be. Put
the compose file on a machine you control and it is yours: no account,
no key, no tier, no per-guest charge, no watermark, nothing phoning
home. There is no analytics, no tracking, no crash reporting and no
update check, and the code, the fonts and the relay are all served from
your own machine. One thing leaves it, and only when you ask: turning on
desktop notifications means the nudge travels through your browser
maker's push service, as every web notification does. Everything in this
repository is everything there is.

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
- **One account:** an install is one person's studio. One login runs
  the sessions, holds the recordings, sets the look and looks after the
  box, all from the one dashboard at `/host/`. You set the password the
  first time you open the studio - at least twelve characters, and not
  one of the ones everybody guesses - and can add a passkey, so the
  private key stays on your own device and a stolen data folder yields
  nothing to log in with, and a second factor on top. There is no way to
  make a second account, because a
  second person who wants a studio runs their own copy - the license is
  there for exactly that. Guests need no account at all, which is the
  whole point of the link. The dashboard can have a domain of its own
  if you like: point host.<your-domain> at the server and it works,
  certificate included.
- **In-session host controls:** spotlight or grid, per-guest volume,
  per-session automatic level balancing, mute one or mute everyone,
  lower a raised hand, start and stop recording, and two overlays -
  a subscribe reminder and your own advertising banner - that everyone
  sees and the recording keeps.
- **Recording:** the host's browser draws and encodes the video of
  everyone, and each person can be recorded in their own browser on a
  track of their own as well, uploaded as it is made. Nothing on the
  server ever opens a recording - there is no media tool in the image
  and nothing decodes a sample - so the box stays quiet however full the
  room is.
- **One question, then the rest only if you want it.** Settings, Formats
  asks what the finished **video of everyone** should be - **MP4
  (H.264)**, **WebM VP8**, **VP9** or **AV1** - and then whether you
  want a file for each person as well. A new studio says no, so a
  recording is one file. Say yes and you pick what those are: **WAV**,
  every sample as the microphone heard it at about **1.4 GB per person
  per hour**, or **Opus** at about **58 MB**, and the same four for the
  cameras. The screen adds up what a show of your size comes to before
  you record rather than after. **Read this before a long show.**
- **Whoever hosts decides the video of everyone.** Their browser draws
  the show and encodes it; no guest's browser touches that file. So an
  MP4 needs the host on Chrome or Edge, and a host on Firefox gets WebM
  whatever is chosen. Nothing here converts anything, so the list is the
  browser's, not ours: Firefox writes Opus and VP8 and nothing else, and
  a guest on it comes back in those whatever you pick, with the
  Recordings list saying so beside their files.
- **Every track is the full length of the take.** Somebody who joins
  five minutes late has five minutes of silence at the front of theirs,
  so it still starts at zero and lines up with everybody else's with
  nothing to drag. Somebody who drops out and comes back is the same
  person on the same track, with the time away as silence in the middle
  of one file rather than a second file. The audio arrives as a `.wav`
  or an `.opus` - the same audio the browser recorded, repackaged
  rather than re-encoded, in a form an editor opens without an extra
  library. A camera track is whatever the browser's own encoder made of
  the picture, one file per stretch, each told where in the take it
  starts, because silence can be manufactured without an encoder and a
  picture of nothing cannot.
- **One video of the whole thing:** while a take is running, the host's
  browser also draws the show as everyone sees it onto a 1280x720
  canvas, mixes every voice into one track and encodes it. That arrives
  as a single finished file, so the server has nothing to do when a
  show ends however long it was. It carries
  everyone's tile, their lower-third name banners, the podcast logo and
  episode title block (the host drags it anywhere, resizes it, and
  right-clicks it for the rest: logo left of the title, right, above or
  below, the block's background color, or drop either for a session),
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
- **Backdrops, switched mid-show:** the host panel's Backdrop control
  holds it all - pick a color (palette or hex) and wear it solid, or
  as any of six logo layouts generated on the spot from your logo in
  that color (a 3D scatter, a dense mosaic, aligned rows, brick
  offset, a tilted diagonal grid, or a single corner watermark) - or
  switch to the uploaded wallpaper. A new look for a new segment, on
  every screen at once; sessions open on the color you used last.
- **One look per show:** the theme (wallpaper, background color, logo,
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

FOSSStudio records people talking. It does not publish what it
records, and it does not broadcast it.

- **No broadcasting.** The studio does not push the show anywhere.
  Every session has a view-only output link that works as a browser
  source in [OBS](https://obsproject.com) or anything like it, so a
  host who wants to broadcast does it from software built for that job
  and sends the show wherever it can reach.
- **No podcast hosting.** No RSS feed, no episode website, no download
  statistics, no directory submission. The studio hands you the files
  and stops there; a podcast host is a separate job for separate
  software.
- **No editing, and no processing of any kind.** Nothing on the server
  opens a recording, converts it, mixes it or re-encodes it - there is
  no media tool installed and no long-running child process anywhere in
  the product. You get the tracks as they were recorded; trimming,
  cutting and mixing happen in whatever editor you already use.
- **No transcription and no captions.**
- **No audience accounts, memberships or payments.**
- **No telephone dial-in and no SIP.** Guests join in a browser.
- **No screen sharing.** FOSSStudio records people talking to each
  other, so a meeting that needs a slide deck on screen needs something
  else as well.
- **No calendar, no invitations and no attendance reports.** You send a
  link however you already send links.
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

## License

Free software under the [GNU AGPL v3](LICENSE).

[NOTICE.md](NOTICE.md) records who wrote what. FOSSStudio is
Lightmorphic's own work throughout; the third-party material is
mediasoup-client (ISC), RNNoise via `@jitsi/rnnoise-wasm` (Apache-2.0
over BSD-3-Clause) and the Manrope typeface (SIL OFL 1.1). Four runtime
npm dependencies, listed there with their licenses.

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
it, and ports 80/443 (TCP) plus 3478 and the media ranges 40000-40003
and 49160-49189 (UDP) open.

The stack runs on a normal bridge network and publishes those ports the
ordinary way, host number equal to container number, so Dockge, Dokploy,
Portainer and the rest list them and offer a link. The ranges are short
because mediasoup carries every connection over the same few sockets:
four ports hold a full room. (Running more than one studio on a host?
`RTC_MIN_PORT`/`RTC_MAX_PORT` and `TURN_MIN_PORT`/`TURN_MAX_PORT` move
the ranges, so instances never collide.)

**The one-paste install.** Save
[`quickstart-compose.yml`](quickstart-compose.yml) as
`docker-compose.yml` anywhere on the server, and:

```bash
docker compose up -d
```

There is nothing to fill in. The file holds the image, the ports and the
volume; the domain, the login and the secrets are settings inside the
studio. It makes its own secrets on the first start and keeps them in
its data volume, so nobody generates one with `openssl` and nobody
pastes one anywhere.

Open your domain in a browser and the studio asks for the password you
want, offers you a passkey and two-factor, and asks where it lives.
There is no setup code: the first person to open a studio nobody owns
yet claims it, and after that the setup screen is gone and the route
behind it refuses everybody.

**The minute that leaves open.** Between the container starting and you
opening the page, anybody who can reach that address could claim it
instead. On a home network that is a minute with nobody looking, and it
is how Jellyfin, Immich and Home Assistant all work. On a server with
the port open to the internet it is a real window: keep the port shut
until you have claimed it, or set `REQUIRE_SETUP_CODE=1` in the app's
environment, which puts back a code printed in `docker compose logs
app` and asks for it before anyone may claim the studio. The studio
takes the address from the connection and never from a header, so
`X-Forwarded-For: 127.0.0.1` buys a stranger nothing.

The password is enforced rather than advised: at least twelve
characters, and not one of the ones everybody guesses. There are no
rules about capitals and symbols. A passphrase is offered beside the
box if you would rather not think of one.

Everything on that screen is in Settings afterwards, and the studio's
own help is the Help tab at the foot of the dashboard's left-hand menu
(`/help` on your install goes there too) - it works with no internet
connection, has pictures of the real screens in it, and describes the
version you have.

**The full checkout** (for hacking on it, or the deploy-from-a-dev-box
flow): clone the repo, and then

1. On a fresh server, `bash scripts/server-setup.sh` installs Docker,
   sets the firewall and creates the folder layout.
2. Copy `.env.example` to `.env` if you want to change any of the
   defaults - ports, where the data folder lives, who may reach the web
   port. There are no secrets in it and the stack runs without one.
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

Set `APP_BIND=127.0.0.1` in `.env` and the web port is published on
loopback only - `127.0.0.1:3000` - so your proxy on this host can reach
it and nothing else can. A proxy in another container on the same
compose network reaches the app by service name (`app:3000`) instead.
Terminating TLS is then yours to do: browsers refuse camera and
microphone access without HTTPS.

**Proxy on a different machine?** Also fine - the proxy only ever
carries the web half; guests' WebRTC media and the TURN relay go
directly to this machine and never pass through a proxy. Three
settings make it work:

- `APP_BIND` - set it to this machine's private/VPN address so the
  proxy can reach the app, then firewall that port so **only the
  proxy's IP** can connect to it. (`BIND_HOST` is a different thing:
  the address the app listens on inside its container, which stays
  `0.0.0.0` or the published port reaches nothing.) The app must never
  be reachable from the open internet directly: cameras and cookies
  only work through the HTTPS front door.
- **This server's public address** (Settings, Studio address) stays this
  machine's public IPv4, and the UDP ranges (3478, 40000-40003,
  49160-49189) stay open **here**, not on the proxy box - media doesn't
  follow the proxy.
- **The relay address** (same screen) - set it to an address that
  reaches this machine directly. The domain now resolves to the proxy,
  so without this the relay traffic would knock on the wrong door.

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

Everything else - the media ports (40000-40003/udp and /tcp), coturn
(3478 + 49160-49189/udp), the domain and public address in Settings - is
identical to the Caddy path; only the HTTP(S) front door changes.

### Cloudflare Tunnel

The web side works through a Cloudflare Tunnel (`cloudflared` pointing
at `http://127.0.0.1:3000`), with two things to know:

- **Media cannot go through the tunnel.** WebRTC video/audio is UDP
  straight between guests and your server, so the media ports
  (40000-40003/udp) and coturn ports (3478 + 49160-49189/udp) must
  still be open to the internet directly, and the public address in
  Settings set to your server's real public IP. A tunnel hides the web
  pages, not the media.
- **Set the relay address.** With Cloudflare in front, your domain
  resolves to Cloudflare's edge, which does not forward the TURN port.
  Put an unproxied (gray-cloud) hostname or your raw server IP in
  Settings, Studio address, so guests behind strict NATs can still
  connect.

### Tailscale (private, no open ports at all)

For a studio reachable only inside your tailnet - nothing exposed to
the internet - leave the `caddy` service commented out and:

1. Set `APP_BIND` in `.env` to your machine's Tailscale IP (the
   `100.x.y.z` address), so the web port is published on the tailnet
   and nowhere else.
2. Serve it over HTTPS with `tailscale serve` (browsers refuse
   camera/microphone access on plain HTTP):
   `tailscale serve --bg https / http://100.x.y.z:3000`
3. In Settings, Studio address, set the domain to your machine's
   tailnet name (the `machine.tailnet-name.ts.net` one `tailscale serve`
   prints) and the public address to the Tailscale IP, so the media
   engine hands out an address every tailnet member can reach. Restart
   the studio afterwards.

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
it; and the public address in Settings has to be one guests can
actually reach. The studio's own Help tab says all of this too, in the
place somebody hits it, with a picture of the screen it means.

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
node test/one-account-test.mjs <url> <password>  # one account, and no road to a second
node test/setup-test.mjs                         # first run: no code, password rule, passkey, 2FA
node test/rejoin-track-test.mjs <url> <password>  # a track is the full length of the take
node test/quality-test.mjs <url> <password>       # the recording quality setting, both ways
node test/help-test.mjs <url> <password>          # the Help tab, its pictures, every link into it, three widths
node test/help-shots.mjs <url> <password>        # remakes the Help tab's pictures from the real screens
node test/ten-guest-fit.mjs              # ten people in one room, every tile the same size
node test/firefox-compat-test.mjs <url> <password>  # same flows, real Firefox engine
node test/spelling-test.mjs               # American spelling everywhere a person reads
```

The tests that need moving faces feed Chromium fake camera clips
(`.y4m`). They are generated locally rather than carried in the repo:
put them in `server/test/cams`, or point `CAMS_DIR` at wherever yours
live.

Day-to-day operations are dashboard buttons; see the
[runbook](docs/runbook.md) for the rare terminal cases.
