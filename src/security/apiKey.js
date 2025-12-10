const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.API_KEY;

    if (!validApiKey) {
        console.error('API_KEY no está configurada en las variables de entorno');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    if (apiKey && apiKey === validApiKey) {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado: API Key inválida o faltante' });
    }
};

module.exports = apiKeyMiddleware;
