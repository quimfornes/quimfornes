# Radar de Valors · app

App per a iPhone, iPad i Mac (i qualsevol navegador) que fa el mateix que el *Radar de Valors* de Claude, i hi afegeix més funcions:

| Funció | Radar original | App |
|---|---|---|
| Tauler d'accions, índexs i cripto amb tendència | ✔ | ✔ |
| Fitxa: preu, rang 52 setmanes, analistes, notícies, riscos | ✔ | ✔ (+ gràfic de preu) |
| Calculadora de venda amb IRPF, dipòsit i prima de risc | ✔ | ✔ (mateix motor, amb tests) |
| Avisos verd/vermell | ✔ | ✔ + **avisos de preu propis** (per sobre / per sota) |
| Favorits dels grans bancs | ✔ | ✔ |
| Pregunta a Claude | ✔ | ✔ (amb la teva clau d'API, model a triar) |
| **Puntuació Radar 0–100** amb gràfic d'aranya (consens, potencial, impuls, estabilitat, tendència) | — | ✔ |
| **Cartera**: valor en €, resultat latent, net després d'IRPF, distribució | — | ✔ |
| **Dades en directe** sense dependre de Claude (CoinGecko, BCE, Finnhub) | — | ✔ |
| **Llista de seguiment editable** (cerca i afegeix qualsevol acció o cripto) | — | ✔ |
| Notificacions, mode fosc, català / castellà / anglès | parcial | ✔ |
| Còpia de seguretat (exporta / importa), funciona sense connexió | — | ✔ |

Les dades inicials són la instantània del Radar del 20 d'octubre de 2026; a partir d'aquí l'app s'actualitza sola.

## Fonts de dades

| Dada | Font | Clau |
|---|---|---|
| Cripto (preu, 24 h, historial 1 any) | CoinGecko | no cal |
| EUR/USD | BCE via Frankfurter | no cal |
| Accions (preu, 52 setmanes, PER, tendència d'analistes, notícies, data de resultats) | Finnhub | gratuïta a finnhub.io |
| Preus objectiu i accions d'analistes, favorits dels bancs, riscos | instantània del Radar | — |
| Dow Jones i IBEX 35 | instantània del Radar (el pla gratuït de Finnhub no inclou índexs) | — |

## Desenvolupament

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # motor fiscal i puntuació
npm run build      # genera dist/
```

## Instal·lar-la avui mateix (PWA, sense App Store)

1. Publica `dist/` en qualsevol hosting HTTPS estàtic (GitHub Pages, Netlify, Cloudflare Pages).
2. **iPhone/iPad**: obre l'adreça amb Safari → Compartir → *Afegeix a la pantalla d'inici*.
3. **Mac**: Safari → Fitxer → *Afegeix al Dock* (o la icona d'instal·lar de Chrome).

Funciona a pantalla completa, amb icona pròpia i sense connexió.

## App nativa per a l'App Store (iPhone, iPad i Mac)

L'embolcall natiu és Capacitor. Cal un Mac amb Xcode i un compte d'Apple Developer (99 $/any).

```bash
npm install
npm run build
npx cap add ios          # només la primera vegada
npm run ios              # build + sync + obre Xcode
```

A Xcode: *Signing & Capabilities* → el teu equip; a *General → Supported Destinations* afegeix **Mac (Designed for iPad)** perquè la mateixa app s'instal·li al MacBook. Icona per a l'App Store: `public/icons/icon-1024.png`.

## Abans de vendre-la (no és opcional)

1. **Llicència de dades.** Els plans gratuïts de Finnhub i CoinGecko **no permeten ús comercial**. Per vendre l'app cal un pla de pagament (o un altre proveïdor amb llicència de redistribució) i, idealment, un petit backend que faci de servidor intermediari perquè la clau no vagi dins l'app.
2. **Clau de Claude.** Ara cada usuari hi posa la seva (BYOK). Per a un producte de pagament, la crida s'ha de fer des del teu backend amb la teva clau i un límit d'ús per usuari (és el que permet cobrar-ho com a subscripció).
3. **Instantània d'analistes.** Els preus objectiu i els favorits dels bancs són d'una data concreta. Cal un proveïdor d'estimacions (p. ex. pla de pagament de Finnhub, FMP o Refinitiv) o actualitzar-los editorialment.
4. **Legal.** Avís de "no és assessorament financer" (ja hi és), política de privacitat (les dades es queden al dispositiu: fàcil de redactar), i revisar si el teu model de negoci entra en la normativa de recomanacions d'inversió (CNMV / MiFID II): una eina d'informació i càlcul és diferent d'un servei de recomanacions personalitzades.
5. **Fiscalitat.** La calculadora aplica l'escala de l'estalvi espanyola de 2026; cal revisar-la cada any.

## Estructura

```
src/
  lib/fiscal.ts      motor de venda (IRPF, dipòsit, prima, avisos) + tests
  lib/stats.ts       volatilitat, rendiment, Puntuació Radar
  lib/providers.ts   CoinGecko, BCE, Finnhub
  lib/store.ts       estat, persistència local, actualització
  lib/ai.ts          Claude (es carrega només quan es fa servir)
  views/             Radar, fitxa del valor, Cartera, Notícies, Ajustos
  data/seed.json     instantània inicial del Radar
scripts/icons.mjs    genera les icones PNG des de l'SVG
```

Informació, no recomanació d'inversió.
