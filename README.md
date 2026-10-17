# QRquest

Générateur de QR codes en pixel art : chaque module du QR devient une tuile d'un décor de RPG 2D (forêt, donjon, toundra), avec autotiling pour que les murs se raccordent.

## Lancer

```bash
npm install
npm run dev      # serveur local (site + webservice sur /api/qr)
npm run build    # build de production dans dist/
npm test         # vérifie qu'au moins 99 % des QR rendus se décodent (jsQR)
npm run tiles    # régénère public/tiles.png
```

## Webservice

Le rendu des QR codes est fait côté serveur par un webservice : `api/qr.js`, déployé comme fonction Vercel. Le site l'utilise pour l'aperçu et le téléchargement, et il est ouvert à tous. On peut l'appeler depuis un autre site, un script ou une simple balise `<img>`.

- **URL** : `https://qrquest-rpg.vercel.app/api/qr`
- **En local** : `npm run dev` sert le même webservice sur `http://localhost:5173/api/qr`.

### Deux façons de l'appeler

| Méthode | Tileset utilisé | Corps de la requête |
| --- | --- | --- |
| `GET` | celui du site (`public/tiles.png`) | aucun |
| `POST` | le tien | le fichier PNG du tileset (4 Mo max) |

Dans les deux cas, les options passent dans l'URL (query string).

### Paramètres

| Paramètre | Si absent | Rôle |
| --- | --- | --- |
| `text` | **obligatoire** | contenu du QR code (1200 caractères max, UTF-8 : accents et emoji acceptés) |
| `world` | `0` (premier monde) | index du monde (`0`, `1`…) ou son nom, sans tenir compte de la casse (`Donjon`, `toundra`…) |
| `ecl` | `Q` | niveau de correction d'erreur : `L` (~7 %), `M` (~15 %), `Q` (~25 %), `H` (~30 %). Plus il est élevé, plus le QR est grand, et plus il peut accueillir de bâtiments |
| `seed` | `1` | graine du décor. Les mêmes paramètres donnent toujours la même image ; change la graine pour un autre agencement |
| `scale` | `1` | agrandissement entier, sans flou, de 1 à 8. Ramené automatiquement dans cette plage, et plafonné pour que l'image ne dépasse pas 4096 px |
| `names` | « Monde 1 », « Monde 2 »… | `POST` uniquement : noms des mondes du tileset envoyé, séparés par des virgules |

Les réglages de densité (décorations, habitants, bâtiments) ne sont pas des paramètres. La part de modules couverte par les bâtiments dépend seulement de `ecl` (voir [Fonctionnement](#fonctionnement)).

### Réponse

En cas de succès : code `200`, corps au format `image/png`, et ces en-têtes :

| En-tête | Contenu |
| --- | --- |
| `X-QR-Version` | version du QR code (1 à 40) |
| `X-QR-Modules` | nombre de modules par côté (21 pour la version 1, +4 par version) |
| `X-QR-World` | nom du monde utilisé, encodé pour une URL (`encodeURIComponent`) |
| `X-QR-Worlds` | nombre de mondes dans le tileset |

L'image fait `(modules + 4) × taille de tuile × scale` pixels de côté : le QR plus une marge de 2 modules de chaque côté. Avec le tileset par défaut (tuiles de 16 px), un QR de 33 modules à `scale=1` fait 592 px.

### Erreurs

En cas d'erreur, le corps est en JSON, `{ "error": "message en français" }` :

| Code | Cas |
| --- | --- |
| `400` | `text` manquant ou trop long, `ecl` invalide, monde inconnu, corps `POST` vide ou pas un PNG, texte trop long pour le niveau de correction |
| `405` | méthode autre que `GET`, `POST` ou `OPTIONS` |
| `413` | tileset de plus de 4 Mo (Vercel refuse lui-même les corps de plus de 4,5 Mo) |
| `422` | PNG lisible mais pas au format tileset, par exemple largeur incorrecte ou murs manquants (voir [Tileset](#tileset)) |
| `500` | erreur interne inattendue |

### Cache et CORS

- **Cache** : les réponses `GET` peuvent être mises en cache (1 h dans le navigateur, longtemps sur le CDN de Vercel), puisque les mêmes paramètres donnent la même image. Les réponses `POST` ne sont jamais mises en cache.
- **CORS** : ouvert à toutes les origines (`Access-Control-Allow-Origin: *`). Les en-têtes `X-QR-*` sont lisibles en JavaScript depuis n'importe quel site.

### Exemples

Dans une page HTML, avec le tileset par défaut :

```html
<img src="https://qrquest-rpg.vercel.app/api/qr?text=https%3A%2F%2Fexemple.fr&world=Toundra&scale=2"
     alt="QR code vers exemple.fr" style="image-rendering: pixelated">
```

En ligne de commande :

```bash
# tileset par défaut
curl -o qr.png "https://qrquest-rpg.vercel.app/api/qr?text=Bonjour&world=Donjon&ecl=H&scale=4"

# tileset personnel, avec les noms de ses mondes
curl -o qr.png --data-binary @mon-tileset.png -H "Content-Type: image/png" \
  "https://qrquest-rpg.vercel.app/api/qr?text=Bonjour&world=Volcan&names=Plage,Volcan"
```

En JavaScript, avec un tileset choisi par l'utilisateur :

```js
const params = new URLSearchParams({ text: "Bonjour", world: 0, ecl: "Q", scale: 4 });
const res = await fetch(`https://qrquest-rpg.vercel.app/api/qr?${params}`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: fileInput.files[0], // le PNG du tileset
});
if (!res.ok) throw new Error((await res.json()).error);
console.log("Version", res.headers.get("X-QR-Version"));
img.src = URL.createObjectURL(await res.blob());
```

### Limites

- **Texte** : 1200 caractères. La vraie limite est en octets UTF-8 : un accent compte pour 2 octets, un emoji pour 4. 1200 caractères sans accent tiennent même en `H`, mais en `H` un texte entièrement accentué ne dépasse pas environ 630 caractères. Au-delà, l'API renvoie une erreur 400 « Texte trop long pour ce niveau de correction ».
- **Tileset envoyé** : 4 Mo maximum.
- **Image** : 4096 px de côté au maximum. `scale` est réduit si besoin.
- **Lecture** : les bâtiments utilisent une partie de la correction d'erreur. Au test (jsQR), au moins 99 % des QR générés se lisent. Pour une lecture la plus sûre possible, préfère `ecl=H`.

## Fonctionnement

- `src/qrmap.js` (partagé par l'API et les outils) encode le texte (UTF-8) avec `qrcode-generator`, puis transforme la matrice en opérations de dessin : une tuile de sol sous chaque case, et pour chaque module sombre une tuile de mur choisie selon ses voisins (masque N=1, E=2, S=4, O=8 → 16 variantes).
- Les motifs de repérage (coins) et d'alignement utilisent une famille de tuiles « spéciale » (ruines, obsidienne, glace).
- Le sol varie aléatoirement (graine relançable) avec quelques décorations.
- Chaque monde a ses habitants : panneau, champignon, lapin, chouette… en forêt ; crâne, potion, clé, torche, bannière, toile d’araignée au donjon ; renard blanc, bonhomme de neige, luge, lanterne, écureuil, rouge-gorge en toundra. Ils sont placés au hasard sur des cases sûres : clairière (sol entouré de sol, loin des motifs de repérage), mur, ou façade de mur (rien en dessous). `npm run tiles` vérifie qu’aucun ne change la luminosité de sa case.
- Quelques bâtiments 2×2 ou 3×3 (taverne, grand chêne, puits, feu de camp ; crypte, autel, coffre, slime ; igloo, crevasse, trou de pêche, rocher) sont posés n’importe où, sans tenir compte des modules dessous : c’est la correction d’erreur qui compense. Ils évitent seulement ce que le décodeur lit hors correction (repérage + format, lignes de timing, alignement, version) et couvrent une part des modules qui progresse linéairement avec le niveau : 1,5 % en L, 3,5 % en M, 5,5 % en Q, 7,5 % en H (≥ 99 % de QR lus par jsQR à chaque niveau).

## Tileset

Le tileset se remplace sans toucher au code. Dans l'interface, **📂 Charger** utilise ton PNG (sélectionne aussi son `.json` pour nommer les mondes) le temps de la session, et **⬇ Modèle** télécharge le tileset par défaut comme point de départ. Le PNG est envoyé à l'API pour le rendu, et l'analyse (mondes, contraste) se fait aussi dans le navigateur pour l'interface. Pour changer le tileset du site, déposer un autre `public/tiles.png` (et éventuellement `public/tiles.json`). L'application lit l'image et en déduit tout le reste :

- **taille des tuiles** = largeur ÷ 16 (16 px, 32 px…) ;
- **nombre de mondes** = hauteur ÷ (13 × taille de tuile) — une bande de 13 rangées par monde ;
- **sols, habitants et bâtiments** : chaque case est un emplacement, utilisé seulement s'il n'est pas entièrement transparent. Chaque monde peut donc en avoir un nombre différent.

Organisation d'une bande (colonnes 0 à 15) :

| Rangées | Contenu |
| --- | --- |
| 0-3 | **murs (obligatoire)** : 16 emplacements de 2×2 tuiles, 8 par paire de rangées, index = masque des voisins (N=1, E=2, S=4, O=8). Le module est la tuile en haut à gauche de l'emplacement ; le reste reçoit ce qui déborde en bas et à droite (ombre portée semi-transparente) |
| 4-7 | murs « spéciaux » des carrés de repérage, même organisation (vide → murs normaux) |
| 8 | sol : colonnes 0-7 variantes simples (au moins une), 8-15 variantes décorées |
| 9 | habitants : colonnes 0-7 sur le sol, 8-11 sur un mur, 12-15 sur une façade de mur (rien en dessous) |
| 10-12 | bâtiments : emplacements 3×3 aux colonnes 0, 3 et 6 ; emplacements 2×2 aux colonnes 9, 11 et 13 (rangées 10-11) |

Noms des mondes (optionnel, sinon « Monde 1 », « Monde 2 »…) dans `public/tiles.json` :

```json
{ "worlds": ["Forêt", "Donjon", "Toundra"] }
```

**Rendu 2.5D** : tout le sol est dessiné d'abord, puis les murs ligne par ligne. Un mur déborde donc sur le sol voisin (ombre), et ce débordement est recouvert par tout mur situé à droite ou en dessous. Si l'ombre est la forme du mur décalée en bas à droite, deux ombres ne se superposent jamais. Dans le tileset par défaut, seuls les carrés de repérage et d'alignement sont des murs en relief : façade verticale quand rien n'est en dessous, et ombre portée. Les autres cases sombres sont des tuiles plates. Les bâtiments debout portent la même ombre que les murs, dessinée dans leur emplacement (la crevasse et le trou de pêche, à plat, n'en ont pas).

La transparence partielle (canal alpha) est prise en compte, par exemple pour un slime ou de la glace.

La couleur d'accent de l'interface est tirée de la couleur des murs de chaque monde.

Au chargement, l'app compare la luminosité moyenne des murs (cases sombres) et du sol simple (cases claires) de chaque monde, et avertit si l'écart est faible (< 140/255), insuffisant (< 100/255) ou inversé. Ces seuils viennent de mesures avec jsQR : ≥ 140 se lit de façon fiable, la lecture chute nettement en dessous.

Pour vérifier un tileset maison en ligne de commande : `node tools/scan-test.mjs chemin/vers/tiles.png` affiche ce qui a été détecté, le contraste et le taux de QR lus. Garder des murs sombres, un sol clair et des habitants qui respectent la luminosité de leur case : c'est ce contraste qui rend le QR scannable.

Le tileset par défaut est généré par `npm run tiles` (`tools/generate-tiles.mjs`) et placé dans le domaine public (CC0).

## Licence

Code sous licence MIT, tileset CC0.
