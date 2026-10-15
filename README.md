# QRquest

Générateur de QR codes en pixel art : chaque module du QR devient une tuile d'un décor de RPG 2D (forêt, donjon, toundra), avec autotiling pour que les murs se raccordent.

## Lancer

```bash
npm install
npm run dev      # serveur local
npm run build    # build de production dans dist/
npm test         # vérifie que les QR rendus se décodent (jsQR)
npm run tiles    # régénère public/tiles.png
```

## Fonctionnement

- `src/qrmap.js` encode le texte (UTF-8) avec `qrcode-generator`, puis transforme la matrice en opérations de dessin : une tuile de sol sous chaque case, et pour chaque module sombre une tuile de mur choisie selon ses voisins (masque N=1, E=2, S=4, O=8 → 16 variantes).
- Les motifs de repérage (coins) et d'alignement utilisent une famille de tuiles « spéciale » (ruines, obsidienne, glace).
- Le sol varie aléatoirement (graine relançable) avec quelques décorations.

## Tileset

`public/tiles.png` est généré par `tools/generate-tiles.mjs` et placé dans le domaine public (CC0). Pour un tileset maison, respecter le format décrit dans `src/tileset.js` :

| Ligne (par thème) | Contenu |
| --- | --- |
| 0 | 16 tuiles de mur, index = masque des voisins |
| 1 | 16 tuiles « spéciales » (motifs de repérage), même masque |
| 2 | sol : 4 variantes simples puis 4 décorées |

Tuiles de 16×16 px. Les coins arrondis sont transparents pour laisser voir le sol. Garder des murs sombres et un sol clair : c'est ce contraste qui rend le QR scannable.

## Licence

Code sous licence MIT, tileset CC0.
