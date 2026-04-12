#!/usr/bin/env bash
# =============================================================================
# Profissa SDN Platform — Installer
# Run once:  bash desktop/install.sh
# After that, click the "Profissa SDN Platform" icon in the application menu.
# =============================================================================
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

### ── 4. Install SVG icon ────────────────────────────────────────────────────
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

### ── 5. Write .desktop entry with ABSOLUTE paths ───────────────────────────
info "Registering application launcher …"
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

# Write the .desktop with the absolute path to run_profissa.sh baked in.
# Using absolute path means the launcher works regardless of how the DE invokes it.
cat > "$APPS_DIR/profissa.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=NetOps Studio
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

### ── 6. Summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      NetOps Studio — installed successfully!         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  → Open your application menu and search for 'NetOps Studio'"
echo "  → Or run from terminal:  $SCRIPT_DIR/run_profissa.sh"
echo ""
echo "  Log file: /tmp/profissa_app.log"
echo ""
