# QRquest

Générateur de QR codes en pixel art : chaque module du QR devient une tuile d'un décor de RPG 2D (forêt, donjon, toundra), avec autotiling pour que les murs se raccordent.

## Lancer

```bash
npm install
npm run dev      # serveur local
npm run build    # build de production dans dist/
npm test         # vérifie qu'au moins 99 % des QR rendus se décodent (jsQR)
npm run tiles    # régénère public/tiles.png
```

## Fonctionnement

- `src/qrmap.js` encode le texte (UTF-8) avec `qrcode-generator`, puis transforme la matrice en opérations de dessin : une tuile de sol sous chaque case, et pour chaque module sombre une tuile de mur choisie selon ses voisins (masque N=1, E=2, S=4, O=8 → 16 variantes).
- Les motifs de repérage (coins) et d'alignement utilisent une famille de tuiles « spéciale » (ruines, obsidienne, glace).
- Le sol varie aléatoirement (graine relançable) avec quelques décorations.
- Chaque monde a ses habitants : panneau, champignon, lapin, chouette… en forêt ; crâne, potion, clé, torche, bannière, toile d’araignée au donjon ; renard blanc, bonhomme de neige, luge, lanterne, écureuil, rouge-gorge en toundra. Ils sont placés au hasard sur des cases sûres : clairière (sol entouré de sol, loin des motifs de repérage), mur, ou façade de mur (rien en dessous). `npm run tiles` vérifie qu’aucun ne change la luminosité de sa case.
- Quelques bâtiments 2×2 ou 3×3 (taverne, grand chêne, puits, feu de camp ; crypte, autel, coffre, slime ; igloo, crevasse, trou de pêche, rocher) sont posés n’importe où, sans tenir compte des modules dessous : c’est la correction d’erreur qui compense. Ils évitent seulement ce que le décodeur lit hors correction (repérage + format, lignes de timing, alignement, version) et couvrent une part des modules qui progresse linéairement avec le niveau : 1,5 % en L, 3,5 % en M, 5,5 % en Q, 7,5 % en H (≥ 99 % de QR lus par jsQR à chaque niveau).

## Tileset

Le tileset se remplace sans toucher au code. Dans l'interface, **📂 Charger** utilise ton PNG (sélectionne aussi son `.json` pour nommer les mondes) le temps de la session, et **⬇ Modèle** télécharge le tileset par défaut comme point de départ. Pour changer le tileset du site, déposer un autre `public/tiles.png` (et éventuellement `public/tiles.json`). L'application lit l'image et en déduit tout le reste :

- **taille des tuiles** = largeur ÷ 16 (16 px, 32 px…) ;
- **nombre de mondes** = hauteur ÷ (7 × taille de tuile) — une bande de 7 rangées par monde ;
- **sols, habitants et bâtiments** : chaque case est un emplacement, utilisé seulement s'il n'est pas entièrement transparent. Chaque monde peut donc en avoir un nombre différent.

Organisation d'une bande (colonnes 0 à 15) :

| Rangée | Contenu |
| --- | --- |
| 0 | **murs (obligatoire)** : 16 tuiles, colonne = masque des voisins (N=1, E=2, S=4, O=8) |
| 1 | murs « spéciaux » des carrés de repérage, mêmes masques (rangée vide → murs normaux) |
| 2 | sol : colonnes 0-7 variantes simples (au moins une), 8-15 variantes décorées |
| 3 | habitants : colonnes 0-7 sur le sol, 8-11 sur un mur, 12-15 sur une façade de mur (rien en dessous) |
| 4-6 | bâtiments : emplacements 3×3 aux colonnes 0, 3 et 6 ; emplacements 2×2 aux colonnes 9, 11 et 13 (rangées 4-5) |

Noms des mondes (optionnel, sinon « Monde 1 », « Monde 2 »…) dans `public/tiles.json` :

```json
{ "worlds": ["Forêt", "Donjon", "Toundra"] }
```

La transparence partielle (canal alpha) est prise en compte, par exemple pour un slime ou de la glace.

La couleur d'accent de l'interface est tirée de la couleur des murs de chaque monde.

Au chargement, l'app compare la luminosité moyenne des murs (cases sombres) et du sol simple (cases claires) de chaque monde, et avertit si l'écart est faible (< 140/255), insuffisant (< 100/255) ou inversé. Ces seuils viennent de mesures avec jsQR : ≥ 140 se lit de façon fiable, la lecture chute nettement en dessous.

Pour vérifier un tileset maison en ligne de commande : `node tools/scan-test.mjs chemin/vers/tiles.png` affiche ce qui a été détecté, le contraste et le taux de QR lus. Garder des murs sombres, un sol clair et des habitants qui respectent la luminosité de leur case : c'est ce contraste qui rend le QR scannable.

Le tileset par défaut est généré par `npm run tiles` (`tools/generate-tiles.mjs`) et placé dans le domaine public (CC0).

## Licence

Code sous licence MIT, tileset CC0.
