const { authenticateJWT } = require('./auth');

const combinedAuth = (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (apiKey && apiKey === process.env.API_KEY) {
        return next();
    }
    
    return authenticateJWT(req, res, next);
};

module.exports = combinedAuth;