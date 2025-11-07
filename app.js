const express = require('express');
const app = express();
const db = require('./src/models');
const cors = require('cors');

// Middleware para parsear JSON y habilitar CORS
app.use(express.json());
app.use(cors());

// Sincronizar la base de datos
db.sequelize.sync()
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
app.use('/api/register', require('./src/routes/registerUser'));
app.use('/api/audio', require('./src/routes/audio'));

// Manejo de errores
app.use((err, res) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Iniciar el servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
