# ZPL Label Maker

A web-based label maker for Zebra ZD421 printers. Create labels using simple text syntax, preview them live, and print via ZPL II.

**Live at:** Deployed on Cloudflare Pages as a static site.

## Features

- **Simple syntax** — Type labels separated by blank lines, with formatting shortcuts
- **Live preview** — See how labels will look as you type
- **ZPL generation** — Produces valid ZPL II code for Zebra printers
- **Multiple print methods** — Copy ZPL, browser print, or direct network printing
- **Persistent settings** — Label size, darkness, speed, and printer config saved locally

## Quick Start

1. Open `index.html` in a browser (or visit the deployed URL)
2. Type your labels in the text area
3. Configure label size and printer settings via ⚙️
4. Print using your preferred method

## Label Syntax

| Syntax | Effect |
|--------|--------|
| Blank line | Separates labels |
| `x2` | Print 2 copies (any number works) |
| `---` | Horizontal line |
| `*text*` | Bold text |
| `#text` | Large header |
| `>text` | Right-aligned |
| `<>text` | Center-aligned |
| `[barcode:CODE128:data]` | Code 128 barcode |
| `[qr:data]` | QR code |

### Example

```
#Product Name
*SKU: ABC-123*
<>$9.99
---
[barcode:CODE128:ABC123]
x2

Shipping Label
4" x 6" format
```

## Network Printing

For direct printing to a Zebra printer on your network:

1. Run the print server locally:
   ```bash
   python3 print-server.py
   ```
2. Set your printer's IP address in Settings
3. Click Print → Send to Printer (Network)

The print server listens on `http://localhost:5555` and forwards ZPL to your printer via raw TCP on port 9100.

## Label Size Presets

- 2.25" × 1.25" (Standard)
- 4" × 6" (Shipping)
- 2" × 1" (Small)
- 3" × 2" (Medium)
- 4" × 2" (Address)
- Custom dimensions

## Deployment

This is a static site — just deploy the files to any web host or Cloudflare Pages:

```bash
# Files needed:
index.html
style.css
app.js
```

The `print-server.py` is a local utility, not deployed to the web.

## Tech Stack

- Pure HTML/CSS/JS — no build step, no frameworks
- Works offline after initial load
- Responsive design (desktop + tablet)

## License

MIT
