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

## Client allein (Vercel / Netlify / Pages)

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
ExecStart=/usr/bin/npx tsx server/index.ts
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
- Updates: `git pull && npm ci && npm run build && systemctl restart neon`. Ändert ein Update das Spielstandformat, migriert der Server die Welt beim Start.
