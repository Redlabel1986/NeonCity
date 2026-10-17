# Deployment

Neon Dynasty besteht aus zwei Teilen:

| Teil | Was es braucht | Wo es läuft |
|---|---|---|
| **Client** (`dist/` nach `npm run build`) | nur statische Dateien | jeder statische Host: Vercel, Netlify, GitHub Pages, Cloudflare Pages, ein Webspace |
| **Online-Welt** (`npm run server`) | einen **dauerhaft laufenden Node-Prozess** mit WebSockets und einer beschreibbaren Platte für `data/world.json` und `data/accounts.json` | ein VPS/Root-Server (z. B. netcup), ein Container-Host mit persistentem Volume |

Der Einzelspieler-Modus läuft komplett im Browser (Spielstände in IndexedDB) und braucht keinen Server.

## Was wohin passt

- **Vercel, Netlify, GitHub Pages, Cloudflare Pages:** gut für den Client. Die Online-Welt läuft dort **nicht**: Serverless-Funktionen leben nur Sekunden, halten keinen Zustand im Speicher, haben kein beschreibbares Dateisystem und keine dauerhaften WebSocket-Verbindungen. Die Welt würde bei jeder Anfrage neu erzeugt und die Uhr stünde still.
- **Kostenlose Container-Hoster (Render Free, Railway-Testguthaben, Fly.io-Freikontingent):** technisch möglich, aber die Gratis-Instanzen schlafen nach Inaktivität ein (die Spielzeit steht dann still) und haben ohne Zusatzkosten keine persistente Platte. Für eine Welt, die rund um die Uhr weiterlaufen soll, ungeeignet.
- **Oracle Cloud „Always Free“ (ARM-VM):** dauerhaft kostenlos und ausreichend, aber die Einrichtung entspricht einem VPS (siehe unten) und die Verfügbarkeit der Gratis-VMs schwankt.
- **netcup VPS/Root-Server (ab der kleinsten Stufe):** die einfachste Lösung für die Online-Welt. Ein Prozess, eine Platte, eine Domain. Der Server liefert `dist/` gleich mit aus, also reicht **ein** Host für alles.

Empfehlung: Online-Welt auf einem netcup-VPS, der auch den Client ausliefert. Wer nur den Einzelspieler-Modus veröffentlichen will, nimmt Vercel oder GitHub Pages.

## Von GitHub auf netcup Webhosting 4000, Schritt für Schritt

Drei Wege, vom einfachsten zum automatischen. In allen Fällen landet der Client (Inhalt von `dist/`) im Ordner `httpdocs/` der Domain.

### Weg 1: lokal bauen, hochladen (5 Minuten)

```bash
git clone https://github.com/Redlabel1986/NeonCity.git
cd NeonCity
npm ci
npm run build            # erzeugt dist/
```

Dann in Plesk „Websites & Domains → Dateimanager“ (oder per SFTP mit WinSCP/FileZilla, Zugangsdaten unter „FTP-Zugang“) den **Inhalt** von `dist/` nach `httpdocs/` kopieren, alte Dateien vorher löschen. Aufruf der Domain im Browser, fertig. Bei jeder neuen Version: `git pull`, `npm run build`, erneut hochladen.

### Weg 2: Plesk zieht selbst aus GitHub

1. Plesk → Websites & Domains → **Git** → „Repository hinzufügen“, URL `https://github.com/Redlabel1986/NeonCity.git`, Branch `main`, Bereitstellungspfad z. B. `/neon` (nicht `httpdocs`, das Repository enthält kein fertiges `dist/`).
2. Unter „Bereitstellungsaktionen“ eintragen (Node liegt bei Plesk unter `/opt/plesk/node/<Version>/bin`, die Version steht unter „Node.js“):

   ```bash
   export PATH=/opt/plesk/node/22/bin:$PATH
   npm ci && npm run build
   rm -rf ../httpdocs/* && cp -r dist/. ../httpdocs/
   ```

3. „Jetzt bereitstellen“ klicken; danach bei jedem Push auf `main` über den Webhook (Plesk zeigt die Adresse an, in GitHub unter Settings → Webhooks eintragen).

Falls `npm` auf dem Webspace nicht ausführbar ist (abhängig vom Tarif), bleibt Weg 1 oder 3.

### Weg 3: GitHub baut und lädt hoch (empfohlen)

Die Action `.github/workflows/deploy-webspace.yml` baut den Client bei jedem Push und lädt `dist/` per FTPS nach `httpdocs/`. Einmalig in GitHub unter Settings → Secrets and variables → Actions anlegen:

| Name | Wert |
|---|---|
| `FTP_SERVER` (Secret) | FTP-Host aus Plesk „FTP-Zugang“, z. B. `hosting123456.a2f4b.netcup.net` |
| `FTP_USERNAME` (Secret) | FTP-Benutzer |
| `FTP_PASSWORD` (Secret) | FTP-Passwort |
| `ONLINE_SERVER` (Variable, optional) | Adresse der Online-Welt, z. B. `https://spiel.example.de` |

Danach genügt `git push`; der Lauf ist unter „Actions“ sichtbar, bei Bedarf auch von Hand über „Run workflow“.

## netcup Webhosting 4000 (Plesk)

Webhosting 4000 ist ein Shared-Hosting-Paket mit Plesk, kein eigener Server. Was dort geht:

- **Einzelspieler-Version:** `npm run build` lokal ausführen und den Inhalt von `dist/` per Plesk-Dateimanager oder SFTP nach `httpdocs/` hochladen. Fertig; keine weiteren Einstellungen nötig.
- **Client auf dem Webspace, Online-Welt woanders:** vor dem Build `VITE_ONLINE_SERVER=https://spiel.example.de` setzen, dann trägt das Hauptmenü diese Server-Adresse vor. Der Server lässt Anfragen von fremden Ursprüngen zu.
- **Online-Welt direkt auf Webhosting 4000:** nur mit Einschränkungen. Plesk startet Node-Anwendungen über Phusion Passenger erst bei einer Anfrage und beendet sie nach einer Leerlaufzeit wieder; die Weltuhr steht dann still, bis jemand die Seite öffnet (die Welt lädt aus dem Autospeicher, es gehen höchstens 30 Sekunden verloren). WebSockets funktionieren unter Plesk nur im reinen nginx-Modus ohne Proxy-Modus, was im Shared Hosting meist nicht einstellbar ist. Wer es versuchen will: `npm run build && npm run build:server` lokal, das Projekt mit `dist/`, `dist-server/` und `package.json` hochladen, in Plesk unter „Node.js“ als Anwendungsstamm das Projektverzeichnis und als Startdatei `dist-server/index.js` eintragen, Umgebungsvariable `NEON_DATA` auf ein beschreibbares Verzeichnis (z. B. `/var/www/vhosts/…/neon-data`) setzen; den Port vergibt Passenger über `PORT`. Ein Cron-Job, der jede Minute `/api/status` aufruft, hält die Anwendung meist am Leben. Für eine Welt, die wirklich rund um die Uhr läuft, ist ein kleiner netcup-VPS (siehe unten) die verlässliche Lösung; Client und Server passen zusammen auf die kleinste Stufe.

## Cloud-Spielstände (Handy ↔ PC)

Die Einzelspieler-Version speichert im Browser. Damit ein Spiel vom Handy am PC weitergeht, gibt es den Cloud-Spielstand pro Konto. Er braucht einen der beiden Endpunkte:

- **Vercel:** die Funktion `api/cloud/[action].js` wird mit dem Projekt ausgeliefert. Sie ist ein esbuild-Bündel aus `server/vercelCloud.ts` (`npm run build:api`, läuft bei `npm run build` mit) und wird eingecheckt, weil Vercel die Funktionen aus dem Quellbaum nimmt; als ESM ohne relative Imports läuft sie sicher unter Node (extensionslose Imports in ESM-Funktionen führten zu `FUNCTION_INVOCATION_FAILED`). Nach Änderungen an `server/cloud.ts`, `server/blobStore.ts` oder `server/vercelCloud.ts` also `npm run build` ausführen und das Bündel mit committen. Einrichtung: im Vercel-Projekt unter **Storage → Create Database → Blob** einen Store anlegen und dabei **Private** wählen (die Zugriffsart lässt sich später nicht ändern), den Store mit dem Projekt verbinden (setzt `BLOB_READ_WRITE_TOKEN`), unter **Settings → Environment Variables** `CLOUD_SECRET` mit einer langen Zufallszeichenfolge (mindestens 16 Zeichen, z. B. `openssl rand -hex 32`) anlegen und einmal neu deployen. Ohne diese beiden Variablen antwortet `/api/cloud/*` mit einem Hinweis, und das Spiel zeigt die Meldung im Cloud-Bereich. Ein als **Public** angelegter Store funktioniert ebenfalls: Die Funktion erkennt die Zugriffsart beim ersten Aufruf automatisch (oder fest per `BLOB_ACCESS=public`); die Dateinamen sind dann zwar nicht erratbar (HMAC-Schlüssel und Zufalls-IDs), aber wer eine URL kennt, kann sie lesen, daher ist Private vorzuziehen. Jeder Fehler der Funktion kommt als JSON mit Meldung zurück (`Cloud-Server-Fehler: …`) und steht im Vercel-Log unter **Logs**.
- Endpunkte: `register`, `login`, `meta`, `save` (GET/PUT/DELETE), `account` (GET/DELETE), `password` (POST). Eine Passwortänderung meldet alle anderen Geräte ab.
- **Node-Spielserver:** stellt dieselben Endpunkte bereit, Daten unter `data/cloud/`, Secret in `data/cloud-secret.txt` (oder `CLOUD_SECRET`). Ein Client auf einem anderen Host nutzt ihn über `VITE_ONLINE_SERVER`.

Gespeichert wird genau ein Spielstand je Konto (der zuletzt hochgeladene). Passwörter liegen nur als salted scrypt-Hashes vor, Konten unter einem Schlüssel-Hash ohne Namensliste.

## Client allein (Vercel / Netlify / Pages)

### Vercel in drei Schritten

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden, „Add New → Project“, das Repository `Redlabel1986/NeonCity` importieren.
2. Die Einstellungen kommen aus `vercel.json` (Framework Vite, `npm run build`, Ausgabe `dist`); nichts ändern, auf „Deploy“ klicken. Der erste Build dauert etwa eine Minute.
3. Fertig: Die Einzelspieler-Version läuft unter `https://<projekt>.vercel.app`, jeder Push auf `main` erzeugt automatisch eine neue Version, andere Branches bekommen Vorschau-Adressen.

Optional: unter Project → Settings → Environment Variables `VITE_ONLINE_SERVER` auf die Adresse einer Online-Welt setzen, sobald es eine gibt. Ohne Server zeigt das Hauptmenü unter „Online spielen“ nur „Kein Server erreichbar“.

```bash
npm ci
npm run build          # erzeugt dist/
```

Build-Befehl `npm run build`, Ausgabeordner `dist`, keine Umgebungsvariablen nötig. Der Online-Bereich im Hauptmenü bleibt sichtbar und meldet „Kein Server erreichbar“, solange keine Server-Adresse eingetragen ist; die Spieler können dort die Adresse eines separat betriebenen Servers eintragen (der Server erlaubt Anfragen von fremden Ursprüngen).

## Online-Welt auf einem VPS (netcup, Hetzner, Oracle …)

Voraussetzungen: Debian/Ubuntu, Node 22 oder neuer, eine Domain, Port 80/443 offen.

```bash
# 1. Code holen und bauen
git clone https://github.com/Redlabel1986/NeonCity.git /opt/neon
cd /opt/neon
npm ci
npm run build

# 2. Probelauf (liefert dist/ und die API auf Port 8787)
PORT=8787 NEON_DATA=/var/lib/neon npm run server
```

Ohne TypeScript-Laufzeit auf dem Server: `npm run build:server` erzeugt `dist-server/index.js` (ein einzelnes Bundle), das mit `node dist-server/index.js` läuft; `NEON_STATIC` zeigt bei Bedarf auf ein anderes `dist/`.

Umgebungsvariablen des Servers:

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | 8787 | HTTP- und WebSocket-Port |
| `NEON_DATA` | `data` | Verzeichnis für `world.json` und `accounts.json` (Autospeicher alle `NEON_AUTOSAVE` Sekunden und beim Beenden) |
| `NEON_SEED` | `nova-eclipse-online` | Seed der Stadt (nur beim ersten Start relevant) |
| `NEON_CITY_SIZE` | 96 | Kantenlänge der Stadt |
| `NEON_SPEED` | 1 | Weltgeschwindigkeit (1 = zwei Spielminuten je Sekunde, ein Spieltag dauert zwölf Minuten) |
| `NEON_DIFFICULTY` | `standard` | Schwierigkeitsgrad für alle Konten |
| `NEON_AUTOSAVE` | 30 | Sekunden zwischen Autospeicherungen |

### Als Dienst (systemd)

`/etc/systemd/system/neon.service`:

```ini
[Unit]
Description=Neon Dynasty Online-Welt
After=network.target

[Service]
WorkingDirectory=/opt/neon
Environment=PORT=8787
Environment=NEON_DATA=/var/lib/neon
ExecStart=/usr/bin/node dist-server/index.js
Restart=always
RestartSec=3
User=neon

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin neon
sudo mkdir -p /var/lib/neon && sudo chown neon:neon /var/lib/neon
sudo systemctl enable --now neon
```

Ein Stopp (`systemctl stop neon`) speichert die Welt vorher; `/var/lib/neon/world.json` ist der komplette Spielstand und lässt sich sichern oder in die Einzelspieler-Version importieren.

### TLS und Domain (Caddy)

`/etc/caddy/Caddyfile`:

```
spiel.example.de {
    reverse_proxy localhost:8787
}
```

Caddy besorgt das Zertifikat selbst und leitet WebSockets (`/ws`) durch. Mit nginx braucht der `location /ws`-Block die Header `Upgrade` und `Connection`.

### Docker

```bash
docker build -t neon-dynasty .
docker run -d --name neon -p 8787:8787 -v neon-data:/data -e NEON_DATA=/data neon-dynasty
```

## Betrieb

- Die Welt läuft weiter, auch wenn niemand verbunden ist. Wer die Uhr anhalten will, stoppt den Dienst (die Welt wird gespeichert).
- `GET /api/status` zeigt Spieltag, Spielerzahl und Verbundene; für Monitoring geeignet.
- Backups: `world.json` und `accounts.json` kopieren. Passwörter liegen nur als salted scrypt-Hashes vor.
- Updates: `git pull && npm ci && npm run build && npm run build:server && systemctl restart neon`. Ändert ein Update das Spielstandformat, migriert der Server die Welt beim Start.
