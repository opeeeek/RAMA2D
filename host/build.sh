#!/usr/bin/env bash
# RAMA2D – zbudowanie programu dla Windows (RAMA2D.exe) z aplikacji dist/RAMA2D.html.
# Wymagania: Node.js (budowanie aplikacji), Go ≥ 1.21 (kompilacja; działa także na Linuksie – kompilacja skrośna).
# Użycie (z katalogu głównego repozytorium):  ./host/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build.js
cp dist/RAMA2D.html host/RAMA2D.html            # osadzane w programie (go:embed); plik roboczy – w .gitignore
cd host
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../RAMA2D.exe .
echo "✓ RAMA2D.exe"
# Ikona programu: zasoby host/rsrc_windows_amd64.syso (w repozytorium) – po zmianie src/icon/*.svg: node tools/icon.js
