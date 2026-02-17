# Changelog - Backend API

Todos los cambios notables en la API backend serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Guía de Versionado

*   **MAJOR (X.0.0)**: Cambios en endpoints que rompen compatibilidad.
*   **MINOR (0.X.0)**: Nuevos endpoints o modelos de datos.
*   **PATCH (0.0.X)**: Fixes internos, optimizaciones de consultas.

---

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
