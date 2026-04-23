
## Add a background GIF to the landing page

### Approach
Render the GIF as a fixed, full-screen layer behind the landing content on `/`, with a dark overlay so the title, buttons, and tip text stay legible against the existing dark theme.

### Where the file goes
Put the GIF at `src/assets/background.gif` (you can drop the file in via the upload button — tell me the filename and I'll wire it up). Importing from `src/assets/` lets Vite hash and bundle it. If you'd rather host it remotely, give me the URL and I'll use that string directly instead.

### Changes
**`src/routes/index.tsx`** only:
1. `import bgGif from "@/assets/background.gif";`
2. Inside the `Index` component, before the existing centered content, add two absolutely-positioned layers inside the root `div`:
   - `<img src={bgGif}>` — `absolute inset-0 w-full h-full object-cover -z-20` with `aria-hidden`
   - `<div>` overlay — `absolute inset-0 bg-background/70 -z-10` to dim the GIF for contrast
3. Add `relative overflow-hidden` to the existing root `div` so the absolute layers are clipped to the viewport.

No changes to routing, animations, button styles, or any other route. The fade-up entrance animations and shimmer buttons stay exactly as they are.

### Notes
- GIFs are heavy. If the file is more than ~2 MB, an MP4/WebM looping `<video autoPlay muted loop playsInline>` will look identical and load far faster — say the word and I'll use that pattern instead.
- The `bg-background/70` overlay opacity is easy to tune (e.g. `/50` lighter, `/85` darker) once you see it in place.
