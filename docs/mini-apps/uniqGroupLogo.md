# UniqGroup Logo (`uniqGroupLogo`)

Assigned staff and super admins. One route, `/uniqgroup-logo`. It does not use `PageShell`. The page adds the `ug-fullscreen` class on `documentElement` and the only chrome is a Back link to `/dashboard`.

## Screens

`src/uniqgroup/UniqGroupLogoApp.tsx` draws one full-screen scene: the UniqEnergy mark in the centre (about 70% of its original size), with UniqEnergy, Uniquem, Kemko, and Alchem on a tilted ring. Drag turns the view. Clicking a logo opens that company's site. A caption and a text nav list the same four links. Reduced motion holds a still frame. If WebGL is missing, the page shows the centre mark as an image. A faint starfield sits behind the scene on desktop; it is hidden on phones, tablets, and narrow windows because the points look like grain.

There is no Firestore collection and no Storage path.

## Code

- `src/uniqgroup/UniqGroupLogoApp.tsx` — page, still frame, caption, links.
- `src/uniqgroup/groupScene.ts` — Three.js scene (`createGroupScene`). Centre artwork is `/brand/uniqenergy-logo-dark-text.png`, cropped to the globe. Orbit logos and sites:

  | id | name | file | site |
  | --- | --- | --- | --- |
  | alchem | Alchem Energy Services | `/brand/group/alchem.png` | https://alchem.ca/ |
  | uniquem | Uniquem | `/brand/group/uniquem-orbit.png` | https://uniquem.ca/ |
  | uniqenergy | UniqEnergy | `/brand/group/uniqenergy.png` | https://uniqenergy.com/ |
  | kemko | Kemko | `/brand/group/kemko.png` | https://www.kemko.ca/ |

- `src/uniqgroup/uniqgroup.css`

No Cloud Function. The route is lazy-loaded from `src/App.tsx`.

## Connections

Brand files under `public/brand/` are the same family the portal bar uses (`/brand/uniqenergy-mark-64.png`). Do not redraw or recolour those files unless the request asks. The tile is registered in `functions/miniApps.js` (`Orbit` icon). Nothing else reads this scene.
