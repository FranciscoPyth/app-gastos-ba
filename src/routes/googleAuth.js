const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Usuarios } = require('../models');
const { accessTokenSecret } = require('../security/auth');

// Reemplaza con tu CLIENT_ID real de Google Cloud Console
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'TU_CLIENT_ID_DE_GOOGLE_AQUI';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: 'Token de Google requerido' });
    }

    try {
        // 1. Verificar el token con Google
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        // Datos que nos da Google
        const { email, name, sub: googleId } = payload;

        // 2. Buscar usuario en la BD
        let user = await Usuarios.findOne({ where: { email } });

        if (!user) {
            // 3. REGISTRO: Si no existe, lo creamos
            // Como tu modelo requiere password y telefono, generamos valores placeholder

            // Generar password aleatoria segura (el usuario no la usará, entrará por Google)
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            // Crear usuario
            user = await Usuarios.create({
                username: email.split('@')[0], // Usar parte del email como username inicial
                email: email,
                password: hashedPassword,
                telefono: null, // Permitimos nulo ya que actualizamos el modelo
                // googleId: googleId // Sería ideal agregar esta columna a tu tabla en el futuro
            });
        }

        // 4. LOGIN: Generar tu propio JWT (igual que en el login normal)
        const appToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                telefono: user.telefono
            },
            accessTokenSecret,
            { expiresIn: '24h' }
        );

        // Responder al frontend
        res.json({
            message: 'Login con Google exitoso',
            token: appToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                telefono: user.telefono
            }
        });

    } catch (error) {
        console.error('Error en Google Login:', error);
        res.status(401).json({ message: 'Token de Google inválido o error en el servidor', error: error.message });
    }
});

module.exports = router;
