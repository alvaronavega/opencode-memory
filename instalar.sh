#!/usr/bin/env bash
# Instala (ou remove) o opencode-memory no OpenCode local.
#
#   ./instalar.sh              instala
#   ./instalar.sh --force      sobrescreve uma instalação existente
#   ./instalar.sh --uninstall  remove o plugin (não apaga a memória dos projetos)
#
# O script é idempotente: rodar de novo não sobrescreve nada sem --force.

set -euo pipefail

FORCE=0
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg" >&2
      exit 2
      ;;
  esac
done

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -n "${XDG_CONFIG_HOME:-}" ] && [ "${XDG_CONFIG_HOME}" != "" ]; then
  CONFIG_DIR="${XDG_CONFIG_HOME}/opencode"
else
  CONFIG_DIR="${HOME}/.config/opencode"
fi

PLUGINS_DIR="${CONFIG_DIR}/plugins"
KIT_DIR="${PLUGINS_DIR}/opencode-memory"
GLOBAL_CONFIG="${CONFIG_DIR}/memory.json"

info() { printf '\033[36m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m%s\033[0m\n' "$1"; }

if [ "$UNINSTALL" -eq 1 ]; then
  if [ -d "$KIT_DIR" ]; then
    rm -rf "$KIT_DIR"
    ok "Plugin removido de $KIT_DIR"
  else
    info "Plugin não estava instalado em $KIT_DIR"
  fi
  info "A memória dos projetos (MEMORY.md) não foi tocada."
  info "O config global continua em $GLOBAL_CONFIG"
  exit 0
fi

info "Instalando opencode-memory..."
info "  origem:  $SOURCE_DIR"
info "  destino: $KIT_DIR"

if [ -d "$KIT_DIR" ] && [ "$FORCE" -eq 0 ]; then
  info "Já existe uma instalação. Use --force para sobrescrever."
else
  rm -rf "$KIT_DIR"
  mkdir -p "$KIT_DIR"
  for file in index.ts package.json README.md; do
    [ -f "$SOURCE_DIR/$file" ] && cp "$SOURCE_DIR/$file" "$KIT_DIR/$file"
  done
  # Copia arquivo por arquivo: `cp -r` num destino existente mistura diretórios.
  if [ -d "$SOURCE_DIR/src" ]; then
    (cd "$SOURCE_DIR" && find src -type f -print0 | while IFS= read -r -d '' f; do
      mkdir -p "$KIT_DIR/$(dirname "$f")"
      cp "$SOURCE_DIR/$f" "$KIT_DIR/$f"
    done)
    info "src: $(find "$KIT_DIR/src" -type f 2>/dev/null | wc -l | tr -d ' ') arquivo(s) copiado(s)"
  fi
  ok "Plugin copiado."
fi

if [ ! -f "$GLOBAL_CONFIG" ]; then
  mkdir -p "$CONFIG_DIR"
  cat > "$GLOBAL_CONFIG" <<'JSON'
{
  "version": 1,
  "auto": true,
  "enabled": true
}
JSON
  ok "Config global criado: $GLOBAL_CONFIG"
else
  info "Config global já existe (mantido): $GLOBAL_CONFIG"
fi

printf '\n'
ok "Pronto."
printf '\n'
echo "Próximos passos:"
echo "  1. Reinicie o OpenCode (ou rode /reload dentro dele)."
echo "  2. Abra uma pasta de projeto: o MEMORY.md é criado automaticamente."
echo "  3. Digite /mem help para ver os comandos."
printf '\n'
echo "Para desinstalar: ./instalar.sh --uninstall"
