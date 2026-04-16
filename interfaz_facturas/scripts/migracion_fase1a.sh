#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# PROCEDIMIENTO DE MIGRACIÓN SEGURA — FASE 1A
# Módulo Maquinaria, Hincado Directo ERP
#
# USO:
#   chmod +x scripts/migracion_fase1a.sh
#   cd interfaz_facturas
#   ./scripts/migracion_fase1a.sh [--rollback]
#
# REQUISITOS:
#   - Python 3.8+
#   - BD en data/gestion.db
#   - Permisos de escritura en data/
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$APP_DIR/data"
DB_FILE="$DATA_DIR/gestion.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$DATA_DIR/gestion_pre_fase1a_${TIMESTAMP}.db"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "══════════════════════════════════════════════════════════════"
echo "  MIGRACIÓN FASE 1A — Módulo Maquinaria"
echo "  $(date)"
echo "══════════════════════════════════════════════════════════════"

# ── Modo rollback ──
if [[ "${1:-}" == "--rollback" ]]; then
    echo -e "\n${YELLOW}MODO ROLLBACK${NC}"
    LATEST_BACKUP=$(ls -t "$DATA_DIR"/gestion_pre_fase1a_*.db 2>/dev/null | head -1)
    if [[ -z "$LATEST_BACKUP" ]]; then
        echo -e "${RED}No se encontró backup de Fase 1A en $DATA_DIR${NC}"
        exit 1
    fi
    echo "  Último backup: $LATEST_BACKUP"
    echo "  BD actual:     $DB_FILE"
    read -p "  ¿Restaurar backup? (escribir 'SI' para confirmar): " CONFIRM
    if [[ "$CONFIRM" != "SI" ]]; then
        echo "  Cancelado."
        exit 0
    fi
    cp "$LATEST_BACKUP" "$DB_FILE"
    echo -e "${GREEN}✓ BD restaurada desde $LATEST_BACKUP${NC}"
    exit 0
fi

# ── Verificaciones previas ──
echo -e "\n${YELLOW}1. Verificaciones previas${NC}"

if [[ ! -f "$DB_FILE" ]]; then
    echo -e "${RED}ERROR: No se encuentra $DB_FILE${NC}"
    exit 1
fi
echo "  ✓ BD encontrada: $DB_FILE"

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "  ✓ Tamaño: $DB_SIZE"

# Verificar integridad
echo "  Verificando integridad..."
INTEGRITY=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>&1)
if [[ "$INTEGRITY" != "ok" ]]; then
    echo -e "${RED}ERROR: La BD no pasa integrity_check:${NC}"
    echo "  $INTEGRITY"
    exit 1
fi
echo "  ✓ Integridad OK"

# Contar registros actuales
echo "  Conteo de registros pre-migración:"
MAQUINAS_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM maquinas;" 2>/dev/null || echo "0")
INCIDENCIAS_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM maquinaria_incidencias;" 2>/dev/null || echo "0")
echo "    maquinas:    $MAQUINAS_COUNT"
echo "    incidencias: $INCIDENCIAS_COUNT"

# Verificar si ya migrado
HAS_OLD_CHECK=$(sqlite3 "$DB_FILE" "SELECT sql FROM sqlite_master WHERE name='maquinaria_incidencias';" 2>/dev/null | grep -c "en_curso" || true)
if [[ "$HAS_OLD_CHECK" -eq 0 ]]; then
    echo -e "\n${YELLOW}⚠  La BD podría ya estar migrada (no contiene CHECK viejo).${NC}"
    echo "  La migración es idempotente, se puede ejecutar sin riesgo."
fi

# ── Backup ──
echo -e "\n${YELLOW}2. Creando backup${NC}"
cp "$DB_FILE" "$BACKUP_FILE"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "  ✓ Backup creado: $BACKUP_FILE ($BACKUP_SIZE)"

# Verificar backup
BACKUP_INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>&1)
if [[ "$BACKUP_INTEGRITY" != "ok" ]]; then
    echo -e "${RED}ERROR: El backup no pasa integrity_check${NC}"
    exit 1
fi
echo "  ✓ Integridad del backup OK"

# ── Ejecución de migración ──
echo -e "\n${YELLOW}3. Ejecutando migración${NC}"
echo "  Iniciando init_maquinaria_db()..."

cd "$APP_DIR"
python3 -c "
import sys
sys.path.insert(0, '.')
from core import maquinaria_db
maquinaria_db.init_maquinaria_db()
print('  ✓ init_maquinaria_db() completado sin errores')
" 2>&1

if [[ $? -ne 0 ]]; then
    echo -e "\n${RED}ERROR: La migración falló.${NC}"
    echo "  Ejecutar rollback: $0 --rollback"
    exit 1
fi

# ── Validación post-migración ──
echo -e "\n${YELLOW}4. Validación post-migración${NC}"

# Integridad
POST_INTEGRITY=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>&1)
if [[ "$POST_INTEGRITY" != "ok" ]]; then
    echo -e "${RED}ERROR: La BD NO pasa integrity_check después de la migración${NC}"
    echo "  Ejecutar rollback: $0 --rollback"
    exit 1
fi
echo "  ✓ Integridad post-migración OK"

# Conteo de registros
POST_MAQUINAS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM maquinas;" 2>/dev/null)
POST_INCIDENCIAS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM maquinaria_incidencias;" 2>/dev/null)
echo "  Conteo post-migración:"
echo "    maquinas:    $POST_MAQUINAS (antes: $MAQUINAS_COUNT)"
echo "    incidencias: $POST_INCIDENCIAS (antes: $INCIDENCIAS_COUNT)"

if [[ "$POST_MAQUINAS" -ne "$MAQUINAS_COUNT" ]]; then
    echo -e "${RED}⚠  El conteo de maquinas cambió — verificar manualmente${NC}"
fi
if [[ "$POST_INCIDENCIAS" -ne "$INCIDENCIAS_COUNT" ]]; then
    echo -e "${RED}⚠  El conteo de incidencias cambió — verificar manualmente${NC}"
fi

# Verificar columnas nuevas
echo "  Verificando columnas nuevas..."
python3 -c "
import sqlite3
conn = sqlite3.connect('$DB_FILE')
conn.row_factory = sqlite3.Row

maq_cols = [r[1] for r in conn.execute('PRAGMA table_info(maquinas)').fetchall()]
inc_cols = [r[1] for r in conn.execute('PRAGMA table_info(maquinaria_incidencias)').fetchall()]

errors = 0
for col in ['estado_operativo','operario_habitual_id','override_estado_manual','criticidad']:
    if col in maq_cols:
        print(f'    ✓ maquinas.{col}')
    else:
        print(f'    ✗ FALTA maquinas.{col}')
        errors += 1

for col in ['sintoma_inicial','horas_downtime','coste_downtime','es_historico','tipo_incidencia']:
    if col in inc_cols:
        print(f'    ✓ incidencias.{col}')
    else:
        print(f'    ✗ FALTA incidencias.{col}')
        errors += 1

# Tablas nuevas
for tbl in ['maquinaria_asignaciones_obra', 'maquinaria_incidencia_transiciones']:
    if conn.execute(f\"SELECT 1 FROM sqlite_master WHERE name='{tbl}'\").fetchone():
        print(f'    ✓ Tabla {tbl}')
    else:
        print(f'    ✗ FALTA tabla {tbl}')
        errors += 1

# CHECK constraint eliminado
sql = conn.execute(\"SELECT sql FROM sqlite_master WHERE name='maquinaria_incidencias'\").fetchone()[0]
if \"en_curso\" not in sql:
    print('    ✓ CHECK constraint antiguo eliminado')
else:
    print('    ✗ CHECK constraint antiguo SIGUE PRESENTE')
    errors += 1

# Datos migrados
en_curso = conn.execute(\"SELECT COUNT(*) FROM maquinaria_incidencias WHERE estado='en_curso'\").fetchone()[0]
if en_curso == 0:
    print(f'    ✓ No quedan registros con estado en_curso')
else:
    print(f'    ✗ Quedan {en_curso} registros con estado en_curso')
    errors += 1

# Asignaciones seed
asig_count = conn.execute('SELECT COUNT(*) FROM maquinaria_asignaciones_obra').fetchone()[0]
print(f'    ✓ {asig_count} asignaciones en tabla nueva')

conn.close()
exit(1 if errors > 0 else 0)
" 2>&1

VALIDATION_RESULT=$?

# ── Resumen ──
echo -e "\n══════════════════════════════════════════════════════════════"
if [[ $VALIDATION_RESULT -eq 0 ]]; then
    echo -e "  ${GREEN}✅ MIGRACIÓN COMPLETADA Y VALIDADA${NC}"
    echo "  Backup: $BACKUP_FILE"
    echo "  Para rollback: $0 --rollback"
else
    echo -e "  ${RED}⚠  MIGRACIÓN CON ERRORES — REVISAR ANTES DE CONTINUAR${NC}"
    echo "  Para rollback: $0 --rollback"
fi
echo "══════════════════════════════════════════════════════════════"
