# HD | ERP — Plan secuencial paso a paso

> Última actualización: 25 marzo 2026  
> Regla: completar cada paso antes de pasar al siguiente  
> 🤖 = Claude Code · 👤 = Javier/Sergio · 🔄 = decidís vosotros, implementa Claude

---

## ✅ YA COMPLETADO (no hay que hacer nada)

Finanzas (facturas, bancos, tarjetas, tesorería), CRM (empresas, contactos, interacciones, oportunidades), Presupuestos (catálogo, pricing, PDF, versionado, T&C), Proyectos (pipeline, dashboard 9 secciones, partes, recursos, documentos, costes), Transporte (rutas, 780 transportistas), UX/UI global, visibilidad cruzada CRM↔Presupuestos↔Proyectos.

---

## PASO 1 — Subir el proyecto a GitHub de forma segura
*Sin esto no podéis trabajar los dos ni tener backup del código*

- [ ] 🤖 1.1 Crear `.env.example` con todas las variables (sin valores reales)
- [ ] 🤖 1.2 Revisar `.gitignore` para excluir `.env`, `data/`, `*.db`, logs, IDE
- [ ] 👤 1.3 Verificar que no hay secretos en el historial de git (`git log --all --diff-filter=A -- .env`)
- [ ] 👤 1.4 Si hay secretos expuestos: revocar API keys y generar nuevas
- [ ] 👤 1.5 Hacer `git push -u origin main` al repo privado de GitHub
- [ ] 👤 1.6 El socio clona el repo y verifica que arranca con su `.env` local
- [ ] 👤 1.7 Acordar norma básica: `git pull` antes de trabajar, nunca commitear secretos

## PASO 2 — Vincular facturas de cliente con proyectos
*Ahora busca por nombre con LIKE — poco fiable. Necesita FK directa*

- [ ] 🤖 2.1 Añadir `proyecto_id` FK a tabla `facturas_cliente` (migración BD)
- [ ] 🤖 2.2 Añadir select de proyecto en el modal de edición de factura cliente
- [ ] 🤖 2.3 Actualizar dashboard de proyecto para usar FK directa en vez de LIKE
- [ ] 👤 2.4 Vincular las facturas existentes con sus proyectos correspondientes

## PASO 3 — Certificaciones de avance
*Depende del paso 2 (facturas vinculadas a proyectos)*

- [ ] 🤖 3.1 Crear tabla `certificaciones` (proyecto_id, fecha_desde, fecha_hasta, tipo, importe, estado)
- [ ] 🤖 3.2 Endpoint para generar certificación desde partes de trabajo entre dos fechas
- [ ] 🤖 3.3 Modalidad por hincas: suma hincas de partes × precio unitario del proyecto
- [ ] 🤖 3.4 Modalidad por horas: suma horas de partes × precio hora del proyecto
- [ ] 🤖 3.5 Sección "Certificaciones" en el tab Operativo del dashboard de proyecto
- [ ] 🤖 3.6 Vincular certificación con factura de cliente (un click para generar la factura)
- [ ] 🤖 3.7 Generar PDF de certificación
- [ ] 👤 3.8 Validar que el formato coincide con lo que piden vuestros clientes

## PASO 4 — Dashboard Finanzas v2
*Con presupuestos y certificaciones ya hechos, el dashboard financiero tiene datos reales*

- [ ] 🔄 4.1 Definir qué KPIs queréis ver en el dashboard de Finanzas → Claude implementa
- [ ] 🤖 4.2 Métricas globales: facturación total mes/año, cobros pendientes, pagos pendientes
- [ ] 🤖 4.3 Gráfico de facturación mensual (barras: clientes vs proveedores)
- [ ] 🤖 4.4 Tabla de rentabilidad por proyecto (presupuestado vs facturado vs costes vs margen)
- [ ] 🤖 4.5 Pipeline comercial: presupuestos en negociación con importe estimado
- [ ] 🤖 4.6 Previsión de tesorería mejorada (incorporando datos de certificaciones pendientes)

## PASO 5 — Tests y prueba de humo
*Antes de meter más módulos, asegurar que lo construido no se rompe*

- [ ] 🤖 5.1 Crear `docs/HUMO_ERP.md` con recorrido manual de 15 min (login → facturas → CRM → presupuesto → proyecto → PDF)
- [ ] 🤖 5.2 Verificar que `pytest` pasa con los tests existentes
- [ ] 🤖 5.3 Añadir tests básicos para presupuestos y dashboard de proyecto
- [ ] 👤 5.4 Ejecutar la prueba de humo completa y reportar si algo falla

## PASO 6 — Despliegue en servidor
*Para que el ERP sea accesible por más de una persona a la vez*

- [ ] 🔄 6.1 Decidir dónde: VPS (Hetzner ~5€/mes), oficina, u otro → Claude configura
- [ ] 🤖 6.2 Configurar Waitress como servidor WSGI (no flask run en producción)
- [ ] 🤖 6.3 Crear plantilla de servicio (systemd en Linux / NSSM en Windows)
- [ ] 🤖 6.4 Crear RUNBOOK: cómo arrancar, parar, ver logs, actualizar código, restaurar backup
- [ ] 👤 6.5 Contratar servidor / preparar máquina
- [ ] 👤 6.6 Instalar Python, dependencias, copiar código y BD
- [ ] 👤 6.7 Configurar variables de entorno reales (`.env` con API keys)
- [ ] 👤 6.8 Iniciar servicio y verificar que la app funciona desde otro ordenador
- [ ] 👤 6.9 Si acceso desde internet: configurar HTTPS (Caddy o nginx como proxy)

## PASO 7 — Multi-usuario
*Depende del paso 6 (servidor accesible). Ahora mismo un solo login para todos*

- [ ] 🔄 7.1 Decidir roles: admin, usuario, solo_lectura (u otros) → Claude implementa
- [ ] 🔄 7.2 Decidir algoritmo hash: bcrypt (recomendado) → Claude implementa
- [ ] 🤖 7.3 Tabla `usuarios` en BD con hash de contraseña
- [ ] 🤖 7.4 Login contra BD (sustituir login actual contra .env)
- [ ] 🤖 7.5 Protección de todas las rutas API con sesión (401 si no logueado, 403 si sin permiso)
- [ ] 🤖 7.6 Pantalla de gestión de usuarios (crear, editar, desactivar, cambiar contraseña)
- [ ] 👤 7.7 Crear los usuarios reales de la empresa (contraseñas las ponéis vosotros)

## PASO 8 — Backup y seguridad
*Con el servidor en marcha, proteger los datos*

- [ ] 🤖 8.1 Script de backup automatizado (copia gestion.db + archivos adjuntos)
- [ ] 🤖 8.2 Logging con niveles (sustituir prints por logging con rotación)
- [ ] 🤖 8.3 Endpoint GET /api/health para monitorizar que la app está viva
- [ ] 🤖 8.4 Fijar versiones en requirements.txt
- [ ] 👤 8.5 Configurar cron/tarea programada para backup diario
- [ ] 👤 8.6 Probar restaurar desde un backup (simulacro de desastre)
- [ ] 👤 8.7 Decidir dónde guardar backups (disco externo, nube, OneDrive)

## PASO 9 — Maquinaria y mantenimiento
*Incorporar los checklists ORTECO del proyecto de Sergio*

- [ ] 🔄 9.1 Decidir: tablas nuevas en gestion.db (recomendado, más simple) → Claude implementa
- [ ] 🤖 9.2 Tabla `maquinas` (nombre, tipo, modelo, serie, horómetro, ubicación, estado, foto)
- [ ] 🤖 9.3 Tabla `maquina_checks` (check semanal con ítems del manual ORTECO)
- [ ] 🤖 9.4 Tabla `maquina_revisiones` (revisiones por horómetro: 100h, 250h, 500h, 1000h, 2000h)
- [ ] 🤖 9.5 Tabla `maquina_incidencias` (con severidad y estado)
- [ ] 🤖 9.6 Seed data: ítems del checklist ORTECO por tipo de revisión
- [ ] 🤖 9.7 API Flask bajo /api/maquinaria/
- [ ] 🤖 9.8 Sección "Maquinaria" en el sidebar del ERP con subsecciones
- [ ] 🤖 9.9 Vista mobile-first para uso en taller (botones grandes, checklist táctil)
- [ ] 👤 9.10 Sergio valida que los checklists coinciden con el manual ORTECO real
- [ ] 🤖 9.11 Vincular máquinas con proyecto_recursos del dashboard de proyecto
- [ ] 🤖 9.12 Script para migrar datos existentes del proyecto de Sergio (si los hay)
- [ ] 👤 9.13 Ejecutar migración y validar datos

## PASO 10 — RRHH básico
*Con maquinaria y proyectos, falta el tercer pilar: las personas*

- [ ] 🔄 10.1 Definir qué datos de empleados necesitáis → Claude implementa
- [ ] 🤖 10.2 Tabla `empleados` (nombre, puesto, fecha alta/baja, teléfono, documentación)
- [ ] 🤖 10.3 Asignación de empleados a proyectos (vincular con proyecto_recursos)
- [ ] 🤖 10.4 Seguimiento de nóminas (tracking de pagos — el cálculo lo hace la asesoría)
- [ ] 🤖 10.5 Adelantos y liquidaciones
- [ ] 🤖 10.6 Sección "RRHH" en el sidebar del ERP
- [ ] 👤 10.7 Cargar datos reales de empleados

## PASO 11 — Flota de vehículos
- [ ] 🤖 11.1 Tabla `vehiculos` (matrícula, tipo, marca, modelo, km, asignación)
- [ ] 🤖 11.2 Mantenimiento básico (ITV, seguro, revisiones, combustible)
- [ ] 🤖 11.3 Interfaz en sidebar
- [ ] 👤 11.4 Cargar datos de pickups reales

## PASO 12 — Seguros
- [ ] 🤖 12.1 Tabla `polizas` (tipo, aseguradora, cobertura, prima, vencimiento)
- [ ] 🤖 12.2 Alertas automáticas de renovación
- [ ] 🤖 12.3 Siniestros vinculados a proyecto
- [ ] 👤 12.4 Cargar datos de pólizas reales

## PASO 13 — Impuestos y fiscal
- [ ] 🔄 13.1 Definir modelos fiscales y fechas (303, 111, 200, etc.) → Claude implementa
- [ ] 🤖 13.2 Calendario fiscal con alertas
- [ ] 🤖 13.3 Seguimiento de presentación (la asesoría presenta, vosotros controláis)
- [ ] 🤖 13.4 Provisiones estimadas IVA/IRPF/IS

## PASO 14 — Governance
- [ ] 🤖 14.1 Repositorio de documentos societarios (escrituras, poderes, actas)
- [ ] 🤖 14.2 Registro de titularidad real con vencimientos

## PASO 15 — Mejoras técnicas y UX
*Se puede hacer en cualquier momento, no bloquea nada*

- [ ] 🤖 15.1 Refactoring backend.py (5300+ líneas → módulos separados)
- [ ] 🤖 15.2 Búsqueda global (encontrar proyecto/presupuesto/empresa desde cualquier sitio)
- [ ] 🤖 15.3 Paginación en tablas grandes
- [ ] 🤖 15.4 PWA para partes de trabajo en campo (móvil)
- [ ] 🔄 15.5 OneDrive/Google Drive para documentos → Equipo configura credenciales
- [ ] 🤖 15.6 Email automático desde CRM (👤 Equipo configura SMTP)

---

## Resumen visual del orden

```
PASO 1  GitHub seguro
  ↓
PASO 2  Facturas ↔ Proyectos (FK)
  ↓
PASO 3  Certificaciones de avance
  ↓
PASO 4  Dashboard Finanzas v2
  ↓
PASO 5  Tests y prueba de humo
  ↓
PASO 6  Despliegue en servidor
  ↓
PASO 7  Multi-usuario
  ↓
PASO 8  Backup y seguridad
  ↓
PASO 9  Maquinaria (checklists ORTECO)
  ↓
PASO 10 RRHH
  ↓
PASO 11 Flota vehículos
  ↓
PASO 12 Seguros
  ↓
PASO 13 Impuestos
  ↓
PASO 14 Governance
  ↓
PASO 15 Mejoras técnicas (paralelo)
```

---

*🤖 = prompt en Claude Code · 👤 = lo hacéis vosotros · 🔄 = decidís, implementa Claude*
*Ir marcando `[x]` a medida que avancéis. Un paso tras otro.*
