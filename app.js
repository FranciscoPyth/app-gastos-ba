const express = require('express');
const app = express();
const db = require('./src/models');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Rate Limiting Configuration
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window`
  message: { message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 5, // Limit each IP to 5 requests per minute for auth routes
  message: { message: 'Demasiados intentos de acceso, por favor intente de nuevo en un minuto' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware para parsear JSON y habilitar CORS
app.use(express.json({ limit: '1mb' }));
const corsOptions = {
  origin: ['https://controlalo.com.ar', 'https://www.controlalo.com.ar', 'http://localhost:3000'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Aplicar Rate Limiting Global
app.use('/api/', globalLimiter);

// Sincronizar la base de datos de forma segura
const syncOptions = process.env.NODE_ENV === 'production' ? {} : { alter: true };
db.sequelize.sync(syncOptions)
  .then(() => console.log(`Database synced (mode: ${process.env.NODE_ENV === 'production' ? 'production' : 'development/alter'})`))
  .catch(err => console.error('Error syncing database:', err));

// Configurar rutas
app.use('/api/divisas', require('./src/routes/divisas'));
app.use('/api/tiposTransacciones', require('./src/routes/tiposTransacciones'));
app.use('/api/metodosPagos', require('./src/routes/metodosPagos'));
app.use('/api/categorias', require('./src/routes/categorias'));
app.use('/api/gastos', require('./src/routes/gastos'));
app.use('/api/gastosPruebaN8N', require('./src/routes/gastosPruebaN8N'));
app.use('/api/login', authLimiter, require('./src/routes/login'));
app.use('/api/google-login', authLimiter, require('./src/routes/googleAuth'));
app.use('/api/register', authLimiter, require('./src/routes/registerUser'));

app.use('/api/user/phones', require('./src/routes/userPhones'));
app.use('/api/objetivos', require('./src/routes/objetivos'));
app.use('/api/prestamos', require('./src/routes/prestamos'));
app.use('/api/deudas', require('./src/routes/deudas'));
app.use('/api/preferencias', require('./src/routes/preferencias'));
app.use('/api/usuarios', require('./src/routes/usuarios'));
app.use('/api/feedback', require('./src/routes/feedback'));
app.use('/api/ia-integration', require('./src/routes/ia-integration'));

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Iniciar el servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
