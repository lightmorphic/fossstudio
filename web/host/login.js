// A studio nobody owns yet has no password to ask for: send them to the
// setup page instead of a login they can never pass.
fetch("/api/setup/state").then((r) => r.json()).then((s) => {
  if (!s.claimed) location.href = "/host/setup.html";
}).catch(() => { /* offline: the form still works */ });

const form = document.getElementById("loginForm");
const errEl = document.getElementById("loginError");
form.onsubmit = async (e) => {
  e.preventDefault();
  errEl.hidden = true;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
      totp: document.getElementById("totp").value
    })
  });
  if (res.ok) {
    location.href = "/host/";
    return;
  }
  const { error } = await res.json();
  // If 2FA is on, reveal the code field for the next try
  if (/2FA/.test(error)) document.getElementById("totpField").hidden = false;
  errEl.textContent = error;
  errEl.hidden = false;
};

// Signing in with a passkey. Offered only where the browser has the API
// and the studio has at least one registered - otherwise the button
// would be a promise nobody can keep.
(function () {
  var b64from = (str) => {
    var raw = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };
  var b64to = (buf) => {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  if (!window.PublicKeyCredential) return;
  var btn = document.getElementById("passkeyBtn");
  fetch("/api/login/passkey/begin", { method: "POST" })
    .then((r) => r.json())
    .then((opts) => {
      if (!opts.allowCredentials || !opts.allowCredentials.length) return;
      btn.hidden = false;
      btn.onclick = async () => {
        errEl.hidden = true;
        try {
          // A fresh challenge for the attempt itself: the one fetched to
          // decide whether to show the button has been spent deciding.
          var fresh = await fetch("/api/login/passkey/begin", { method: "POST" }).then((r) => r.json());
          var cred = await navigator.credentials.get({
            publicKey: {
              challenge: b64from(fresh.challenge),
              rpId: fresh.rpId,
              allowCredentials: fresh.allowCredentials.map((id) => ({ type: "public-key", id: b64from(id) })),
              userVerification: "preferred",
              timeout: 90000
            }
          });
          var res = await fetch("/api/login/passkey/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: b64to(cred.rawId),
              response: {
                clientDataJSON: b64to(cred.response.clientDataJSON),
                authenticatorData: b64to(cred.response.authenticatorData),
                signature: b64to(cred.response.signature)
              }
            })
          });
          if (res.ok) { location.href = "/host/"; return; }
          var data = await res.json().catch(() => ({}));
          errEl.textContent = data.error || "That passkey did not work.";
          errEl.hidden = false;
        } catch {
          errEl.textContent = "Your browser would not use a passkey here.";
          errEl.hidden = false;
        }
      };
    })
    .catch(() => { /* no passkeys, no button */ });
})();
