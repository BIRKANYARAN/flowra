#!/bin/bash
# Download Liberation Sans fonts for Turkish character support in PDFs.
# Run this once: cd public/fonts && bash download.sh

set -e

BASE="https://github.com/liberationfonts/liberation-fonts/raw/main/liberation-fonts-ttf-2.1.5"

echo "Downloading LiberationSans-Regular.ttf ..."
curl -fSL -o LiberationSans-Regular.ttf "$BASE/LiberationSans-Regular.ttf"

echo "Downloading LiberationSans-Bold.ttf ..."
curl -fSL -o LiberationSans-Bold.ttf "$BASE/LiberationSans-Bold.ttf"

echo "Done. Fonts are ready for PDF generation."
