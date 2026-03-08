const express = require('express');
const app = express();
const db = require('./src/models');
const cors = require('cors');

// Middleware para parsear JSON y habilitar CORS
app.use(express.json({ limit: '1mb' }));
const corsOptions = {
  origin: ['https://controlalo.com.ar', 'https://www.controlalo.com.ar', 'http://localhost:3000'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Sincronizar la base de datos
db.sequelize.sync({ alter: true })
  .then(() => console.log('Database synced'))
  .catch(err => console.error('Error syncing database:', err));

// Configurar rutas
app.use('/api/divisas', require('./src/routes/divisas'));
app.use('/api/tiposTransacciones', require('./src/routes/tiposTransacciones'));
app.use('/api/metodosPagos', require('./src/routes/metodosPagos'));
app.use('/api/categorias', require('./src/routes/categorias'));
app.use('/api/gastos', require('./src/routes/gastos'));
app.use('/api/gastosPruebaN8N', require('./src/routes/gastosPruebaN8N'));
app.use('/api/login', require('./src/routes/login'));
app.use('/api/google-login', require('./src/routes/googleAuth'));
app.use('/api/register', require('./src/routes/registerUser'));

app.use('/api/user/phones', require('./src/routes/userPhones'));
app.use('/api/objetivos', require('./src/routes/objetivos'));
app.use('/api/prestamos', require('./src/routes/prestamos'));
app.use('/api/deudas', require('./src/routes/deudas'));
app.use('/api/preferencias', require('./src/routes/preferencias'));
app.use('/api/usuarios', require('./src/routes/usuarios'));

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
