# PL-dåse – kabelregistrering

En lille webapp (PWA) til at registrere, hvilke kabler der kommer ind i en dansk PL-loftsdåse med 6 kabelindføringer. Appen kan installeres på telefonen, virker offline og synkroniserer med en server, så data kan bruges i andre programmer via en API.

- Flere dåser, som kan navngives og have et billede med markører
- Login med brugernavn og kodeord
- Offline-brug med automatisk synkronisering
- Eksport til CSV og JSON samt en API med token til andre programmer
- Kører som én Docker-container (Node.js, ingen eksterne pakker)

---

## Indhold

1. [Sådan bruges appen](#sådan-bruges-appen)
2. [Installation på serveren](#installation-på-serveren)
3. [Brugere og adgang](#brugere-og-adgang)
4. [API](#api)
5. [Opdatering og backup](#opdatering-og-backup)
6. [Sikkerhed](#sikkerhed)
7. [Fejlfinding](#fejlfinding)
8. [Projektstruktur](#projektstruktur)

---

## Sådan bruges appen

### Installér på telefonen

1. Åbn adressen (fx `https://pl.dit-domæne.dk`) i Chrome på Android.
2. Log ind.
3. Vælg **⋮ → Installér app**. Så får du et ikon på startskærmen, fuldskærm og offline-brug.

### Dåser

- Vælg dåse i rullemenuen øverst. **+ Ny** opretter en ny dåse.
- Giv dåsen et navn eller en placering i feltet **Navn / placering**, fx „Stue, loft ved vindue“.
- **Slet dåse** sletter den aktuelle dåse (også på serveren og på dine andre enheder).

### Sådan tæller du indføringerne

Dåsen er symmetrisk, så der er ikke noget på selve dåsen at orientere efter. Appen bruger i stedet din egen retning i rummet:

1. Stil dig under dåsen med ansigtet mod en bestemt retning, fx mod døren.
2. De tre indføringer **foran dig** er **1-3**, talt fra din venstre mod din højre.
3. De tre indføringer **bag dig** er **4-6**, også talt fra din venstre mod din højre.
4. Skriv retningen i feltet **Jeg står med ansigtet mod**, fx „Mod døren“. Den står også øverst i tegningen.

Tegningen er et kort set som i en navigationsapp: toppen er dér, hvor du kigger hen, og nederst står en lille figur med teksten „Du står her“. Venstre på skærmen er din venstre i virkeligheden.

Brug et pejlemærke, der er entydigt i rummet, fx „Mod døren“ frem for „Mod nord“. Står du næste gang med ansigtet mod samme sted, passer numrene.

### Registrér en indføring

Tryk på en indføring i tegningen eller på listen under den:

| Felt | Beskrivelse |
| --- | --- |
| Funktion | Forsyning, Lampe, Afbryder, Stikkontakt, Korrespondance, Videre til dåse eller Andet |
| Kabeltype | Hurtigvalg (fx NOMP 3G1,5) eller fri tekst |
| Note | Fri tekst, fx „til kontakt ved dør“ |

Funktionen giver indføringen en farve i tegningen. **Ryd** nulstiller indføringen.

### Billede og markører

1. Tag et billede med **📷 Tag billede** (åbner kameraet direkte) eller vælg fra galleriet med **🖼️ Galleri**.
2. Tryk på **📍 Markér**, vælg et nummer (1-6), og tryk på billedet, hvor indføringen sidder. Appen går automatisk videre til næste nummer uden markør. Tryk igen for at flytte en markør, eller brug **Fjern markør**.
3. Tryk **✓ Færdig**.

Markørerne har samme farve som funktionen. Uden for markér-tilstand åbner et tryk på en markør indføringen, og et tryk et andet sted på billedet viser det i stor størrelse.

Billedet skaleres ned til højst 1400 pixel på den længste side (JPEG, kvalitet 80 %), før det gemmes. Tager du et nyt billede, fjernes markørerne fra det gamle.

### Offline og synkronisering

- Alt gemmes først lokalt på telefonen (IndexedDB), så appen virker uden dækning.
- Ændringer sendes automatisk til serveren, når der er forbindelse. Statuslinjen øverst viser **✓ Synkroniseret** eller **Offline – ændringer sendes senere**.
- Alle dine enheder får de samme dåser. Hvis to enheder ændrer samme dåse, vinder den ændring, der når serveren sidst.
- **Log ud** sletter den lokale kopi på telefonen. Hvis der er usendte ændringer, bliver du spurgt først.

### Eksport fra appen

Nederst på siden:

- **⬇ Eksportér CSV** – semikolonsepareret, UTF-8, åbner direkte i dansk Excel
- **⬇ Eksportér JSON** – til programmer

Det kræver forbindelse til serveren. Se [API](#api) for formatet.

---

## Installation på serveren

Forudsætninger: en server med Docker, en reverse proxy med HTTPS (fx Nginx Proxy Manager) og et domæne.

### 1. Byg imaget på GitHub

1. Læg projektet i et GitHub-repo (roden skal indeholde `Dockerfile`, `server.js`, mappen `site` og mappen `.github`).
2. Push til branchen `main`. Workflowen `.github/workflows/docker.yml` bygger imaget og lægger det i GitHub Container Registry som `ghcr.io/<dit-brugernavn>/pl-daase:latest` (brugernavnet med små bogstaver).
3. Hvis pakken er privat, skal serveren kunne hente den. Enten gør du pakken offentlig under *Package settings → Change visibility*, eller du kører `docker login ghcr.io` med et Personal Access Token med `read:packages`. Koden indeholder ingen hemmeligheder, og dine data ligger kun i `./data` på serveren.

### 2. Start containeren

Opret en stak (fx i Dockge) eller en mappe med `docker-compose.yml`:

```yaml
services:
  pl-daase:
    image: ghcr.io/DIT-BRUGERNAVN/pl-daase:latest
    container_name: pl-daase
    restart: unless-stopped
    ports:
      - "8085:8080"
    volumes:
      - ./data:/data          # brugere, dåser og billeder ligger her
    environment:
      - SHARED=false          # true = alle brugere deler de samme dåser
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
```

Start med `docker compose up -d`. Lad mappen `data` blive oprettet af Docker. Opretter du den selv, kan containeren få problemer med skriverettigheder.

### 3. Reverse proxy og DNS

I Nginx Proxy Manager:

- **Proxy Host** med dit domæne, Scheme `http`, Forward Hostname/IP = serverens IP, Forward Port = `8085` (eller den port, du valgte).
- Under fanen **SSL**: bed om et Let's Encrypt-certifikat og slå **Force SSL** til.

I DNS (fx Cloudflare) skal domænet pege på dit netværk. HTTPS er et krav, for Chrome tilbyder kun installation af appen over HTTPS.

### Miljøvariabler

| Variabel | Standard | Beskrivelse |
| --- | --- | --- |
| `SHARED` | `false` | `true` får alle brugere til at dele de samme dåser. Ellers har hver bruger sine egne. |
| `PORT` | `8080` | Port inde i containeren |
| `DATA_DIR` | `/data` | Mappen til data |

---

## Brugere og adgang

Der findes ingen standardbruger. Du opretter brugere med en kommando inde i containeren, og de virker med det samme uden genstart. I Dockge åbner du terminalen med **Bash**-knappen ved containeren. Ellers kan du bruge `docker exec -it pl-daase ...`.

| Kommando | Beskrivelse |
| --- | --- |
| `node server.js adduser <navn>` | Opretter en bruger eller skifter kodeord. Du bliver bedt om et kodeord på mindst 10 tegn. |
| `node server.js deluser <navn>` | Sletter brugeren. Dåsedata bliver liggende i `data/boxes`. |
| `node server.js users` | Viser alle brugere |
| `node server.js token <navn>` | Opretter et API-token. Det vises kun én gang. |
| `node server.js notoken <navn>` | Fjerner brugerens API-token |

Brugernavnet er på 2-32 tegn og må indeholde små bogstaver, tal, punktum, understreg og bindestreg. Store bogstaver bliver lavet om til små.

Eksempel:

```
docker exec -it pl-daase node server.js adduser martin
```

- **Glemt kodeord:** Kør `adduser` igen med samme brugernavn. Det skifter kodeordet, og dåser og token beholdes.
- **Sessioner:** Login gælder 30 dage og forlænges automatisk, når du bruger appen.
- **Spærring:** Efter 6 forkerte forsøg for samme bruger fra samme IP, eller 15 fra samme IP, spærres login i 15 minutter.

---

## API

API'en bruges til at hente data ud til andre programmer. Den er read-only.

### Godkendelse

Brug et token (anbefalet til programmer):

```
Authorization: Bearer pl_dittoken
```

Opret tokenet med `node server.js token <navn>`. Tokenet giver kun læseadgang til den pågældende brugers dåser og fungerer som et kodeord, så det må ikke ligge i kode, der deles offentligt. Et nyt token afløser det gamle.

I en browser, hvor du er logget ind, virker adresserne også uden token (via login-cookien).

### Endpoints

| Metode og sti | Beskrivelse |
| --- | --- |
| `GET /api/export` | Alle dåser som JSON |
| `GET /api/export?format=csv` | Alle dåser som CSV |
| `GET /api/export?photos=1` | JSON med billederne som base64 inkluderet |
| `GET /api/export?download=1` | JSON som filoverførsel (`pl-daase.json`) |
| `GET /api/photo/<id>` | Billedet til en dåse som `image/jpeg` |

Adresserne `/api/login`, `/api/logout`, `/api/me` og `/api/sync` bruges kun af selve appen og er ikke en stabil API.

### JSON-format

```json
{
  "exported": "2026-11-12T07:34:12.360Z",
  "user": "martin",
  "layout": "Positionerne er målt, som man står under dåsen med ansigtet mod ref: 1-3 er indføringerne foran en (venstre mod højre), 4-6 er bag en (venstre mod højre). marker er placeringen på billedet som brøkdel af bredde (x, fra venstre) og højde (y, fra toppen), eller null.",
  "boxes": [
    {
      "id": "babc123",
      "name": "Stue",
      "ref": "Mod døren",
      "entries": [
        {
          "position": 1,
          "function": "Forsyning",
          "cable": "NOMP 3G1,5",
          "note": "fra tavle",
          "marker": { "x": 0.331, "y": 0.149 }
        },
        {
          "position": 2,
          "function": "",
          "cable": "",
          "note": "",
          "marker": null
        }
      ],
      "photo_url": "https://pl.dit-domæne.dk/api/photo/babc123"
    }
  ]
}
```

| Felt | Beskrivelse |
| --- | --- |
| `id` | Dåsens id (stabilt) |
| `name` | Navn eller placering |
| `ref` | Hvad man står med ansigtet mod, når man tæller (se [Sådan tæller du indføringerne](#sådan-tæller-du-indføringerne)) |
| `entries` | Altid 6 indføringer med `position` fra 1 til 6 |
| `function` | Funktion, fx `Forsyning`, `Lampe`, `Afbryder`, `Stikkontakt`, `Korrespondance`, `Videre til dåse`, `Andet`. Tom, hvis indføringen ikke er registreret. |
| `cable` | Kabeltype som tekst |
| `note` | Fri tekst |
| `marker` | Placering på billedet som brøkdel af bredde (`x`, fra venstre) og højde (`y`, fra toppen), eller `null` |
| `photo_url` | Adresse til billedet (kræver samme godkendelse), eller `null` uden billede. Med `?photos=1` følger billedet med i feltet `photo` som `data:image/jpeg;base64,...`. |

Slettede dåser er ikke med. Dåserne er sorteret alfabetisk på navn.

### CSV-format

- Semikolon som skilletegn, UTF-8 med BOM, linjeskift `\r\n`
- Én række pr. **udfyldt** indføring (tomme indføringer er ikke med)
- Kolonner: `daase;op_mod;position;funktion;kabel;note;foto_x;foto_y`

```
daase;op_mod;position;funktion;kabel;note;foto_x;foto_y
Stue;Mod døren;1;Lampe;NOMP 3G1,5;;0.33;0.15
Stue;Mod døren;2;Forsyning;NOMP 3G1,5;;;
```

### Fejlkoder

| Kode | Betydning |
| --- | --- |
| `401` | Manglende eller ugyldigt token, eller ikke logget ind |
| `404` | Dåsen eller billedet findes ikke |
| `429` | For mange forkerte forsøg. Vent 15 minutter. |

### Eksempler

**curl**

```bash
# JSON
curl -H "Authorization: Bearer pl_dittoken" https://pl.dit-domæne.dk/api/export

# CSV gemt som fil
curl -H "Authorization: Bearer pl_dittoken" \
  "https://pl.dit-domæne.dk/api/export?format=csv" -o pl-daase.csv

# Ét billede
curl -H "Authorization: Bearer pl_dittoken" \
  https://pl.dit-domæne.dk/api/photo/babc123 -o stue.jpg
```

**Python**

```python
import requests

BASE = "https://pl.dit-domæne.dk"
HEADERS = {"Authorization": "Bearer pl_dittoken"}

data = requests.get(f"{BASE}/api/export", headers=HEADERS, timeout=30).json()

for box in data["boxes"]:
    print(box["name"], "(", box["ref"], ")")
    for e in box["entries"]:
        if e["function"] or e["cable"]:
            print(f'  {e["position"]}: {e["function"]} {e["cable"]} {e["note"]}')

    if box["photo_url"]:
        img = requests.get(box["photo_url"], headers=HEADERS, timeout=30)
        open(f'{box["id"]}.jpg', "wb").write(img.content)
```

**JavaScript (Node 18+)**

```js
const res = await fetch("https://pl.dit-domæne.dk/api/export", {
  headers: { Authorization: "Bearer pl_dittoken" },
});
const { boxes } = await res.json();
console.log(boxes.map(b => `${b.name}: ${b.entries.filter(e => e.function).length} indføringer`));
```

### Direkte adgang til filerne

Alt ligger også som almindelige filer i mappen `data` ved siden af `docker-compose.yml`:

| Fil | Indhold |
| --- | --- |
| `data/boxes/<bruger>.json` | Dåser, kabler, markører og billeder (som base64) |
| `data/users.json` | Brugere (kodeord og token som hash) |
| `data/secret` | Nøgle til login-cookies |

Fra et andet program er API'en det pæneste valg, da billederne ligger som base64 i JSON-filen.

---

## Opdatering og backup

### Opdatering

1. Ret koden, og push til `main`.
2. Vent på, at **Actions** i GitHub viser et grønt flueben (cirka et minut).
3. Klik **Opdater** i Dockge, eller kør `docker compose pull && docker compose up -d`.
4. Åbn appen på telefonen. Den henter den nye version i baggrunden, så du kan skulle åbne den to gange, før ændringen vises.

Dine brugere og data ligger i `./data` og påvirkes ikke af opdateringer. Hver build bliver også mærket med sit commit-hash. Skal du tilbage til en tidligere version, skriver du `ghcr.io/<bruger>/pl-daase:<commit-hash>` i stedet for `:latest`.

For at slippe for at klikke kan du tilføje [Watchtower](https://containrrr.dev/watchtower/), som automatisk henter nye images.

### Backup

Kopiér mappen `data`. Det er det eneste, der skal tages backup af. Gendan ved at lægge den tilbage, før containeren startes.

---

## Sikkerhed

- Selve appens skal (HTML og ikoner) er åben uden login, men viser kun en loginskærm. Alle data kræver login eller token.
- Kodeord gemmes som scrypt-hash. Sessionen er en signeret cookie med `HttpOnly` og `SameSite=Strict`, og `Secure` sættes automatisk bag HTTPS.
- Loginforsøg begrænses (se [Brugere og adgang](#brugere-og-adgang)). Serveren bruger IP-headerne fra reverse proxy'en (`CF-Connecting-IP`, `X-Real-IP`, `X-Forwarded-For`), så hold containerens port intern og lad kun proxy'en nå den.
- API-tokenet giver kun læseadgang og kan fjernes med `notoken`.
- Containeren kører med `read_only`, uden Linux-capabilities og med `no-new-privileges`.
- Serveren sætter sikkerhedsheadere, bl.a. `Content-Security-Policy` og `X-Frame-Options`.

---

## Fejlfinding

| Problem | Løsning |
| --- | --- |
| Loginskærmen siger „For mange forsøg“ | Vent 15 minutter, eller genstart containeren. |
| Glemt kodeord | `node server.js adduser <navn>` med samme navn. |
| Appen viser ikke den nye version | Luk appen helt og åbn den igen. Tjek, at Actions-kørslen er grøn, og at du har klikket **Opdater**. |
| Opdater henter ikke noget nyt | Er pakken privat, skal serveren være logget ind på `ghcr.io`. Gør evt. pakken offentlig. |
| Fejl om skriverettigheder til `/data` | Slet den manuelt oprettede `data`-mappe, og lad Docker oprette den. Eller giv containerens bruger skriveadgang. |
| „Offline – ændringer sendes senere“ | Ændringerne ligger sikkert på telefonen og sendes automatisk, når der er forbindelse. |
| Kan ikke installere appen | Tjek, at siden åbnes over HTTPS med et gyldigt certifikat. |
| Data fra en gammel version mangler | Version 1 gemte i browserens localStorage. Ved første åbning af ny version flyttes data automatisk til IndexedDB. Data fra et andet domæne (fx et gammelt artifact-link) følger ikke med, så brug „Kopiér som tekst“ der. |

### Begrænsninger

- Højst 200 ændrede dåser pr. synkronisering og cirka 12 MB pr. forespørgsel. Større mængder sendes automatisk i flere omgange.
- Billeder må højst være cirka 1,5 MB efter nedskalering.
- Eksport og API kræver, at serveren kan nås.

---

## Projektstruktur

```
.
├── Dockerfile                 # node:22-alpine, kører server.js
├── docker-compose.yml         # eksempel på opsætning
├── server.js                  # server, login, synk og API (ingen eksterne pakker)
├── site/
│   ├── index.html             # hele appen (HTML, CSS og JS)
│   ├── sw.js                  # service worker til offline-brug
│   ├── manifest.webmanifest   # PWA-manifest
│   ├── icon-192.png
│   └── icon-512.png
└── .github/workflows/
    └── docker.yml             # bygger og udgiver imaget til ghcr.io
```

Når du ændrer filerne i `site/`, så hæv versionsnummeret i `sw.js` (fx `pl-daase-v8` til `pl-daase-v9`), så telefonerne hurtigere henter den nye version.
