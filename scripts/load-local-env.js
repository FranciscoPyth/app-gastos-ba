// Preload helper: carga .env.local antes que cualquier otro require.
// Uso: node -r ./scripts/load-local-env <script>
// dotenv no sobreescribe variables ya seteadas, así que este preload
// gana sobre el require('dotenv').config() que hace src/models/index.js.
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.local'),
});
