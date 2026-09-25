# Image tool capability matrix

This update moves 27 image tools from catalogued shells into actual browser-local engines.

| Tool | Browser engine | Output / result |
|---|---|---|
| Image Compressor | Canvas re-encode | JPEG |
| Image Resizer | Canvas resize | JPEG |
| Image Cropper | Coordinate crop | PNG |
| Image Rotator | 90/180/270° canvas transform | PNG |
| Image Flipper | Horizontal / vertical canvas transform | PNG |
| JPG to PNG | Canvas conversion | PNG |
| PNG to JPG | Canvas conversion | JPEG |
| WEBP to JPG | Canvas conversion | JPEG |
| JPG to WEBP | Canvas conversion | WebP |
| PNG to WEBP | Canvas conversion | WebP |
| Image Dimensions | Canvas/image dimensions | Text result |
| Color Picker | Pixel sampling | RGB + HEX |
| Palette Generator | Quantized dominant-color sampling | Up to 5 HEX colors |
| Dominant Color Finder | Quantized dominant-color sampling | HEX |
| Contrast Checker | WCAG relative-luminance calculation | Ratio + AA/AAA result |
| Image Blur | Canvas filter | JPEG |
| Image Pixelate | Downsample + nearest-neighbor upscale | PNG |
| Image Watermark | Text overlay | PNG |
| Image Border Maker | Canvas framing | PNG |
| Image Padding Tool | Canvas framing | PNG |
| Thumbnail Maker | Width-bounded resize | JPEG |
| Transparent PNG Maker | Near-white alpha removal | PNG |
| Image Average Color | Pixel averaging | RGB + HEX |
| DPI Calculator | Pixel/inch math | Text result |
| Print Size Calculator | Pixel/DPI math | Inches + cm |
| Image File Size Calculator | Byte conversion | Bytes/KB/MB |
| Round Image Maker | Clipped canvas corners | PNG |

### Intentional limits

The engines are small browser-native implementations. They are not presented as feature-parity replacements for professional image editors. HEIC/AVIF/TIFF decoding, OCR, background removal, visual crop handles, and multi-image layout tools remain catalogued until a dedicated engine is added and tested.
