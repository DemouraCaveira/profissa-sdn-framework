#!/usr/bin/env bash
# =============================================================================
# Profissa SDN Platform — Installer
# Clique duas vezes neste arquivo no gerenciador de arquivos, OU execute:
#   bash desktop/install.sh
# =============================================================================

# ── Se não estiver rodando dentro de um terminal, re-executa dentro de um ────
# Isso garante que o clique duplo pelo gerenciador de arquivos abra um terminal.
if [[ ! -t 0 ]]; then
    SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
    # Tenta os emuladores de terminal mais comuns
    for TERM_EMU in gnome-terminal x-terminal-emulator xterm konsole xfce4-terminal lxterminal mate-terminal; do
        if command -v "$TERM_EMU" &>/dev/null; then
            case "$TERM_EMU" in
                gnome-terminal) exec gnome-terminal -- bash "$SELF" ;;
                konsole)        exec konsole -e bash "$SELF" ;;
                *)              exec "$TERM_EMU" -e bash "$SELF" ;;
            esac
        fi
    done
    # Fallback: abre via xdg-terminal (se disponível)
    if command -v xdg-terminal &>/dev/null; then
        exec xdg-terminal bash "$SELF"
    fi
    # Último recurso: executa sem terminal (erros vão para /tmp/profissa_install.log)
    exec bash "$SELF" >> /tmp/profissa_install.log 2>&1
fi

set -euo pipefail

### ── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[profissa]${NC} $*"; }
warn()  { echo -e "${YELLOW}[profissa]${NC} $*"; }
error() { echo -e "${RED}[profissa ERROR]${NC} $*" >&2; }

### ── Resolve project root (works regardless of CWD) ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
info "Project root: $APP_DIR"

### ── 1. System prerequisites check ─────────────────────────────────────────
info "Checking system packages …"
MISSING_PKGS=()
for pkg in python3 python3-venv python3-gi gir1.2-webkit2-4.0; do
    if ! dpkg -l "$pkg" 2>/dev/null | grep -q "^ii"; then
        MISSING_PKGS+=("$pkg")
    fi
done

if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
    warn "Installing missing system packages: ${MISSING_PKGS[*]}"
    if command -v sudo &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y "${MISSING_PKGS[@]}"
    else
        error "sudo not available. Please run as root or install manually: ${MISSING_PKGS[*]}"
        exit 1
    fi
else
    info "All system packages present ✔"
fi

### ── 1b. Node.js / npm prerequisite ─────────────────────────────────────────
info "Checking Node.js / npm …"
NODE_MIN=18
NPM_OK=false
if command -v node &>/dev/null; then
    NODE_VER="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
    if [[ "$NODE_VER" -ge "$NODE_MIN" ]]; then
        info "Node.js $NODE_VER detected ✔"
        NPM_OK=true
    else
        warn "Node.js $NODE_VER is too old (need ≥ $NODE_MIN). Trying to install a newer version …"
    fi
else
    warn "Node.js not found. Installing via NodeSource …"
fi

if [[ "$NPM_OK" == false ]]; then
    if command -v sudo &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN}.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        error "sudo not available. Please install Node.js ≥ $NODE_MIN manually: https://nodejs.org"
        exit 1
    fi
    info "Node.js installed ✔"
fi

### ── 2. Create / refresh Python venv ───────────────────────────────────────
VENV="$APP_DIR/.venv"
info "Setting up Python virtual environment …"

# Always recreate with --system-site-packages so 'gi' (GTK) is accessible.
# If the existing venv was created WITHOUT --system-site-packages we must
# rebuild it — cheapest signal: pyvenv.cfg contains "include-system-site-packages = false"
NEED_RECREATE=false
if [[ -f "$VENV/pyvenv.cfg" ]]; then
    if grep -q "include-system-site-packages = false" "$VENV/pyvenv.cfg"; then
        warn "Existing venv lacks --system-site-packages — rebuilding …"
        NEED_RECREATE=true
    fi
else
    NEED_RECREATE=true
fi

if [[ "$NEED_RECREATE" == true ]]; then
    rm -rf "$VENV"
    python3 -m venv --system-site-packages "$VENV"
    info "Created venv at $VENV ✔"
else
    info "Existing venv OK ✔"
fi

PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

### ── 3. Install / upgrade pip packages ─────────────────────────────────────
info "Installing Python dependencies …"
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet -r "$APP_DIR/requirements.txt"

# Desktop-specific packages
DESKTOP_REQS="$APP_DIR/requirements-desktop.txt"
if [[ -f "$DESKTOP_REQS" ]]; then
    "$PIP" install --quiet -r "$DESKTOP_REQS"
fi

info "Python dependencies installed ✔"

### ── 3b. Pre-create runtime directories ───────────────────────────────────
info "Creating runtime directories …"
# Persistent experiments folder (survives reinstalls, safe to keep)
mkdir -p \
    "$APP_DIR/experiments/registry" \
    "$APP_DIR/experiments/runs" \
    "$APP_DIR/experiments/run_metrics"
# Temporary working directories for the backend
mkdir -p \
    "$APP_DIR/temp/experiments/registry" \
    "$APP_DIR/temp/experiments/runs" \
    "$APP_DIR/temp/experiments/run_metrics" \
    "$APP_DIR/temp/configs"
info "Runtime directories ready ✔"

### ── 4. Build the Next.js frontend ─────────────────────────────────────────
FRONTEND_DIR="$APP_DIR/platform/frontend-next"
info "Installing Node.js dependencies …"
(cd "$FRONTEND_DIR" && npm ci --silent)
info "Building Next.js frontend …"
# Bake the backend URL for production build — stays localhost:8000 for desktop use.
(cd "$FRONTEND_DIR" && NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run build)
info "Frontend built ✔"

### ── 5. Install SVG icon ────────────────────────────────────────────────────
info "Installing icon …"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
mkdir -p "$ICON_DIR"
cp "$SCRIPT_DIR/profissa.svg" "$ICON_DIR/profissa.svg"
# Also put a 256x256 entry for DEs that prefer the sized folder
ICON_DIR_256="$HOME/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$ICON_DIR_256"
cp "$SCRIPT_DIR/profissa.svg" "$ICON_DIR_256/profissa.svg"
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
info "Icon installed ✔"

### ── 6. Write .desktop entry with ABSOLUTE paths ───────────────────────────
info "Registering application launcher …"
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

# Write the .desktop with the absolute path to run_profissa.sh baked in.
# Using absolute path means the launcher works regardless of how the DE invokes it.
cat > "$APPS_DIR/profissa.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Profissa SDN Platform
GenericName=Network Operations Studio
Comment=Network Operations & Monitoring Platform for SDN Research
Exec="$SCRIPT_DIR/run_profissa.sh"
Icon=profissa
Terminal=false
StartupNotify=true
Categories=Network;Science;Education;
Keywords=SDN;NetOps;network;monitoring;operations;research;
EOF

chmod +x "$APPS_DIR/profissa.desktop"
chmod +x "$SCRIPT_DIR/run_profissa.sh"

# Also mark the desktop file as trusted on Ubuntu/GNOME
if command -v gio &>/dev/null; then
    gio set "$APPS_DIR/profissa.desktop" metadata::trusted true 2>/dev/null || true
fi

update-desktop-database "$APPS_DIR" 2>/dev/null || true

info "Launcher registered ✔"

### ── 7. Summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Profissa SDN Platform — instalado com sucesso!     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  → Abra o menu de aplicativos e busque por 'Profissa SDN Platform'"
echo "  → Ou execute direto:  $SCRIPT_DIR/run_profissa.sh"
echo "  → Experimentos salvos em: $APP_DIR/experiments/"
echo ""
echo "  Log de execução: /tmp/profissa_app.log"
echo ""
# Mantém o terminal aberto para o usuário ler o resultado
read -rp "  Pressione ENTER para fechar esta janela…"
