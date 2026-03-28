const { authenticateJWT } = require('./auth');

const combinedAuth = (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (apiKey && apiKey === process.env.API_KEY) {
        req.isSystem = true;
        return next();
    }
    
    req.isSystem = false;
    return authenticateJWT(req, res, next);
};

module.exports = combinedAuth;