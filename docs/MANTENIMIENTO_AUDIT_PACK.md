# Paquete Auditable de Mantenimiento — Plan Maestro

**Fecha:** 2026-04-01
**Versión:** 1.0
**Autor:** Claude (Architect + Engineer)

---

## 1. Auditoría del Estado Actual

### 1.1 Base de datos (SQLite)

| Tabla | Propósito | Registros clave |
|-------|-----------|-----------------|
| `maquinas` | Ficha de cada máquina (ID, nombre, modelo, serie, horómetro, estado, proyecto) | 8 máquinas activas |
| `maquinaria_checks` | Checks semanales del operario (checklist JSON, horómetro, fotos) | Checks con estado abierto/cerrado |
| `maquinaria_revisiones` | Revisiones por hito (legacy, tabla poco usada) | Casi vacía |
| `maquinaria_maintenance_tasks` | Definición de 20+ tareas por intervalo (100h–2000h) | 22 task codes |
| `maquinaria_maintenance_logs` | Historial real de mantenimiento completado | ~1200+ registros importados de PDFs |
| `maquinaria_incidencias` | Incidencias/averías con severidad y resolución | — |
| `maquinaria_tokens` | Tokens de acceso público para operarios | Sin login, revocables |
| `maquinaria_fotos` | Fotos adjuntas a checks/incidencias/revisiones | entidad_tipo + entidad_id |
| `maquinaria_operario_contacto` | Contacto operario para notificaciones | — |
| `maquinaria_notification_log` | Log anti-spam de notificaciones enviadas | — |

### 1.2 API existente (Blueprint `maquinaria_bp`)

**Admin (requiere login):** 30+ endpoints CRUD para máquinas, checks, revisiones, incidencias, tokens, fotos, mantenimiento, notificaciones.

**Operario público (token):** 10 endpoints bajo `/m/<token>` y `/w/<token>` para checks, incidencias, fotos, revisiones de mantenimiento.

### 1.3 Auth

- Flask-Login con sesión (admin)
- Tokens opacos en URL para operarios (sin login)
- BCrypt para passwords
- No hay roles granulares (solo "admin")

### 1.4 Exports existentes

- **PDF:** ReportLab para certificaciones de obra y presupuestos (`core/certificaciones_pdf.py`, `core/presupuestos_pdf.py`)
- **Excel:** openpyxl para facturas, tarjetas, banco (`backend.py`)
- **ZIP:** zipfile para lotes de facturas PDF
- **No existe:** Export de historial de mantenimiento, Asset Passport, Certificado CAE de maquinaria

### 1.5 Storage

- **Fotos maquinaria:** `data/fotos_maquinaria/` (local en Docker volume)
- **OneDrive/SharePoint:** Integración existente vía Microsoft Graph (`core/onedrive_db.py`, 10K+ líneas). Funcional para facturas.
- **Certificados históricos:** En OneDrive manual (`06. Activos/01. Hincadoras y perforadoras/<máquina>/01. Histórico revisiones/`)

### 1.6 Plantilla de certificado actual

Formato PDF 1 página con:
- Logo Hincado Directo (fondo negro) + datos empresa alineados a la derecha
- Cuerpo: "La empresa HINCADO DIRECTO S.L. ... CERTIFICA: Que se ha realizado la revisión a las X.XXX horas..."
- Referencia a manual del fabricante Orteco
- Firma: lugar, fecha, nombre, cargo, pie registral

### 1.7 Infraestructura

- Docker (python:3.11-slim) + Gunicorn + Caddy
- CI/CD: GitHub Actions → ghcr.io → SSH deploy
- Rama: `master` (prod), `feature/*` (dev)

---

## 2. Plan de Fases

### Fase 1 — Service History Export (PDF + Excel)

**Objetivo:** Poder exportar el historial completo de mantenimiento de una máquina en formato profesional.

**Cambios DB:**
```sql
CREATE TABLE IF NOT EXISTS maquinaria_documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id INTEGER NOT NULL REFERENCES maquinas(id),
    tipo TEXT NOT NULL CHECK(tipo IN (
        'service_history_pdf', 'service_history_xlsx',
        'certificado_cae', 'asset_passport', 'data_room_zip'
    )),
    titulo TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    hash_sha256 TEXT,
    provider TEXT DEFAULT 'local',
    canonical_path TEXT,
    generado_por TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);
```

**API nuevas:**
- `GET /api/maquinaria/maquinas/<id>/export/service-history?format=pdf|xlsx&desde=&hasta=`
- `GET /api/maquinaria/maquinas/<id>/documentos` (lista documentos generados)

**UI:**
- Botón "Exportar historial" en la ficha de máquina (dropdown: PDF / Excel)
- Sección "Documentos generados" en el detalle

**Criterios de aceptación:**
- [ ] PDF con cabecera corporativa, tabla de revisiones filtrable por fecha
- [ ] Excel con hojas: Resumen, Revisiones, Checks, Incidencias
- [ ] Documento registrado en `maquinaria_documentos` con hash
- [ ] Descargable desde la ficha de máquina

**Backend nuevo:** `core/maquinaria_exports.py`

---

### Fase 2 — Certificado CAE/PRL

**Objetivo:** Generar certificados con el mismo formato que los históricos (1 página, firma).

**Tipos de certificado:**
1. "Última revisión realizada" — certifica la revisión más reciente
2. "Revisión por hito (Xh)" — certifica una revisión específica por horómetro

**Cambios DB:** Reutiliza `maquinaria_documentos` con `tipo = 'certificado_cae'`

**API nuevas:**
- `POST /api/maquinaria/maquinas/<id>/certificado-cae` body: `{tipo: "ultima"|"hito", hito_horas: 4000}`

**UI:**
- Botón "Generar certificado" en ficha de máquina → modal con opciones
- Lista de certificados generados

**Criterios de aceptación:**
- [ ] PDF idéntico al formato histórico (logo, cuerpo, firma, pie registral)
- [ ] Datos empresa hardcodeados (Hincado Directo S.L., CIF, dirección)
- [ ] Datos máquina desde DB (modelo, serie, horómetro)
- [ ] Firmante configurable (nombre, cargo)

**Backend nuevo:** `core/maquinaria_certificado_pdf.py`

---

### Fase 3 — Asset Passport (1 página)

**Objetivo:** Resumen ejecutivo de una máquina para due diligence en 60-90 segundos.

**Contenido del PDF:**
- Identificación: ID, modelo, nº serie, año comisión, ubicación
- Horómetro actual + fecha lectura
- Próxima revisión por intervalo + "faltan X horas"
- Resumen 12-24 meses: nº preventivos, nº correctivos, días parada (si aplica)
- Última revisión certificada
- QR/Link a Auditor View (Fase 4)

**API nueva:**
- `POST /api/maquinaria/maquinas/<id>/asset-passport`

**UI:**
- Botón "Asset Passport" en ficha → genera y descarga PDF

**Criterios de aceptación:**
- [ ] PDF 1 página A4, profesional, con logo y datos corporativos
- [ ] Todos los KPIs calculados desde datos reales de la DB
- [ ] QR placeholder (se activará con Auditor View en Fase 4)

---

### Fase 4 — Auditor View Temporal

**Objetivo:** Link firmado y expirable para que un comprador/banco vea la ficha de mantenimiento sin login.

**Cambios DB:**
```sql
CREATE TABLE IF NOT EXISTS maquinaria_auditor_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    maquina_id INTEGER REFERENCES maquinas(id),
    flota_completa INTEGER DEFAULT 0,
    creado_por INTEGER REFERENCES usuarios(id),
    nombre_destinatario TEXT,
    expires_at TEXT NOT NULL,
    revocado INTEGER DEFAULT 0,
    max_accesos INTEGER,
    accesos_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maquinaria_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auditor_link_id INTEGER REFERENCES maquinaria_auditor_links(id),
    ip TEXT,
    user_agent TEXT,
    accion TEXT,
    detalle TEXT,
    created_at TEXT NOT NULL
);
```

**API nuevas:**
- `POST /api/maquinaria/auditor-link` — crea link temporal
- `GET /api/maquinaria/auditor-links` — lista links activos
- `DELETE /api/maquinaria/auditor-links/<id>` — revoca link
- `GET /audit/<token>` — página pública read-only (sin login)
- `GET /audit/<token>/passport.pdf` — descarga passport
- `GET /audit/<token>/history.pdf` — descarga historial

**Seguridad:**
- Token HMAC firmado + expiración (7-30 días configurable)
- Headers: `X-Robots-Tag: noindex`, `Cache-Control: no-store`
- Rate limiting básico (10 req/min por IP)
- Audit log de cada acceso
- No exponer: tokens operario, teléfonos, IDs internos de DB

**UI admin:**
- Sección "Compartir con auditor" en ficha de máquina
- Gestión de links activos (crear, revocar, ver accesos)

**Criterios de aceptación:**
- [ ] Link público funcional sin login
- [ ] Expiración automática
- [ ] Revocación inmediata
- [ ] Audit log completo
- [ ] Datos sensibles filtrados

---

### Fase 5 — Data Room Export (ZIP)

**Objetivo:** Export estructurado por máquina o flota completa.

**Estructura del ZIP:**
```
DataRoom_Antonella_2026-04-01/
├── 00_Asset_Passport.pdf
├── 01_Service_History.xlsx
├── 02_Certificados/
│   ├── Certificado_4000h_2025-03-10.pdf
│   └── ...
├── 03_Facturas_Taller/
│   └── (si aplica)
├── 04_Fotos_Inspecciones/
│   ├── check_1_2025-01-15.jpg
│   └── ...
└── 05_Manuales_y_Especificaciones/
    └── (placeholder o enlace)
```

**API nueva:**
- `POST /api/maquinaria/data-room` body: `{maquina_ids: [1,2,...], destinatario: "Banco X"}`

**Criterios de aceptación:**
- [ ] ZIP generado con estructura estándar
- [ ] Incluye todos los documentos generados previamente
- [ ] Incluye fotos de inspecciones
- [ ] Registro en `maquinaria_documentos`

---

## 3. Modelo StorageProvider (preparado para migración)

```python
# Fase 1: local + metadatos en DB
# Fase futura: OneDrive Graph API / S3

class StorageProvider:
    def save(self, data: bytes, canonical_path: str) -> dict  # {provider, filepath, size, hash}
    def get_url(self, doc: dict, expires_minutes=60) -> str   # link temporal
    def delete(self, doc: dict) -> bool
```

En DB siempre se guarda: `provider`, `canonical_path`, `hash_sha256`. Los links se generan on-demand. Migrar a Graph API solo requiere nueva implementación de `StorageProvider`.

---

## 4. Datos Corporativos (para certificados)

```
Empresa: HINCADO DIRECTO S.L.
CIF: B-88261458
Domicilio: Calle Francisco Luján nº2, Badajoz, 06004
Teléfonos: +34 637 70 54 33 / +34 686 27 09 37
Email: direccion@hincadodirecto.com
Web: www.hincadodirecto.com
Registro: Tomo 38499, Folio 174, Inscripción 1ª, Hoja M-684725
Firmante por defecto: Antonio Aquilino Cuenda Romero, Administrador
```
