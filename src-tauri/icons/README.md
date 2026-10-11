# App icon

`app-icon-source.png` is the full-bleed, opaque source for the desktop icon.
The blue background extends to every edge; no transparent border or rounded
outer tile is baked into the artwork. The plain Dashreel window title is
independent of this asset.

The current ICNS is a static glass-style icon. It does not provide native
Liquid Glass rendering or separate clear, dark, and tinted appearances.
Native support requires a layered Icon Composer document compiled using
Xcode 26 or later into an asset catalog. This development machine currently
has Command Line Tools only.

See [Apple Icon Composer](https://developer.apple.com/icon-composer/).

## Regenerate the static bundle assets

Run `bun run tauri icon src-tauri/icons/app-icon-source.png --output <temporary-directory>`.
Copy `icon.icns`, `icon.png`, `32x32.png`, `128x128.png`, and `128x128@2x.png`
from that directory here, then run `bun run desktop:build`.

## Artwork provenance

Created with the built-in image-generation tool by editing the previous
camera icon. Prompt:

> Edit this COMTEC Studio app icon. Preserve the centered camera lens concept, blue color identity and tiny red recording indicator. Produce a FULL BLEED SQUARE app icon source with completely opaque color extending to every edge and ALL FOUR CORNERS: absolutely NO transparent padding, no rounded outer tile, no border, no surrounding margin, no shadow outside the icon. macOS will provide its own mask. Replace the heavy metallic machined look with an elegant contemporary glass-inspired finish: softly luminous cobalt background, simpler translucent icy-blue concentric optical rings, clean restrained highlights, airy layered glass depth. Keep high contrast and legibility at Dock sizes, no text or letters, front-on centered view. This is a finished static app icon artwork, not a mockup. Square PNG.
