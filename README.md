# ZeugnisKlar

Arbeitszeugnis-Check in der Muttersprache. Cloudflare Worker + statische Seite.

- `public/` – Website (Startseite, Ratgeber-Artikel, Impressum/Datenschutz/AGB)
- `src/worker.js` – API: Lizenz-Code prüfen (Polar), Zeugnis analysieren (Claude API)
- `src/prompt.js` – Anweisungen an die KI und das Ergebnis-Format
- `wrangler.toml` – Einstellungen (Polar-IDs, Checkout-Links, Modell)

## Einstellungen (Cloudflare → Worker → Settings → Variables and Secrets)

| Name | Art | Wert |
|---|---|---|
| `ANTHROPIC_API_KEY` | Secret | API-Key aus console.anthropic.com |
| `POLAR_ORGANIZATION_ID` | Text | Polar → Settings → Organization ID |
| `CHECKOUT_URL_SINGLE` | Text | Polar Checkout-Link „Einzel-Check“ |
| `CHECKOUT_URL_FAMILY` | Text | Polar Checkout-Link „3er-Paket“ |
| `POLAR_SANDBOX` | Text | `true` nur zum Testen mit sandbox.polar.sh |

Polar-Produkte brauchen den Benefit **License Keys** mit *Usage limit* 1 (Einzel) bzw. 3 (Paket).
Ein Code wird erst nach einer erfolgreichen Analyse verbraucht.

## Lokal testen

```
npm install
printf 'MOCK_AI="true"\nPAYMENTS="off"\n' > .dev.vars
npx wrangler dev
```

`MOCK_AI=true` zeigt das Beispiel-Ergebnis ohne KI-Kosten.

## Kosten pro Prüfung

Claude Opus 5.5 ($4 / $20 pro Mio. Tokens): ca. 0,05–0,20 USD pro Zeugnis.
