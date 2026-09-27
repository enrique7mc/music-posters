# Playlistd UX refresh

An orange-and-black visual refresh for the existing poster-to-playlist flow. The implementation retains the current authentication, providers, API routes, playlist rules, and draft persistence.

## Design changes

- A new landing page with a poster-to-playlist illustration and concise introduction.
- Clearer poster upload and manual-entry choices, with consistent workflow progress.
- Artist settings above the lineup. Custom tier counts use a full-width row, and per-artist counts stay beside each artist.
- Compact, expandable recommendations and an inline status while library matching runs.
- Playlist name and cover above song selection; immediate grid/list rendering without cascading track animations.
- Consistent loading panels, restrained fades, reduced-motion support, keyboard track selection, and visible focus states.

## Desktop previews

### Landing

![Landing page](landing-desktop.png)

### Upload

![Upload workspace](upload-desktop.png)

### Artist settings with custom tier counts

![Artist settings](artists-desktop.png)

### Track review

![Track review](tracks-desktop.png)

## Mobile previews

[Landing](landing-mobile.png) · [Upload](upload-mobile.png) · [Track review](tracks-mobile.png)

## Verification

- `npm run lint`: passes with three existing image optimization warnings for track artwork/cover images.
- `npm run typecheck`: passes.
- `npm run build`: passes; all pages and API routes compiled successfully.
- Focused page, component, and authentication tests: 84 passed across 8 files, including keyboard selection and draft persistence.
- Browser walkthrough at desktop and mobile widths, including 320px: poster upload, manual entry, customization, recommendations, count persistence, grid/list selection, playlist renaming, refresh restoration, and simulated playlist creation.
- Reduced-motion preference checked. No browser errors or framework overlays observed in the final walkthrough.

Screenshots and browser interaction use the existing development mocks. Live Apple Music authentication and real playlist writes were not exercised. Spotify's previously documented limitations remain.
