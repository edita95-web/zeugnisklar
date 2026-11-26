(function () {
  "use strict";
  var D = window.I18N;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var uiLang = "de";

  function t(key, lang) {
    lang = lang || uiLang;
    return (D[lang] && D[lang][key]) || D.de[key] || key;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- language ----------
  function guessLang() {
    var saved = store.get("zk_ui");
    if (saved && D[saved]) return saved;
    var n = (navigator.language || "de").slice(0, 2).toLowerCase();
    if (["bs", "hr", "sr", "sh", "me"].indexOf(n) >= 0) return "bs";
    if (D[n]) return n;
    return "de";
  }
  function applyLang(lang) {
    uiLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    $$("[data-i18n]").forEach(function (el) {
      if (!el.hasAttribute("data-orig")) el.setAttribute("data-orig", el.textContent);
      var k = el.getAttribute("data-i18n");
      el.textContent = lang === "de" ? el.getAttribute("data-orig") : (D[lang] && D[lang][k]) || el.getAttribute("data-orig");
    });
    $$("[data-i18n-html]").forEach(function (el) {
      if (!el.hasAttribute("data-orig")) el.setAttribute("data-orig", el.innerHTML);
      var k = el.getAttribute("data-i18n-html");
      el.innerHTML = lang === "de" ? el.getAttribute("data-orig") : (D[lang] && D[lang][k]) || el.getAttribute("data-orig");
    });
    $$("[data-i18n-ph]").forEach(function (el) {
      if (!el.hasAttribute("data-orig-ph")) el.setAttribute("data-orig-ph", el.placeholder);
      var k = el.getAttribute("data-i18n-ph");
      el.placeholder = lang === "de" ? el.getAttribute("data-orig-ph") : (D[lang] && D[lang][k]) || el.getAttribute("data-orig-ph");
    });
    $("#uiLang").value = lang;
    store.set("zk_ui", lang);
    if (!store.get("zk_report_lang")) {
      $("#reportLang").value = lang === "de" ? "bs" : lang;
    }
    renderSample();
  }

  // ---------- report rendering ----------
  function gradeClass(g) { return /^[1-5]$/.test(g) ? "g" + g : ""; }

  function renderReport(r, lang) {
    var L = D[lang] ? lang : uiLang;
    if (!r.is_arbeitszeugnis) {
      return '<div class="card"><h3>' + esc(t("r_notz", L)) + "</h3><p>" + esc(r.summary) + "</p></div>";
    }
    var h = "";
    h += '<div class="card r-head"><span class="grade big ' + gradeClass(r.overall_grade) + '">' + esc(r.overall_grade === "unklar" ? "?" : r.overall_grade) + "</span>";
    h += "<div><div class='muted'>" + esc(t("r_grade", L)) + "</div><h3>" + esc(r.overall_grade_label) + "</h3>";
    h += "<div class='r-sub'><span>" + esc(t("r_perf", L)) + ": <b>" + esc(r.performance_grade) + "</b></span><span>" + esc(t("r_behav", L)) + ": <b>" + esc(r.behavior_grade) + "</b></span>";
    h += "<span>" + esc(t("r_type", L)) + ": " + esc(t("t_" + r.zeugnis_type, L)) + "</span><span>" + esc(t("r_country", L)) + ": " + esc(r.country) + "</span></div></div></div>";
    h += '<div class="card"><p style="margin:0">' + esc(r.summary) + "</p></div>";

    if (r.phrases && r.phrases.length) {
      h += '<div class="card r-section"><h3>' + esc(t("r_phrases", L)) + "</h3>";
      r.phrases.forEach(function (p) {
        h += '<div class="phrase"><span class="grade ' + gradeClass(p.grade) + '">' + esc(p.grade) + "</span>";
        h += "<q>" + esc(p.quote_de) + '</q><p><span class="tone ' + esc(p.tone) + '">' + esc(t("tone_" + p.tone, L)) + "</span> " + esc(p.meaning) + "</p></div>";
      });
      h += "</div>";
    }
    if (r.red_flags && r.red_flags.length) {
      h += '<div class="card r-section"><h3>⚠️ ' + esc(t("r_flags", L)) + "</h3>";
      r.red_flags.forEach(function (f) {
        h += '<div class="flag"><strong>' + esc(f.issue) + "</strong>" + esc(f.explanation) + "</div>";
      });
      h += "</div>";
    }
    var c = r.closing_formula || {};
    h += '<div class="card r-section"><h3>' + esc(t("r_complete", L)) + '</h3><ul class="list-check">';
    (r.completeness || []).forEach(function (x) {
      h += "<li>" + (x.present ? "✅ " : "❌ ") + esc(x.element) + (x.note ? " <span class='muted'>– " + esc(x.note) + "</span>" : "") + "</li>";
    });
    h += "<li>" + (c.thanks ? "✅ " : "❌ ") + esc(t("r_thanks", L)) + "</li>";
    h += "<li>" + (c.regret ? "✅ " : "❌ ") + esc(t("r_regret", L)) + "</li>";
    h += "<li>" + (c.future_wishes ? "✅ " : "❌ ") + esc(t("r_wishes", L)) + "</li>";
    if (c.comment) h += "<li class='muted'>" + esc(c.comment) + "</li>";
    h += "</ul></div>";

    if (r.next_steps && r.next_steps.length) {
      h += '<div class="card r-section"><h3>' + esc(t("r_next", L)) + "</h3><ol>";
      r.next_steps.forEach(function (s) { h += "<li>" + esc(s) + "</li>"; });
      h += "</ol></div>";
    }
    if (r.correction_letter_de) {
      h += '<div class="card r-section"><h3>✉️ ' + esc(t("r_letter", L)) + '</h3><div class="letter">' + esc(r.correction_letter_de) + "</div>";
      h += '<div class="r-actions" style="margin-top:12px"><button type="button" class="btn btn-ghost btn-small js-copy">' + esc(t("r_copy", L)) + "</button>";
      h += '<button type="button" class="btn btn-ghost btn-small js-print">' + esc(t("r_print", L)) + "</button></div></div>";
    }
    h += '<p class="disclaimer">' + esc(t("r_disc", L)) + "</p>";
    return h;
  }

  function bindReportActions(container, r, lang) {
    var copy = container.querySelector(".js-copy");
    if (copy) copy.addEventListener("click", function () {
      navigator.clipboard.writeText(r.correction_letter_de).then(function () { copy.textContent = t("r_copied", lang); });
    });
    var pr = container.querySelector(".js-print");
    if (pr) pr.addEventListener("click", function () { window.print(); });
  }

  // The example result follows the page language (one file per UI language).
  var samples = {};
  function renderSample() {
    var lang = uiLang, el = $("#sampleReport");
    if (samples[lang]) {
      el.innerHTML = renderReport(samples[lang], lang);
      bindReportActions(el, samples[lang], lang);
      return;
    }
    fetch("/sample-report." + lang + ".json").then(function (r) { return r.json(); }).then(function (j) {
      samples[lang] = j;
      if (uiLang === lang) renderSample();
    }).catch(function () {});
  }

  // ---------- config / checkout ----------
  var config = { checkoutSingle: "", checkoutFamily: "", paymentsEnabled: true };
  fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) {
    config = c;
    $$(".checkout").forEach(function (a) {
      var u = a.getAttribute("data-plan") === "family" ? c.checkoutFamily : c.checkoutSingle;
      if (u) a.href = u;
    });
    if (!c.paymentsEnabled) $("#licenseKey").closest(".field").classList.add("hidden");
  }).catch(function () {});
  $$(".checkout").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (a.getAttribute("href") === "#") { e.preventDefault(); alertMsg(t("e_soon")); }
    });
  });
  function alertMsg(m) { showError(m); $("#pruefen").scrollIntoView(); }

  // ---------- license key ----------
  var keyInput = $("#licenseKey");
  var params = new URLSearchParams(location.search);
  keyInput.value = params.get("key") || store.get("zk_key") || "";
  function checkKey() {
    var k = keyInput.value.trim();
    var st = $("#keyStatus");
    if (!k) return;
    store.set("zk_key", k);
    fetch("/api/check-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        st.className = "hint " + (j.ok ? "ok" : "bad");
        if (j.ok) st.textContent = j.remaining == null ? t("k_ok_unl") : t("k_ok") + " " + j.remaining;
        else st.textContent = t(j.reason === "used_up" ? "k_used" : j.reason === "invalid" ? "k_invalid" : "k_err");
      }).catch(function () { st.className = "hint bad"; st.textContent = t("k_err"); });
  }
  keyInput.addEventListener("change", checkKey);
  if (keyInput.value) checkKey();

  // ---------- tabs / file ----------
  var activeTab = "file";
  $$(".tab").forEach(function (b) {
    b.addEventListener("click", function () {
      activeTab = b.getAttribute("data-tab");
      $$(".tab").forEach(function (x) { x.classList.toggle("active", x === b); });
      $$(".tabpane").forEach(function (p) { p.classList.toggle("hidden", p.getAttribute("data-pane") !== activeTab); });
    });
  });
  var fileInput = $("#fileInput");
  fileInput.addEventListener("change", function () {
    var f = fileInput.files[0];
    $("#drop").classList.toggle("has", !!f);
    if (f) $("#dropLabel").textContent = "📄 " + f.name;
  });

  function readAsBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  // Large phone photos are scaled down so the upload stays small and fast.
  function prepareImage(file) {
    if (file.size < 1.5 * 1024 * 1024) return readAsBase64(file).then(function (d) { return { type: file.type, data: d }; });
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var max = 2200, w = img.width, h = img.height, s = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement("canvas");
        cv.width = Math.round(w * s); cv.height = Math.round(h * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { readAsBase64(b).then(function (d) { res({ type: "image/jpeg", data: d }); }, rej); }, "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- submit ----------
  function showError(m) { var e = $("#formError"); e.textContent = m; e.classList.remove("hidden"); }
  function clearError() { $("#formError").classList.add("hidden"); }

  $("#reportLang").addEventListener("change", function () { store.set("zk_report_lang", $("#reportLang").value); });
  var savedRL = store.get("zk_report_lang");
  if (savedRL) $("#reportLang").value = savedRL;

  $("#checkForm").addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();
    var key = keyInput.value.trim();
    var lang = $("#reportLang").value;
    if (config.paymentsEnabled && !key) return showError(t("e_key"));
    var text = activeTab === "text" ? $("#zeugnisText").value.trim() : "";
    var file = activeTab === "file" ? fileInput.files[0] : null;
    if (!text && !file) return showError(t("e_empty"));
    if (!$("#consent").checked) return showError(t("e_consent"));
    if (file && (file.size > 8 * 1024 * 1024 && file.type === "application/pdf" || !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type))) return showError(t("e_file"));

    var btn = $("#submitBtn");
    btn.disabled = true;
    $("#loading").classList.remove("hidden");
    $("#result").classList.add("hidden");

    var filePromise = !file ? Promise.resolve(null) : file.type === "application/pdf"
      ? readAsBase64(file).then(function (d) { return { type: file.type, data: d }; })
      : prepareImage(file);

    filePromise.then(function (f) {
      return fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key, lang: lang, text: text, file: f }),
      });
    }).then(function (res) {
      return res.text().then(function (body) {
        var j; try { j = JSON.parse(body.trim()); } catch (x) { j = { error: "ai_error" }; }
        return j;
      });
    }).then(function (j) {
      if (j.report) {
        var out = $("#result");
        out.innerHTML = renderReport(j.report, lang);
        bindReportActions(out, j.report, lang);
        out.classList.remove("hidden");
        out.scrollIntoView({ behavior: "smooth" });
        checkKey();
      } else if (j.error === "license") {
        showError(t(j.reason === "used_up" ? "k_used" : j.reason === "invalid" ? "k_invalid" : "k_err"));
      } else {
        showError(t({ file_type: "e_file", file_size: "e_file", too_long: "e_too_long", empty: "e_empty", refusal: "e_refusal" }[j.error] || "e_ai"));
      }
    }).catch(function () { showError(t("e_net")); })
      .then(function () { btn.disabled = false; $("#loading").classList.add("hidden"); });
  });

  $("#uiLang").addEventListener("change", function () { applyLang($("#uiLang").value); });
  applyLang(guessLang());
})();
