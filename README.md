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
- Chaque monde a ses habitants (ligne 3 du tileset) : panneau, champignon, lapin, chouette… en forêt ; crâne, potion, clé, torche, bannière, toile d’araignée au donjon ; renard blanc, bonhomme de neige, luge, lanterne, écureuil, rouge-gorge en toundra. Ils sont placés au hasard sur des cases sûres : clairière (sol entouré de sol, loin des motifs de repérage), mur, ou façade de mur (rien en dessous). `npm run tiles` vérifie qu’aucun ne change la luminosité de sa case.
- Quelques bâtiments 2×2 ou 3×3 (taverne, grand chêne, puits, feu de camp ; crypte, autel, coffre, slime ; igloo, crevasse, trou de pêche, rocher) sont posés n’importe où, sans tenir compte des modules dessous : c’est la correction d’erreur qui compense. Ils évitent seulement ce que le décodeur lit hors correction (repérage + format, lignes de timing, alignement, version) et respectent un budget de modules par niveau (aucun en L). En moyenne ils couvrent ~3,7 % des modules en M, ~5,5 % en Q et ~4,9 % en H, pour ~99,5 % de QR lus par jsQR en M et 100 % en Q/H.

## Tileset

`public/tiles.png` est généré par `tools/generate-tiles.mjs` et placé dans le domaine public (CC0). Pour un tileset maison, respecter le format décrit dans `src/tileset.js` :

| Ligne (par thème) | Contenu |
| --- | --- |
| 0 | 16 tuiles de mur, index = masque des voisins |
| 1 | 16 tuiles « spéciales » (motifs de repérage), même masque |
| 2 | sol : 4 variantes simples puis 4 décorées |
| 3 | habitants, dans l’ordre de `props` du thème |
| 4-6 | bâtiments 2×2 / 3×3, de gauche à droite dans l’ordre de `landmarks` |

Tuiles de 16×16 px. Les coins arrondis sont transparents pour laisser voir le sol. Garder des murs sombres et un sol clair : c'est ce contraste qui rend le QR scannable.

## Licence

Code sous licence MIT, tileset CC0.
