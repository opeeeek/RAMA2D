# RAMA2D

Program do modelowania i analizy statycznej **płaskich układów prętowych** (belki, słupy, ramy, kratownice, łuki)
z **wymiarowaniem elementów wg Eurokodów** w modułach tematycznych:

| Moduł | Programy (oryginalne, połączone tematycznie) | Norma |
|---|---|---|
| **Żelbet** | BelkaŻB + SłupŻB | PN-EN 1992-1-1 |
| **Stal** | BelkaStal + SłupStal | PN-EN 1993-1-1 |
| **Drewno** | BelkaDR + SłupDrewniany | PN-EN 1995-1-1 |

Model budowany na głównym ekranie jest przenoszony do wybranego modułu (schemat statyczny, przekrój, materiał,
obciążenia), a zmiany przekroju, materiału i rozpiętości wprowadzone w module wracają do modelu i statyki –
**automatycznie, w obie strony**.

## Uruchomienie

- **Windows:** `RAMA2D.exe` (wymaga Microsoft Edge WebView2 Runtime – standardowo w Windows 10/11).
  Projekt `.rama2d` można otworzyć z linii poleceń (`RAMA2D.exe projekt.rama2d`).
- **Dowolny system:** `dist/RAMA2D.html` – otwórz w przeglądarce (Chrome, Edge, Firefox). Zapis i odczyt projektów
  przez pobieranie plików, autozapis w pamięci przeglądarki.

## Praca z programem

1. **Model i statyka** – generator układów (belka, wspornik, słup, rama portalowa / wielonawowa / wielokondygnacyjna,
   rama dwuspadowa, kratownice Pratta, Howe’a, Warrena, K o pasach równoległych, trapezowe, trójkątne, pulpitowe,
   łukowe, łuki) albo rysowanie: narzędzia po lewej (V zaznacz, B pręty, N węzeł na pręcie, S podpora, L obciążenie,
   H przegub, D usuń), linia poleceń pod rysunkiem (`x; z`, `@dx; dz`, `<L; kąt`), menu kontekstowe (prawy klik),
   panel właściwości po prawej, cofanie i ponawianie (Ctrl+Z / Ctrl+Y).
2. **Przekroje** – żelbetowe (prostokątny, teowy, okrągły, pierścieniowy; klasy C12/15–C90/105), stalowe
   (IPE, HEA, HEB, HEM, UPN, UPE, L, SHS, RHS, CHS, 2×C, blachownice; S235–S460), drewniane (lite C14–C50, D18–D80,
   klejone GL20h–GL32c, LVL; przekroje wieloczęściowe, okrągłe). Tablice pochodzą z silników modułów.
3. **Obciążenia** – przypadki (stałe G, użytkowe Q kat. A–H, śnieg, wiatr, temperatura, inne z ψ, wyjątkowe),
   grupy wykluczające się (np. wiatr z lewej / z prawej), ciężar własny automatycznie. Obciążenia: rozłożone
   trapezowe i częściowe (globalnie, prostopadle, wzdłuż pręta, na rzut), siły i momenty skupione, węzłowe,
   temperatura (równomierna i różnica), osiadania podpór.
4. **Kombinacje** – PN-EN 1990 (ZK): 6.10 albo 6.10a/6.10b, SGU charakterystyczna, częsta, quasi-stała,
   wyjątkowa 6.11b; obwiednie dokładne dla każdej wielkości; kombinacje własne.
5. **Wyniki** – wykresy M, V, N, deformacje, reakcje na rysunku (przypadek, kombinacja, obwiednia), tabele z
   eksportem CSV; **stateczność**: mnożniki α_cr, postacie wyboczenia, długości wyboczeniowe; opcjonalnie analiza
   **II rzędu P-Δ** dla kombinacji decydujących; raport (HTML / PDF).
6. **Wymiarowanie** – elementy wykrywane automatycznie (belki – ciągi współliniowych prętów z przęsłami
   i wspornikami; słupy – pręty między węzłami stropów) albo z menu kontekstowego pręta („Wymiaruj w module…”).
   Wytężenie każdego elementu liczone jest silnikiem modułu (także bez otwierania modułu) i pokazywane w tabeli
   oraz na rysunku (tryb „Wytężenie”).
7. **Moduły** (zakładki Żelbet / Stal / Drewno, przełącznik Belki / Słupy) – pełne, oryginalne programy
   z zaimportowanym elementem; pasek nad modułem pokazuje powiązanie z modelem, schemat, podpory i uwagi.

## Wymiana danych model ↔ moduł

| Dane | Kierunek | Uwagi |
|---|---|---|
| przęsła, wsporniki, węzły pośrednie, przeguby | model → moduł | zmiana rozpiętości w module **przesuwa węzły modelu** (moduł → model) |
| podpory belki | model → moduł | podpory zewnętrzne i pręty dochodzące od spodu (słupy); podatność obrotowa od prętów dochodzących – **rama zastępcza** k_φ = Σ α·EI/L (α = 4 lub 3, z odkształceniami postaciowymi gdy uwzględniane); do wyboru: sprężyste / przegubowe / utwierdzone |
| obciążenia | model → moduł | jedno oddziaływanie modułu na przypadek modelu (te same kategorie, ψ, grupy wykluczające); siły przekazywane w węzłach połączeń – z analizy globalnej; ciężar własny elementu liczy moduł |
| siły na końcach słupów | model → moduł | słup wycięty z ramy (SłupStal, SłupDrewniany: utwierdzenie + siły w głowicy – rozkład momentów identyczny jak w ramie; SłupŻB: schemat wg usztywnienia ramy z kompensacją momentów końcowych) |
| długości wyboczeniowe | model → moduł | SłupStal L_cr,y i SłupDrewniany l_ef,y z globalnej postaci wyboczenia (PN-EN 1993-1-1, 5.2.2(8)); SłupŻB – k₁, k₂ ze sztywności węzłów (PN-EN 1992-1-1, 5.8.3.2) |
| przekrój, materiał | **model ↔ moduł** | zmiana w module zmienia przekrój prętów elementu (nowy przekrój, gdy dotychczasowy jest wspólny z innymi prętami), statyka przelicza się, moduł dostaje zaktualizowane siły |
| nazwa elementu | model ↔ moduł | |
| zbrojenie, ekspozycja, stężenia, połączenia, pożar itd. | moduł | należą do modułu, zapisywane w projekcie RAMA2D |

Dane sterowane z modelu zmienione w module są przywracane z komunikatem. Obciążenia dodane w module (bez znacznika
„rama”) są zachowywane i nie wpływają na model. Poprawność przenoszenia sprawdza `tests/design.test.js`:
statyka liczona silnikami modułów jest porównywana ze statyką ramy (belki ciągłe ze wspornikami, pręty odwrócone,
obciążenia trapezowe, siły w węzłach, rama zastępcza, słupy ze sprężystym obciążeniem poziomym i momentem).

## Konwencje

- Układ globalny: X w prawo, Z w górę; jednostki: m, kN, kNm; wymiary przekrojów w mm.
- Obciążenia: „Z” – pionowo, dodatnie w dół; „X” – poziomo, dodatnie w prawo; „z” – prostopadle do pręta
  w stronę spodu; „x” – wzdłuż pręta. Momenty skupione dodatnie zgodnie z ruchem wskazówek zegara.
- Spód pręta (linia przerywana) – po prawej stronie kierunku węzeł początkowy → końcowy (belka L→P: dół;
  słup dół→góra: prawa strona). M > 0 rozciąga spód, wykres M rysowany po stronie rozciąganej. N > 0 – rozciąganie.

## Struktura repozytorium

```
BelkaZB.exe … SlupDrewniany.exe   oryginalne programy (źródło modułów)
modules/src/*.html                aplikacje modułów wyodrębnione z .exe (tools/extract-modules.js)
src/core/                         rdzeń: fem.js (MES), combos.js (PN-EN 1990), sections.js, model.js,
                                  generator.js, design.js (elementy i wymiana danych z modułami)
src/ui/, src/css/, src/index.html interfejs programu
tools/engines.js                  silniki modułów ładowane „bezgłowo” (izolowane zakresy EC2 / EC5 / BS)
tools/patches.js                  łatki integracyjne modułów (stosowane przy budowaniu, oryginały bez zmian)
tools/build.js                    budowanie dist/RAMA2D.html
host/                             program Windows (Go + WebView2) → RAMA2D.exe
tests/                            testy (MES na rozwiązaniach analitycznych, kombinacje, generator, wymiana danych)
```

## Budowanie

```bash
node tools/extract-modules.js   # po podmianie któregoś z programów .exe – ponowne wyodrębnienie modułów
node tools/build.js             # dist/RAMA2D.html
./host/build.sh                 # RAMA2D.exe (Go ≥ 1.21; kompilacja skrośna działa także na Linuksie)
npm test                        # testy
```

Łatki integracyjne (`tools/patches.js`) są minimalne: grupy wykluczające się obciążeń zmiennych w BelkaŻB,
SłupŻB i BelkaDR (BelkaStal i SłupStal mają je natywnie), belka jednoprzęsłowa ze wspornikiem w schemacie
ciągłym BelkaŻB, funkcja `setState` w BelkaStal i SłupStal. Gdy po podmianie programu wzorzec łatki przestanie
pasować, budowanie zatrzyma się z informacją, którą łatkę dostosować.

## Rozbudowa o kolejne moduły

Nowy moduł (np. konstrukcje murowe, geotechnika) dodaje się przez: plik aplikacji w `modules/src`, wpis silnika
w `tools/engines.js`, opis w `D.MODS` i funkcję mapowania `MAP.<moduł>_<rodzaj>` w `src/core/design.js`
(model → moduł) oraz odczyt przekroju w `D.sectionFromModule` (moduł → model), zakładkę w `src/index.html`.

## Ograniczenia

- Analiza płaska; zginanie z płaszczyzny i skręcanie – ustawienia w modułach.
- Belki w modułach liczone są w schemacie ramy zastępczej: dla obciążeń poziomych (wiatr) momenty od pracy ramy
  w belkach nie są przenoszone do BelkaŻB i BelkaDR (moduły nie przyjmują momentów skupionych) – program
  ostrzega o pominiętych składnikach na pasku modułu.
- **Kontrola zgodności schematu:** dla każdej belki momenty od obciążeń stałych liczone silnikiem modułu są
  porównywane z momentami w ramie; przy różnicy > 15% (np. rygle ram dwuspadowych, belki w ramach przechyłowych,
  gdzie decyduje praca ramy – rozpór, ugięcie kalenicy) moduł i tabela wymiarowania pokazują ostrzeżenie
  z wartościami z obu modeli. Drobne różnice (kilka %) wynikają z ustawień modułów: redukcji momentów nad
  szerokimi podporami (PN-EN 1992-1-1, 5.3.2.2), odkształceń postaciowych w drewnie, ciężaru własnego.
- Układ szachownicowy obciążeń zmiennych stosują moduły belek; w statyce ramy obciążenie przypadku działa
  w całości (układy szachownicowe można zadać osobnymi przypadkami w jednej grupie wykluczającej).

Program jest narzędziem pomocniczym. Wyniki wymagają weryfikacji przez osobę z odpowiednimi uprawnieniami budowlanymi.
