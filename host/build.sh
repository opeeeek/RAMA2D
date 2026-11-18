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
# Ikona okna (opcjonalnie): zasoby Windows z host/icon.png, np.
#   go run github.com/tc-hib/go-winres@v0.3.3 simply --icon icon.png --manifest gui --arch amd64
# następnie w host/icon.go ustaw: const iconID = 1  i zbuduj ponownie.
