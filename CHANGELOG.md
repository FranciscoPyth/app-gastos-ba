# Changelog - Backend API

Todos los cambios notables en la API backend serÃ¡n documentados en este archivo.

El formato estÃ¡ basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## GuÃ­a de Versionado

*   **MAJOR (X.0.0)**: Cambios en endpoints que rompen compatibilidad.
*   **MINOR (0.X.0)**: Nuevos endpoints o modelos de datos.
*   **PATCH (0.0.X)**: Fixes internos, optimizaciones de consultas.

## [1.4.3] - 2026-04-12
### Fixed
- **Validación de Teléfonos**: Se actualizó `normalizarTelefono` para aplicar la lógica obligatoria del prefijo interno `+549` de WhatsApp de forma exclusiva si el código de país indicado por el frontend es explícitamente `AR` (Argentina), permitiendo la internacionalización plena del sistema para otros países.
- **Registro API (WhatsApp)**: Se mejoró el manejo de errores del Cloud API de Meta en el endpoint `/init-verification`. En caso de un envío fallido por problemas de conectividad o número inexistente, ahora se interrumpe y borra proactivamente la base de datos temporal, y se contesta un HTTP 400 detallando el error al frontend en lugar de un falso positivo silencioso.

## [1.4.2] - 2026-04-05
### Fixed
- **Google Auth**: Se ampliaron los datos extraídos durante el inicio de sesión o registro con Google, guardando ahora la foto de perfil (picture) y el nombre real del usuario para evitar cuentas visualmente rotas o cortadas.
- **Autenticación con Google**: Se implementó la lógica para respetar el parámetro ememberSession, extendiendo la vigencia del token JWT a 7 días en estos casos.

## [1.4.1] - 2026-04-02
### Fixed
- **Mapeo de Datos (IA)**: Se corrigieron inconsistencias en el mapeo de datos entre los parÃ¡metros de la IA (inglÃ©s) y las entidades de la base de datos (espaÃ±ol) para `nombre_persona`, `divisa` en PrÃ©stamos, y `nombre_acreedor`, `divisa` en Deudas.
- **Fechas**: La `fecha_vencimiento` o `fecha_fin` para PrÃ©stamos y Deudas ahora se registra como `null` en lugar de autocompletarse errÃ³neamente con la fecha actual cuando no se proporciona una.
- **Objetivos**: Se corrigiÃ³ el mapeo del campo `descripcion` al crear nuevos Objetivos.

## [1.4.0] - 2026-03-28
### Security Hardening
- **Secretos JWT**: Se eliminaron los valores por defecto en cÃ³digo para `ACCESS_TOKEN_SECRET` y `REFRESH_TOKEN_SECRET`. Ahora el servidor exige su presencia en el `.env` (en producciÃ³n) para arrancar.
- **ProtecciÃ³n contra Fuerza Bruta (Rate Limiting)**: Se implementÃ³ `express-rate-limit` globalmente (100 req/15min) y con polÃ­ticas estrictas para `/api/login`, `/api/google-login` y `/api/register` (5 intentos por minuto).
- **MitigaciÃ³n IDOR (Insecure Direct Object Reference)**:
    - Rutas de `gastos`: Ahora valida estrictamente que el `usuario_id` pertenezca al usuario autenticado (JWT) en operaciones GET, PUT y DELETE.
    - Rutas de `ia-integration`: Se blindaron todos los endpoints financieros para impedir que un usuario consulte o modifique datos de otros pasando un `numero_cel` ajeno.
- **Seguridad OTP**: Los cÃ³digos de verificaciÃ³n de 6 dÃ­gitos enviados por WhatsApp ahora se almacenan usando hashing con `bcrypt`, eliminando el riesgo de exposiciÃ³n de cÃ³digos activos en la base de datos.
- **SincronizaciÃ³n de Base de Datos**: Se restringiÃ³ el uso de `alter: true` en Sequelize Ãºnicamente a entornos de desarrollo, previniendo alteraciones accidentales de esquema en producciÃ³n.

### Improved Sync & Integration
- **Deudas/Prestamos (WhatsApp Sync)**: Se mejorÃ³ la lÃ³gica de "Forward Sync" para que las deudas y prÃ©stamos se creen automÃ¡ticamente si el acreedor/deudor no existe, incluso si el bot categoriza el movimiento como "Egreso".
- **IA Integration Fix**: Se corrigieron las discrepancias de mapeo entre los campos de la base de datos (espaÃ±ol) y los parÃ¡metros de la IA (inglÃ©s) para asegurar que las deudas y prÃ©stamos se guarden correctamente.

### Changed
- **Middleware Unificado**: Se centralizÃ³ la lÃ³gica de `combinedAuth` para asegurar que el flag `req.isSystem` estÃ© presente y sea consistente en todo el enrutador.

## [1.3.7] - 2026-03-27
### Added
- **Inteligencia Forward Sync**: El enrutador `POST /api/gastos/registrar-gasto-telefono` ahora es capaz de enrutar orgÃ¡nicamente los montos e historial hacia tablas secundarias (`Objetivos`, `Deudas`, y `Prestamos`) mediante la simple lectura semÃ¡ntica de su categorÃ­a en tiempo de ejecuciÃ³n.
- **UnificaciÃ³n de Consultas (GET)**: Se rediseÃ±Ã³ la obtenciÃ³n de data financiera bajo `/api/ia-integration/estado-financiero`, proveyendo de manera absoluta las tarjetas de prÃ©stamos, deudas y metas activas en un Ãºnico payload ultraligero que permite reducir el consumo y entropÃ­a en llamadas de LangChain.

## [1.3.6] - 2026-03-24
### Added
- **Usuarios**: Se incorporÃ³ el campo `foto_perfil` (tipo `LONGTEXT`) para almacenar la imagen de perfil en Base64.
- **Perfil Endpoint**: Nueva ruta `PUT /api/usuarios/perfil` para actualizar la foto de perfil mediante JWT.
- **AutenticaciÃ³n / Login**: Ambos flujos de inicio de sesiÃ³n (`login` y `googleAuth`) ahora devuelven e inyectan la propiedad `foto_perfil` en los payloads retornados al frontend.

### Changed
- **AutenticaciÃ³n Unificada (Fix de Destructuring)**: Se ajustÃ³ crÃ­ticamente el middleware `combinedAuth` debido a un error de tipeo en las importaciones, y se inyectÃ³ explÃ­citamente `req.user` para subsanar los conflictos que causaban "Acceso denegado" al invocar endpoints de IA desde sesiones Web (JWT).
- **Procesamiento de Entidades (SincronizaciÃ³n)**: Se modificÃ³ profundamente la lÃ³gica detrÃ¡s de `DELETE /api/gastosPruebaN8N/:id` de manera que eliminar un movimiento proveniente de Objetivos, PrÃ©stamos o Deudas reversarÃ¡/restarÃ¡ orgÃ¡nicamente ese nÃºmero en la tabla de su entidad origen, manteniendo un status de balance contable 100% consistente a lo largo del sistema.

## [1.3.5] - 2026-03-08
### Added
- **Usuarios**: Se agregÃ³ el campo `has_completed_onboarding` (boolean, default true) al modelo `Usuarios` para controlar si el usuario pasÃ³ por la pantalla de bienvenida.
- **Onboarding**: Nuevo endpoint seguro `POST /api/usuarios/complete-onboarding` para marcar como completado el flujo inicial del usuario mediante su JWT.

### Changed
- **Registro**: Al crear una cuenta en `/api/register`, ahora el usuario se guarda con `has_completed_onboarding: false` forzosamente, habilitando el disparo del flujo al loguearse.
- **Login**: Mejoras de respuesta en el endpoint de autenticaciÃ³n. El objeto `user` retornado ahora expone si el usuario completÃ³ el onboarding.
- **VerificaciÃ³n Temprana**: El endpoint `/init-verification` ahora valida si el nombre de usuario o email estÃ¡n ocupados en la BD *antes* de proceder a enviar el cÃ³digo de validaciÃ³n por WhatsApp, ahorrando costos de API.

---

## [1.3.4] - 2026-03-08
### Changed
- **Seguridad (CrÃ­tico)**: Todos los endpoints expuestos (`gastos`, `categorias`, `divisas`, `metodosPagos`, `tiposTransacciones`) ahora requieren obligatoriamente de autenticaciÃ³n mediante JWT (`authenticateJWT`) o API Key maestro de N8N (`combinedAuth`).
- **Seguridad**: ConfiguraciÃ³n estricta de CORS en `app.js` permitiendo explÃ­citamente `controlalo.com.ar` y `localhost`.
- **Seguridad**: LÃ­mite de tamaÃ±o de Payload HTTP reducido mediante `express.json({ limit: '1mb' })`.
- **Login**: Se unificaron los mensajes de error en `login.js` a un genÃ©rico *'Credenciales invÃ¡lidas'* para evitar la enumeraciÃ³n de usuarios.

### Removed
- **Legacy**: Se deprecÃ³ y moviÃ³ el archivo `audio.js` a la carpeta `src/legacy/` dado que el anÃ¡lisis de texto y voz es manejado externamente por Langchain en N8N.


## [1.3.3] - 2026-03-08
### Added
- **Usuarios**: Se agregÃ³ el nuevo endpoint `GET /api/usuarios` protegido por API Key, el cual devuelve una lista plana de usuarios y todos sus telÃ©fonos asociados. Esto fue diseÃ±ado especÃ­ficamente para la iteraciÃ³n de recordatorios diarios mediante flujos automatizados de n8n.

## [1.3.2] - 2026-03-03
### Changed
- **Movimientos**: Se reemplazÃ³ el middleware estricto de llave de API (`apiKeyMiddleware`) en el endpoint de creaciÃ³n `POST /api/gastos/registrar-gasto-telefono` por un sistema doble `combinedAuth`. Ahora acepta inserciones tanto de WhatsApp Bot como de la sesiÃ³n del Dashboard web.

## [1.3.1] - 2026-03-03
### Changed
- **Movimientos (n8n)**: Se actualizÃ³ el endpoint de borrado (`DELETE`) y actualizaciÃ³n (`PUT`) de `GastosPruebaN8N` para utilizar `combinedAuth` en lugar de requerir estrictamente el API Key. Esto permite que los usuarios puedan eliminar y modificar los registros ingresados vÃ­a WhatsApp directamente desde el dashboard, validando su propiedad mediante sus telÃ©fonos asociados.

## [1.3.0] - 2026-02-27
### Added
- Nueva utilidad `obtenerVariantesTelefono` en `phoneUtils.js` que genera combinaciones automÃ¡ticas con y sin el prefijo "9" (Argentina).
- Soporte para variantes de telÃ©fono en los endpoints de `login`, `preferencias`, `registro` y `consulta de gastos`.

### Fixed
- **Gastos**: Corregido error de variable no definida `telefonoNormalizado` en endpoints de consulta por telÃ©fono.
- **Login**: Mayor flexibilidad al iniciar sesiÃ³n usando el nÃºmero de telÃ©fono con o sin el dÃ­gito "9" extra.

## [1.2.3] - 2026-02-22
### Added
- Endpoint `GET /api/preferencias/por-telefono/:telefono` para extracciÃ³n de catÃ¡logos para n8n.
- LÃ³gica de `seedUserDefaults` para inicializar categorÃ­as, divisas y medios de pago al registrarse.
- Seguridad `x-api-key` en endpoints de preferencias y gastos por telÃ©fono para integraciones externas.
### Fixed
- Bugs en las rutas PUT de `divisas`, `metodosPagos` y `tiposTransacciones`.

## [1.2.2] - 2026-02-22

### Corregido
- **Movimientos (n8n)**: Se mejorÃ³ la flexibilidad en la bÃºsqueda de telÃ©fonos en el endpoint `consulta-telefono-pruebas`, permitiendo encontrar registros guardados sin el prefijo `549` o con prefijo `54`. Esto asegura que no se pierdan movimientos de la tabla `GastosPruebaN8N` por discrepancias de formato.

## [1.2.1] - 2026-02-17

### Corregido
- **TelÃ©fonos**: EstandarizaciÃ³n de formato a `549...` eliminando espacios y prefijos redundantes.
- **Movimientos**: CorrecciÃ³n de bug donde los movimientos de nuevos usuarios no se visualizaban por discrepancia en formato de telÃ©fono. Ahora se buscan ambos formatos (con y sin `549`).
- **Google Login**: CorrecciÃ³n de duplicaciÃ³n de usuarios por sensibilidad a mayÃºsculas en emails.

## [1.2.0] - 2026-02-17

### Agregado
- **WhatsApp**: IntegraciÃ³n nativa con Meta Cloud API para envÃ­o de cÃ³digos de verificaciÃ³n.
- **Onboarding**: Soporte para vinculaciÃ³n de telÃ©fono como paso posterior al registro (Progressive Onboarding).
- **Seguridad**: ValidaciÃ³n de tokens expirados en 10 minutos para coincidir con plantilla de WhatsApp.

### Cambiado
- **WhatsApp**: Reemplazo de webhook n8n por llamada directa a Meta API.
- **WhatsApp**: Uso de plantilla oficial de autenticaciÃ³n `template_ccontrolalo_login_v1`.
- **Usuarios**: LÃ³gica para asignar telÃ©fono principal si el usuario no tiene uno (ej. Google Login).

## [1.1.0] - 2026-01-08

### Agregado
- **Deudas**: Soporte para actualizaciÃ³n de crÃ©ditos (PUT `/api/deudas/:id`).
- **Base de Datos**: Nueva columna `cantidad_cuotas` en tabla `deudas`.
- **Prestamos**: Actualizaciones en rutas y lÃ³gica de negocio.

### Cambiado
- **Core**: Mejoras en `app.js` y configuraciÃ³n de base de datos (`db.sql`).
- **Modelos**: RefactorizaciÃ³n de modelos Sequelize (`index.js`, `deudas.js`).

## [1.0.0] - 2025-12-10

### CaracterÃ­sticas
- **API REST**: Endpoints completos para gestiÃ³n de `usuarios`, `gastos`, `categorias`.
- **Seguridad**: AutenticaciÃ³n vÃ­a JWT y hashing de contraseÃ±as.
- **IA**: Endpoint `/api/audio` para procesamiento de lenguaje natural con OpenAI.
- **DB**: ConfiguraciÃ³n inicial de Sequelize para MySQL/PostgreSQL.

