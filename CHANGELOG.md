# Changelog - Backend API

Todos los cambios notables en la API backend serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Guía de Versionado

*   **MAJOR (X.0.0)**: Cambios en endpoints que rompen compatibilidad.
*   **MINOR (0.X.0)**: Nuevos endpoints o modelos de datos.
*   **PATCH (0.0.X)**: Fixes internos, optimizaciones de consultas.

---

## [1.3.4] - 2026-03-08
### Changed
- **Seguridad (Crítico)**: Todos los endpoints expuestos (`gastos`, `categorias`, `divisas`, `metodosPagos`, `tiposTransacciones`) ahora requieren obligatoriamente de autenticación mediante JWT (`authenticateJWT`) o API Key maestro de N8N (`combinedAuth`).
- **Seguridad**: Configuración estricta de CORS en `app.js` permitiendo explícitamente `controlalo.com.ar` y `localhost`.
- **Seguridad**: Límite de tamaño de Payload HTTP reducido mediante `express.json({ limit: '1mb' })`.
- **Login**: Se unificaron los mensajes de error en `login.js` a un genérico *'Credenciales inválidas'* para evitar la enumeración de usuarios.

### Removed
- **Legacy**: Se deprecó y movió el archivo `audio.js` a la carpeta `src/legacy/` dado que el análisis de texto y voz es manejado externamente por Langchain en N8N.


## [1.3.3] - 2026-03-08
### Added
- **Usuarios**: Se agregó el nuevo endpoint `GET /api/usuarios` protegido por API Key, el cual devuelve una lista plana de usuarios y todos sus teléfonos asociados. Esto fue diseñado específicamente para la iteración de recordatorios diarios mediante flujos automatizados de n8n.

## [1.3.2] - 2026-03-03
### Changed
- **Movimientos**: Se reemplazó el middleware estricto de llave de API (`apiKeyMiddleware`) en el endpoint de creación `POST /api/gastos/registrar-gasto-telefono` por un sistema doble `combinedAuth`. Ahora acepta inserciones tanto de WhatsApp Bot como de la sesión del Dashboard web.

## [1.3.1] - 2026-03-03
### Changed
- **Movimientos (n8n)**: Se actualizó el endpoint de borrado (`DELETE`) y actualización (`PUT`) de `GastosPruebaN8N` para utilizar `combinedAuth` en lugar de requerir estrictamente el API Key. Esto permite que los usuarios puedan eliminar y modificar los registros ingresados vía WhatsApp directamente desde el dashboard, validando su propiedad mediante sus teléfonos asociados.

## [1.3.0] - 2026-02-27
### Added
- Nueva utilidad `obtenerVariantesTelefono` en `phoneUtils.js` que genera combinaciones automáticas con y sin el prefijo "9" (Argentina).
- Soporte para variantes de teléfono en los endpoints de `login`, `preferencias`, `registro` y `consulta de gastos`.

### Fixed
- **Gastos**: Corregido error de variable no definida `telefonoNormalizado` en endpoints de consulta por teléfono.
- **Login**: Mayor flexibilidad al iniciar sesión usando el número de teléfono con o sin el dígito "9" extra.

## [1.2.3] - 2026-02-22
### Added
- Endpoint `GET /api/preferencias/por-telefono/:telefono` para extracción de catálogos para n8n.
- Lógica de `seedUserDefaults` para inicializar categorías, divisas y medios de pago al registrarse.
- Seguridad `x-api-key` en endpoints de preferencias y gastos por teléfono para integraciones externas.
### Fixed
- Bugs en las rutas PUT de `divisas`, `metodosPagos` y `tiposTransacciones`.

## [1.2.2] - 2026-02-22

### Corregido
- **Movimientos (n8n)**: Se mejoró la flexibilidad en la búsqueda de teléfonos en el endpoint `consulta-telefono-pruebas`, permitiendo encontrar registros guardados sin el prefijo `549` o con prefijo `54`. Esto asegura que no se pierdan movimientos de la tabla `GastosPruebaN8N` por discrepancias de formato.

## [1.2.1] - 2026-02-17

### Corregido
- **Teléfonos**: Estandarización de formato a `549...` eliminando espacios y prefijos redundantes.
- **Movimientos**: Corrección de bug donde los movimientos de nuevos usuarios no se visualizaban por discrepancia en formato de teléfono. Ahora se buscan ambos formatos (con y sin `549`).
- **Google Login**: Corrección de duplicación de usuarios por sensibilidad a mayúsculas en emails.

## [1.2.0] - 2026-02-17

### Agregado
- **WhatsApp**: Integración nativa con Meta Cloud API para envío de códigos de verificación.
- **Onboarding**: Soporte para vinculación de teléfono como paso posterior al registro (Progressive Onboarding).
- **Seguridad**: Validación de tokens expirados en 10 minutos para coincidir con plantilla de WhatsApp.

### Cambiado
- **WhatsApp**: Reemplazo de webhook n8n por llamada directa a Meta API.
- **WhatsApp**: Uso de plantilla oficial de autenticación `template_ccontrolalo_login_v1`.
- **Usuarios**: Lógica para asignar teléfono principal si el usuario no tiene uno (ej. Google Login).

## [1.1.0] - 2026-01-08

### Agregado
- **Deudas**: Soporte para actualización de créditos (PUT `/api/deudas/:id`).
- **Base de Datos**: Nueva columna `cantidad_cuotas` en tabla `deudas`.
- **Prestamos**: Actualizaciones en rutas y lógica de negocio.

### Cambiado
- **Core**: Mejoras en `app.js` y configuración de base de datos (`db.sql`).
- **Modelos**: Refactorización de modelos Sequelize (`index.js`, `deudas.js`).

## [1.0.0] - 2025-12-10

### Características
- **API REST**: Endpoints completos para gestión de `usuarios`, `gastos`, `categorias`.
- **Seguridad**: Autenticación vía JWT y hashing de contraseñas.
- **IA**: Endpoint `/api/audio` para procesamiento de lenguaje natural con OpenAI.
- **DB**: Configuración inicial de Sequelize para MySQL/PostgreSQL.
