# Zord Exact Original Logo Assets

This package keeps the original tilted Zord mark geometry from the uploaded Canva image, but converts it into clean vector assets for frontend use.

## Files

- `zord-mark-exact-currentColor.svg` — best for React/Next.js; color controlled by CSS `color`.
- `zord-mark-exact-black.svg` — black mark for light backgrounds.
- `zord-mark-exact-white.svg` — white mark for dark backgrounds.
- `zord-mark-exact-tight-black.svg` — tight viewBox for compact UI usage.
- `zord-app-icon-dark.svg` — square safe-area app icon.
- `zord-favicon-dark.svg` — favicon-safe square mark.
- `ZordMark.tsx` — React/TypeScript component.

## Recommended usage

```css
.zord-mark {
  width: 32px;
  height: auto;
  color: #000;
  display: block;
}
```

Do not rotate the mark. The tilt is already part of the identity.
Do not stretch, outline, add random shadows, or place on low-contrast backgrounds.

## Vector path

```svg
M157 10 L133 52 L99 39 L10 200 L247 270 L222 223 L255 199 Z M133 52 L222 223 L65 177 Z
```
