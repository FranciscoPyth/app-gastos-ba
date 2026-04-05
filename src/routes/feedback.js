const express = require('express');
const router = express.Router();
const { Feedback } = require('../models');
const { authenticateJWT } = require('../security/auth');

// Endpoint para guardar un nuevo feedback
router.post('/', authenticateJWT, async (req, res) => {
    try {
        const { rating, comment, source } = req.body;
        const user_id = req.user.id;

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'La valoración debe ser entre 1 y 5' });
        }

        const newFeedback = await Feedback.create({
            user_id,
            rating,
            comment,
            source: source || 'popup'
        });

        res.status(201).json({ 
            message: 'Feedback guardado con éxito', 
            feedback: newFeedback 
        });
    } catch (error) {
        console.error('Error al guardar feedback:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Endpoint para listar feedbacks (útil para administración)
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const feedbacks = await Feedback.findAll({
            order: [['created_at', 'DESC']]
        });
        
        res.json(feedbacks);
    } catch (error) {
        console.error('Error al obtener los feedbacks:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;
