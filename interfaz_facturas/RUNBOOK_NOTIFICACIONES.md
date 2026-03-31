# Runbook: Notificaciones de Mantenimiento de Maquinaria

## Arquitectura

El sistema de notificaciones detecta cuándo una máquina alcanza las horas de revisión según el manual Orteco HD 800-1000, y envía un aviso al operario con un link directo al formulario de esa tarea.

### Flujo
1. Operario reporta horómetro en check semanal (`/m/<token>`)
2. Job diario (`check_maintenance_due.py`) calcula tareas pendientes
3. Si hay tareas due y no se notificó esta semana → envía WhatsApp/SMS
4. Operario recibe link → abre formulario específico (`/w/<token>/mantenimiento?task=...`)
5. Operario completa checklist + fotos → se registra en DB
6. La tarea queda "cerrada" hasta el siguiente ciclo de horas

### Anti-spam
- Máximo 1 notificación por semana por combinación (máquina + tarea)
- Constraint UNIQUE en DB: `(maquina_id, task_code, week_iso)`
- Si el operario completa la tarea, no vuelve a notificar hasta el siguiente umbral

---

## Variables de entorno

```bash
# Twilio (WhatsApp + SMS)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886    # Número WhatsApp Business
TWILIO_SMS_FROM=+1234567890                    # Número SMS (fallback)

# ERP
ERP_BASE_URL=https://erp.hincadodirecto.com   # Base URL para los links
NOTIFICACIONES_MAQUINARIA_ENABLED=true         # Activar envío real (false = solo logs)
```

### Configurar en Docker (docker-compose.yml)
```yaml
services:
  hincado-erp:
    environment:
      - TWILIO_ACCOUNT_SID=ACxxxx
      - TWILIO_AUTH_TOKEN=xxxx
      - TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
      - TWILIO_SMS_FROM=+1234567890
      - ERP_BASE_URL=https://erp.hincadodirecto.com
      - NOTIFICACIONES_MAQUINARIA_ENABLED=true
```

---

## Configuración de Twilio

### 1. Crear cuenta Twilio
1. Ir a https://www.twilio.com/try-twilio
2. Verificar tu número de teléfono
3. Copiar Account SID y Auth Token del dashboard

### 2. Activar WhatsApp Sandbox (desarrollo)
1. Ir a Twilio Console → Messaging → Try it out → Send a WhatsApp message
2. El sandbox usa el número `+14155238886`
3. Cada operario debe enviar "join <código>" al sandbox para activarse
4. Esto es solo para desarrollo. En producción:

### 3. WhatsApp Business API (producción)
1. En Twilio Console → Messaging → Senders → WhatsApp senders
2. Solicitar número WhatsApp Business propio
3. Aprobar plantilla de mensaje con Meta
4. Actualizar `TWILIO_WHATSAPP_FROM` con el número aprobado

### 4. SMS (fallback)
1. En Twilio Console → Phone Numbers → Buy a number
2. Comprar número con capacidad SMS
3. Poner en `TWILIO_SMS_FROM`

### Coste estimado
- WhatsApp Business: ~0.05 EUR/mensaje
- SMS España: ~0.07 EUR/mensaje
- Con 7 máquinas y ~5 tareas due/semana = ~1.75 EUR/semana

---

## Ejecutar el job

### Manualmente (test)
```bash
# Dry-run: ver qué se enviaría sin enviar nada
python scripts/check_maintenance_due.py --dry-run

# Dry-run para una máquina específica
python scripts/check_maintenance_due.py --machine 1

# Ejecución real
python scripts/check_maintenance_due.py

# Salida JSON (para parsear programáticamente)
python scripts/check_maintenance_due.py --dry-run --json
```

### Desde Docker
```bash
# Dry-run en producción
docker exec hincado-erp python scripts/check_maintenance_due.py --dry-run

# Ejecución real en producción
docker exec hincado-erp python scripts/check_maintenance_due.py
```

### Programar en cron (producción)
```bash
# Editar crontab del servidor
crontab -e

# Añadir: ejecutar a las 8:00 cada día
0 8 * * * docker exec hincado-erp python scripts/check_maintenance_due.py >> /var/log/maintenance_notify.log 2>&1
```

### Desde la API del ERP (admin)
```bash
# Dry-run via API
curl -X POST https://erp.hincadodirecto.com/api/maquinaria/maintenance/notify \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}' \
  -b "session=<cookie>"

# Ejecución real via API
curl -X POST https://erp.hincadodirecto.com/api/maquinaria/maintenance/notify \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}' \
  -b "session=<cookie>"
```

---

## Ver logs de envíos

### Via API
```bash
# Todas las notificaciones
curl https://erp.hincadodirecto.com/api/maquinaria/notifications/log -b "session=<cookie>"

# Filtrar por máquina
curl "https://erp.hincadodirecto.com/api/maquinaria/notifications/log?machine_id=1" -b "session=<cookie>"
```

### Via DB directa
```sql
SELECT nl.*, m.nombre as maquina
FROM maquinaria_notification_log nl
JOIN maquinas m ON m.id = nl.maquina_id
ORDER BY nl.created_at DESC
LIMIT 20;
```

### Via logs del servidor
```bash
# En Docker
docker logs hincado-erp 2>&1 | grep "notificaciones"

# Log file
cat /app/data/logs/erp.log | grep "WhatsApp\|SMS\|notificacion"
```

---

## Activar/desactivar notificaciones

### Para todo el sistema
```bash
# Desactivar: poner variable de entorno a false
NOTIFICACIONES_MAQUINARIA_ENABLED=false

# O simplemente no configurar Twilio (envíos fallarán silenciosamente)
```

### Para un operario específico
```bash
# Via API: desactivar notificaciones para token_id=5
curl -X PUT https://erp.hincadodirecto.com/api/maquinaria/operario-contacto/5/toggle \
  -H "Content-Type: application/json" \
  -d '{"activas": false}' \
  -b "session=<cookie>"
```

---

## Tareas de mantenimiento configuradas

Basadas en el manual Orteco HD 800-1000 (páginas 76-77):

### Mantenedor — cada 100h

| Código | Tarea | Notas |
|--------|-------|-------|
| REDUCTORES_ORUGAS_100H | Reductores orugas — Control nivel aceite + Sustitución aceite (1ª vez) | (1) Sustitución solo la 1ª vez |
| CADENA_ELEVACION_100H | Cadena elevación martillo — Limpieza, lubricación y control | (2) Mayor frecuencia si uso intensivo |
| PATIN_LUBRICACION_100H | Patín — Lubricación | Ref: Esquema de lubricación |
| INTERIOR_COLUMNA_100H | Interior columna — Lubricación | Ref: Esquema de lubricación |
| BARRENA_ACEITE_100H | Barrena — Sustitución aceite (1ª vez) | (1) Sustitución solo la 1ª vez |
| SACAMUESTRAS_ENGRASAR_100H | Sacamuestras — Engrasar | Ref: Mantenimiento del sacamuestras |
| PERFORADOR_RP500_100H | Perforador (RP500) — Control nivel aceite reductor + Regulación resortes | Ref: Mantenimiento del perforador |

### Mantenedor — cada 250h

| Código | Tarea | Taller |
|--------|-------|--------|
| ORUGAS_TENSION_250H | Orugas — Control tensión | No |

### Mantenedor — cada 500h

| Código | Tarea | Taller |
|--------|-------|--------|
| HIDRAULICO_NIVEL_500H | Depósito aceite hidráulico — Control nivel del aceite | No |
| PINZA_EXTRACCION_500H | Pinza de extracción postes — Limpieza + Engrasar | No |
| LEVANTADOR_GUARDARRAILES_500H | Levantador de guardarraíles — Engrasar | No |

### Mantenedor — cada 1000h

| Código | Tarea | Taller |
|--------|-------|--------|
| REDUCTOR_ORUGAS_ACEITE_1000H | Reductor orugas — Sustitución aceite | No |
| FILTRO_HIDRAULICO_ENVIO_1000H | Filtro aceite hidráulico en envío — Control atascamiento + Sustitución cartucho | No |
| FILTRO_HIDRAULICO_DESCARGA_1000H | Filtro aceite hidráulico en descarga — Sustitución cartucho filtrante | No |
| BARRENA_ACEITE_REDUCTOR_1000H | Barrena — Sustitución aceite del reductor | No |
| PERFORADOR_ACEITE_REDUCTOR_1000H | Perforador — Sustitución aceite del reductor | No |

### Técnico especializado — cada 250h

| Código | Tarea | Taller |
|--------|-------|--------|
| MEMBRANA_ACUMULADOR_250H | Membrana acumulador martillo de percusión — Control estado | Sí |
| TIRANTES_PERNOS_250H | Tirantes y pernos — Control de estado y apriete | No |

### Técnico especializado — cada 1000h

| Código | Tarea | Taller |
|--------|-------|--------|
| CADENA_ELEVACION_1000H | Cadena de elevación martillo de percusión — Sustitución | Sí |

### Técnico especializado — cada 2000h

| Código | Tarea | Taller |
|--------|-------|--------|
| DEPOSITO_HIDRAULICO_2000H | Depósito aceite hidráulico — Sustitución aceite | Sí |

---

## Configurar contacto de operario

Al crear un token, también hay que asociar el teléfono:

```bash
curl -X POST https://erp.hincadodirecto.com/api/maquinaria/operario-contacto \
  -H "Content-Type: application/json" \
  -d '{"token_id": 1, "telefono": "+34612345678", "canal": "whatsapp"}' \
  -b "session=<cookie>"
```

Formato teléfono: E.164 (con prefijo país, ej: +34612345678)

---

## Troubleshooting

### "Twilio no configurado"
Variables de entorno TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN no están definidas.

### "Token inválido o expirado"
El token del operario ha expirado o fue desactivado. Reactivar desde admin:
```bash
curl -X PUT https://erp.hincadodirecto.com/api/maquinaria/tokens/<id>/reactivar \
  -H "Content-Type: application/json" \
  -d '{"dias_validez": 90}' \
  -b "session=<cookie>"
```

### Notificación no se envió
1. Verificar que `NOTIFICACIONES_MAQUINARIA_ENABLED=true`
2. Verificar que el operario tiene teléfono configurado
3. Verificar que no se envió ya esta semana (consultar notification_log)
4. Ejecutar con `--dry-run` para ver el estado

### WhatsApp sandbox: operario no recibe
En modo sandbox, cada destinatario debe enviar "join <código>" al número de sandbox primero. En producción con WhatsApp Business API esto no es necesario.
