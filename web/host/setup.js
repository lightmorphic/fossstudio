// First run, one step at a time. Nothing here is clever; the point is
// that every refusal says what would be accepted instead.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function show(id) {
    ["stepCode", "stepLogin", "stepPasskey", "stepTwoFactor", "stepPlace", "stepDone"]
      .forEach(function (s) {
        // stepCode is taken out of the page altogether unless the
        // studio has been set to ask for a code.
        var el = $(s);
        if (el) el.hidden = s !== id;
      });
  }

  function say(el, text) {
    el.textContent = text;
    el.hidden = !text;
  }

  async function post(url, body) {
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  // A studio somebody already owns has no business showing this page.
  // And the studio, not the browser, decides whether a code is wanted -
  // ordinarily it is not, and then the step is removed rather than
  // hidden. Nobody should have to wonder what a grayed-out box was
  // for, or go looking in a log for a code that was never printed.
  fetch("/api/setup/state").then(function (r) { return r.json(); }).then(function (s) {
    if (s.claimed) return void (location.href = "/host/login.html");
    if (s.needsCode) return show("stepCode");
    var step = $("stepCode");
    if (step) step.remove();
    $("noOwnerYet").hidden = false;
    show("stepLogin");
  });

  // ---- 1. the code, on the installs that ask for one ---------------
  // It is only checked when the password is set, because checking it
  // twice would mean holding it in the page in between. So this step
  // just carries it forward.
  var setupCode = "";
  if ($("codeNext")) {
    $("codeNext").onclick = function () {
      var value = $("code").value.trim();
      if (!value) return say($("codeErr"), "Paste the code from the log above.");
      setupCode = value;
      say($("codeErr"), "");
      show("stepLogin");
    };
    $("code").addEventListener("keydown", function (e) { if (e.key === "Enter") $("codeNext").click(); });
  }

  // ---- 2. the login ------------------------------------------------
  function freshSuggestion() {
    fetch("/api/setup/passphrase").then(function (r) { return r.json(); }).then(function (d) {
      $("suggestion").textContent = d.passphrase;
    });
  }
  freshSuggestion();
  $("newSuggestion").onclick = freshSuggestion;
  $("useSuggestion").onclick = function () {
    $("password").value = $("suggestion").textContent;
    $("password").type = "text";
    say($("loginErr"), "");
  };

  // Said while typing rather than only on submit, so nobody chooses a
  // password, commits it to memory and then has it refused.
  var checkTimer = null;
  $("password").addEventListener("input", function () {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () {
      var pw = $("password").value;
      if (!pw) return say($("loginErr"), "");
      post("/api/setup/check-password", { password: pw, username: $("username").value })
        .then(function (d) { say($("loginErr"), d.problem); })
        .catch(function () { /* the real check happens on submit */ });
    }, 400);
  });

  $("claim").onclick = function () {
    $("claim").disabled = true;
    post("/api/setup/claim", {
      code: setupCode,
      username: $("username").value,
      password: $("password").value
    }).then(function () {
      say($("loginErr"), "");
      show(window.PublicKeyCredential ? "stepPasskey" : "stepTwoFactor");
    }).catch(function (err) {
      // A wrong code is a wrong step, not a wrong password, so the
      // sentence goes back to the step it belongs to rather than being
      // hidden along with the one the person has left.
      if (/setup code/.test(err.message) && $("stepCode")) {
        say($("loginErr"), "");
        say($("codeErr"), err.message);
        show("stepCode");
      } else {
        say($("loginErr"), err.message);
      }
    }).finally(function () { $("claim").disabled = false; });
  };

  // ---- 3. a passkey ------------------------------------------------
  var b64 = {
    to: function (buf) {
      var bytes = new Uint8Array(buf), s = "";
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    from: function (str) {
      var s = str.replace(/-/g, "+").replace(/_/g, "/");
      var raw = atob(s);
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }
  };
  window.fsPasskeyB64 = b64;

  window.fsAddPasskey = async function () {
    var opts = await post("/api/passkeys/begin");
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: b64.from(opts.challenge),
        rp: { id: opts.rpId, name: opts.rpName },
        user: { id: b64.from(opts.userId), name: opts.userName, displayName: opts.userName },
        // ES256 first, then RS256: between them every authenticator a
        // browser will offer is covered.
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        excludeCredentials: (opts.excludeCredentials || []).map(function (id) {
          return { type: "public-key", id: b64.from(id) };
        }),
        timeout: 90000,
        attestation: "none"
      }
    });
    return post("/api/passkeys/finish", {
      response: {
        clientDataJSON: b64.to(cred.response.clientDataJSON),
        attestationObject: b64.to(cred.response.attestationObject)
      }
    });
  };

  $("addPasskey").onclick = function () {
    say($("passkeyErr"), "");
    window.fsAddPasskey().then(function () {
      $("passkeyOk").hidden = false;
      setTimeout(function () { show("stepTwoFactor"); }, 900);
    }).catch(function (err) {
      say($("passkeyErr"), err.message || "Your browser would not make a passkey here.");
    });
  };
  $("skipPasskey").onclick = function () { show("stepTwoFactor"); };

  // ---- 4. two-factor -----------------------------------------------
  $("startTfa").onclick = function () {
    post("/api/2fa/setup").then(function (d) {
      // Grouped in fours: a secret you have to type is a secret you
      // have to be able to read.
      $("tfaSecret").textContent = d.secret.replace(/(.{4})/g, "$1 ").trim();
      $("tfaLink").href = d.otpauth;
      $("tfaStart").hidden = true;
      $("tfaCodes").hidden = false;
    }).catch(function (err) { say($("tfaErr"), err.message); });
  };
  $("skipTfa").onclick = function () { show("stepPlace"); };
  $("skipTfa2").onclick = function () { show("stepPlace"); };
  $("confirmTfa").onclick = function () {
    post("/api/2fa/enable", { code: $("tfaCode").value }).then(function () {
      show("stepPlace");
    }).catch(function () {
      say($("tfaErr"), "That code is not right. Check your phone's clock is correct and try the next one.");
    });
  };

  // ---- 5. where it lives -------------------------------------------
  fetch("/api/setup/place").then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p) return;
    $("domain").value = p.domain === "localhost" ? location.hostname : (p.domain || location.hostname);
    $("publicIp").value = p.publicIp || "";
  });

  $("savePlace").onclick = function () {
    fetch("/api/setup/place", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: $("domain").value, publicIp: $("publicIp").value })
    }).then(async function (res) {
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      show("stepDone");
    }).catch(function (err) { say($("placeErr"), err.message); });
  };
})();
