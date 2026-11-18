// RAMA2D – program dla Windows: okno WebView2 (Microsoft Edge) z aplikacją RAMA2D (jak oryginalne
// programy BelkaZB, SlupZB, BelkaStal, SlupStal, BelkaDR, SlupDrewniany – host Go + WebView2).
//
// Aplikacja (dist/RAMA2D.html, ok. 6 MB – z osadzonymi modułami) jest serwowana z pamięci przez lokalny
// serwer HTTP na 127.0.0.1 (NavigateToString w WebView2 ma limit ok. 2 MB). Host udostępnia stronie:
//   hostRequest(json)  – okna systemowe „Otwórz” / „Zapisz” (odpowiedź: window.__hostReply(id, wynik)),
//   hostStore(data)    – autozapis projektu w %APPDATA%\RAMA2D\autosave.json,
//   hostTitle(tytuł)   – tytuł okna.
// Plik projektu podany w wierszu poleceń (np. dwuklik na .rama2d) jest otwierany po starcie.
//
// Budowanie (Linux/Windows):  ./host/build.sh   →  RAMA2D.exe
package main

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed RAMA2D.html
var appHTML []byte

var (
	comdlg32         = syscall.NewLazyDLL("comdlg32.dll")
	user32           = syscall.NewLazyDLL("user32.dll")
	shell32          = syscall.NewLazyDLL("shell32.dll")
	pGetOpenFileName = comdlg32.NewProc("GetOpenFileNameW")
	pGetSaveFileName = comdlg32.NewProc("GetSaveFileNameW")
	pMessageBox      = user32.NewProc("MessageBoxW")
	pShellExecute    = shell32.NewProc("ShellExecuteW")
)

// OPENFILENAMEW
type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	Flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	FlagsEx           uint32
}

type hostReq struct {
	ID      int    `json:"id"`
	Op      string `json:"op"`
	Path    string `json:"path"`
	Name    string `json:"name"`
	Content string `json:"content"`
	B64     bool   `json:"b64"`
	Filter  string `json:"filter"`
	URL     string `json:"url"`
}
type hostRes struct {
	Ok      bool   `json:"ok"`
	Path    string `json:"path,omitempty"`
	Content string `json:"content,omitempty"`
	Err     string `json:"err,omitempty"`
}

// filtr okna dialogowego: opis\0wzorzec\0…\0\0
func filterFor(kind string) ([]uint16, string) {
	var parts []string
	ext := ""
	switch kind {
	case "project":
		parts = []string{"Projekt RAMA2D (*.rama2d)", "*.rama2d;*.json"}
		ext = "rama2d"
	case "html":
		parts = []string{"Raport HTML (*.html)", "*.html;*.htm"}
		ext = "html"
	case "odt":
		parts = []string{"Dokument OpenDocument (*.odt)", "*.odt"}
		ext = "odt"
	case "dxf":
		parts = []string{"Rysunek DXF (*.dxf)", "*.dxf"}
		ext = "dxf"
	case "csv":
		parts = []string{"Tabela CSV (*.csv)", "*.csv"}
		ext = "csv"
	}
	parts = append(parts, "Wszystkie pliki (*.*)", "*.*")
	s := strings.Join(parts, "\x00") + "\x00\x00"
	return utf16.Encode([]rune(s)), ext
}
func utf16z(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func fileDialog(hwnd uintptr, save bool, kind, name string) (string, bool) {
	filter, ext := filterFor(kind)
	buf := make([]uint16, 4096)
	if name != "" {
		copy(buf, utf16.Encode([]rune(name)))
	}
	ofn := openFileName{
		hwndOwner:   hwnd,
		lpstrFilter: &filter[0],
		lpstrFile:   &buf[0],
		nMaxFile:    uint32(len(buf)),
		lpstrDefExt: utf16z(ext),
		Flags:       0x00080000 | 0x00000008 | 0x00000800, // OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	var r uintptr
	if save {
		ofn.Flags |= 0x00000002 // OFN_OVERWRITEPROMPT
		r, _, _ = pGetSaveFileName.Call(uintptr(unsafe.Pointer(&ofn)))
	} else {
		ofn.Flags |= 0x00001000 // OFN_FILEMUSTEXIST
		r, _, _ = pGetOpenFileName.Call(uintptr(unsafe.Pointer(&ofn)))
	}
	if r == 0 {
		return "", false
	}
	return syscall.UTF16ToString(buf), true
}

func messageBox(title, text string) {
	pMessageBox.Call(0, uintptr(unsafe.Pointer(utf16z(text))), uintptr(unsafe.Pointer(utf16z(title))), 0x10)
}

func dataDir() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserHomeDir()
	}
	d := filepath.Join(base, "RAMA2D")
	_ = os.MkdirAll(d, 0o755)
	return d
}

func jsonStr(v interface{}) string { b, _ := json.Marshal(v); return string(b) }

func main() {
	// serwer lokalny – stała preferowana port (trwały localStorage modułów), w razie zajętości – dowolny
	ln, err := net.Listen("tcp", "127.0.0.1:47612")
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
	}
	if err != nil {
		messageBox("RAMA2D", "Nie można uruchomić lokalnego serwera aplikacji: "+err.Error())
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(appHTML)
	})
	go func() { _ = http.Serve(ln, mux) }()
	url := fmt.Sprintf("http://%s/", ln.Addr().String())

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(dataDir(), "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title:  "RAMA2D",
			Width:  1500,
			Height: 950,
			IconId: iconID, // zasób ikony z rsrc_windows_amd64.syso (zob. host/icon.go)
			Center: true,
		},
	})
	if w == nil {
		messageBox("RAMA2D", "Nie można utworzyć okna przeglądarki Microsoft Edge WebView2.\nZainstaluj „Microsoft Edge WebView2 Runtime” (https://go.microsoft.com/fwlink/p/?LinkId=2124703) i uruchom program ponownie.")
		return
	}
	defer w.Destroy()
	w.SetSize(1100, 700, webview2.HintMin)
	hwnd := uintptr(w.Window())
	autosave := filepath.Join(dataDir(), "autosave.json")

	_ = w.Bind("hostStore", func(data string) { _ = os.WriteFile(autosave, []byte(data), 0o644) })
	_ = w.Bind("hostTitle", func(t string) { w.Dispatch(func() { w.SetTitle(t) }) })
	_ = w.Bind("hostRequest", func(raw string) {
		var q hostReq
		if err := json.Unmarshal([]byte(raw), &q); err != nil {
			return
		}
		w.Dispatch(func() {
			res := hostRes{}
			switch q.Op {
			case "save":
				path := q.Path
				ok := path != ""
				if !ok {
					path, ok = fileDialog(hwnd, true, q.Filter, q.Name)
				}
				if ok {
					data := []byte(q.Content)
					if q.B64 {
						if d, err := base64.StdEncoding.DecodeString(q.Content); err == nil {
							data = d
						}
					}
					if err := os.WriteFile(path, data, 0o644); err != nil {
						res.Err = err.Error()
					} else {
						res.Ok, res.Path = true, path
					}
				}
			case "open":
				if path, ok := fileDialog(hwnd, false, q.Filter, ""); ok {
					if b, err := os.ReadFile(path); err != nil {
						res.Err = err.Error()
					} else {
						res.Ok, res.Path, res.Content = true, path, string(b)
					}
				}
			case "url":
				pShellExecute.Call(0, uintptr(unsafe.Pointer(utf16z("open"))), uintptr(unsafe.Pointer(utf16z(q.URL))), 0, 0, 1)
				res.Ok = true
			default:
				res.Err = "nieznana operacja: " + q.Op
			}
			w.Eval(fmt.Sprintf("window.__hostReply(%d, %s)", q.ID, jsonStr(res)))
		})
	})

	// stan początkowy: autozapis i plik z wiersza poleceń
	init := "window.__AUTOSAVE = null;"
	if b, err := os.ReadFile(autosave); err == nil && json.Valid(b) {
		init = "window.__AUTOSAVE = " + string(b) + ";"
	}
	if len(os.Args) > 1 {
		if b, err := os.ReadFile(os.Args[1]); err == nil {
			init += fmt.Sprintf("window.__hostOpenFile = { content: %s, path: %s };", jsonStr(string(b)), jsonStr(os.Args[1]))
		}
	}
	w.Init(init)
	w.Navigate(url)
	w.Run()
}
