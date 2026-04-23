
## Apply "Hive Arena / Hive Court" Visual Theme

Pure visual restyle — no logic, routing, or component structure changes. Only colors, typography, and surface styles update.

### 1. Typography — Space Grotesk

In `src/routes/__root.tsx`:
- Add Google Fonts preconnect + stylesheet `<link>` for **Space Grotesk** (weights 400/500/700) to the route `head().links`.

In `src/styles.css`:
- Set `body { font-family: "Space Grotesk", system-ui, sans-serif; }`.
- Add a small utility `.section-heading { text-transform: uppercase; font-weight: 700; letter-spacing: 0.02em; }` for section titles.

### 2. Theme tokens — Hive Arena (dark) + Hive Court (light)

In `src/styles.css`, replace the existing `:root` (light) and `.dark` (dark) oklch palettes with the spec's hex values, mapped to the existing semantic tokens so all shadcn components inherit automatically:

**Light = Hive Court (`:root`)**
- `--background: #f5f3ee`
- `--foreground: #1a1a1a`
- `--card`, `--popover`: `#ffffff` (+ foreground `#1a1a1a`)
- `--border`, `--input`: `#dedbd4`
- `--muted-foreground`: `#bbbbbb`
- `--muted`, `--secondary`, `--accent`: `#ffffff` (foreground `#1a1a1a`)
- `--primary: #1a1a1a`, `--primary-foreground: #f5f3ee`
- `--destructive: #a06070`, `--destructive-foreground: #ffffff` (REC)
- `--ring: #1a1a1a`
- New tokens: `--ai-badge: #f0e8d0`, `--ai-badge-foreground: #a0813a`, `--accent-stroke: #a0813a`

**Dark = Hive Arena (`.dark`)**
- `--background: #111114`
- `--foreground: #f0ede6`
- `--card`, `--popover`: `#191920` (+ foreground `#f0ede6`)
- `--border`, `--input`: `#252528`
- `--muted-foreground`: `#555555`
- `--muted`, `--secondary`, `--accent`: `#191920` (foreground `#f0ede6`)
- `--primary: #d4b96a`, `--primary-foreground: #1a1508`
- `--destructive: #7a4a55`, `--destructive-foreground: #f0ede6` (REC)
- `--ring: #d4b96a`
- New tokens: `--ai-badge: #3a3220`, `--ai-badge-foreground: #d4b96a`, `--accent-stroke: #d4b96a`

Register the new tokens in the `@theme inline` block (`--color-ai-badge`, `--color-ai-badge-foreground`, `--color-accent-stroke`) so Tailwind utilities like `bg-ai-badge`, `text-accent-stroke` work.

Hex values are converted to `oklch(...)` to match the file's existing format (the `@theme` mapping is unchanged, so this is a pure value swap).

### 3. Auto-follow system preference

In `src/routes/__root.tsx` `RootShell`:
- Add a tiny inline `<script>` in `<head>` that sets `document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches)` before paint, and listens for changes. No state, no toggle UI — pure system follow.

### 4. Apply the new tokens to existing screens (no structural changes)

- **`/` landing** (`src/routes/index.tsx`): h1 picks up the `.section-heading` class (bold, all-caps); spacing/structure unchanged. Background already uses `bg-background`.
- **`/record`** (`src/routes/record.tsx`): the recording surface stays `bg-black` (camera viewport intentionally pitch black). The timer pill switches from hardcoded `bg-red-600/90` to `bg-destructive text-destructive-foreground` (REC token). The record-button inner dot also uses `bg-destructive`.
- **`/review`** (`src/routes/review.tsx`): unchanged structure; existing `Button` variants now inherit the new primary/secondary palette automatically.
- **404** (`__root.tsx`): unchanged structure; inherits new tokens.

### Out of scope
- No logic, routing, recorder, or store changes.
- No new components.
- No manual dark-mode toggle (system-only per spec).
- AI badge token added to the palette but not yet placed in UI (no AI feature exists yet to badge).
