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
    const { token, rememberSession } = req.body;

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
        const { email, name, picture, sub: googleId } = payload;

        // 2. Buscar usuario en la BD (Case insensitive)
        let user = await Usuarios.findOne({ where: { email: email.toLowerCase() } });

        if (!user) {
            // 3. REGISTRO: Si no existe, lo creamos
            // Como tu modelo requiere password y telefono, generamos valores placeholder

            // Generar password aleatoria segura (el usuario no la usarÃ¡, entrarÃ¡ por Google)
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            // Crear usuario
            user = await Usuarios.create({
                username: name ? name : email.split('@')[0],
                email: email,
                password: hashedPassword,
                telefono: null, // Permitimos nulo
                foto_perfil: picture || null,
                // googleId: googleId // SerÃ­a ideal agregar esta columna a tu tabla en el futuro
            });

            // Seed default values (Categories, Currencies, etc.) for new Google user
            const { seedUserDefaults } = require('../utils/userUtils');
            await seedUserDefaults(user.id);
        }

// 4. LOGIN: Generar tu propio JWT (igual que en el login normal)
        const expiresIn = rememberSession ? '7d' : '24h';
        const appToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                telefono: user.telefono
            },
            accessTokenSecret,
            { expiresIn }
        );

        // Responder al frontend
        res.json({
            message: 'Login con Google exitoso',
            token: appToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                telefono: user.telefono,
                foto_perfil: user.foto_perfil,
                has_completed_onboarding: user.has_completed_onboarding
            }
        });

    } catch (error) {
        console.error('Error en Google Login:', error);
        res.status(401).json({ message: 'Token de Google invÃ¡lido o error en el servidor', error: error.message });
    }
});

module.exports = router;

