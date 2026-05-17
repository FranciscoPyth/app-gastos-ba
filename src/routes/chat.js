// Endpoint del chat con el agente IA — usado por el dev chat del dashboard.
// Mismo motor que el inbound de WhatsApp: services/ai/agent.js.
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateJWT } = require('../security/auth');
const db = require('../models');
const { chat } = require('../services/ai/agent');
const { buildFromUserId } = require('../utils/userContext');
const { transcribeAudio } = require('../services/ai/transcribe');
const { analyzeInvoiceImage } = require('../services/ai/visionInvoice');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// POST /api/chat/message — body { message }
router.post('/message', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { message } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message es requerido' });
        }

        const userContext = await buildFromUserId(userId);
        const waId = userContext.numero_cel;
        if (!waId) {
            return res.status(400).json({ error: 'El usuario no tiene teléfono registrado' });
        }

        const reply = await chat({ waId, userText: message.trim(), userContext });
        res.json({ reply });
    } catch (error) {
        console.error('[chat] error:', error.message);
        if (error.message && error.message.includes('OPENAI_API_KEY')) {
            return res.status(503).json({ error: 'OPENAI_API_KEY no está configurada en el backend' });
        }
        res.status(500).json({ error: error.message });
    }
});

// POST /api/chat/upload — recibe imagen o audio + mensaje opcional
// multipart/form-data: { file (binary), message?: string }
router.post('/upload', authenticateJWT, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });

        const userId = res.locals.user.id;
        const userContext = await buildFromUserId(userId);
        const waId = userContext.numero_cel;
        if (!waId) return res.status(400).json({ error: 'El usuario no tiene teléfono registrado' });

        const { buffer, mimetype } = req.file;
        const userText = (req.body.message || '').trim();

        let extracted = '';
        let mediaKind = '';

        if (mimetype && mimetype.startsWith('audio/')) {
            mediaKind = 'audio';
            try {
                extracted = await transcribeAudio({ buffer, mimeType: mimetype });
            } catch (err) {
                console.error('[chat/upload] transcribe error:', err.message);
                return res.status(500).json({ error: 'No se pudo transcribir el audio' });
            }
        } else if (mimetype && mimetype.startsWith('image/')) {
            mediaKind = 'imagen';
            try {
                extracted = await analyzeInvoiceImage({ buffer, mimeType: mimetype });
            } catch (err) {
                console.error('[chat/upload] vision error:', err.message);
                return res.status(500).json({ error: 'No se pudo analizar la imagen' });
            }
        } else {
            return res.status(400).json({ error: 'Tipo de archivo no soportado (sólo audio o imagen)' });
        }

        // Componer el texto final para el agente: contenido extraído + comentario opcional
        let finalText = extracted;
        if (userText) finalText = `${userText}\n\n[${mediaKind} adjunta] ${extracted}`;
        else finalText = `[${mediaKind} adjunta]\n${extracted}`;

        const reply = await chat({ waId, userText: finalText, userContext });

        res.json({
            reply,
            extracted,           // útil para mostrar en UI lo que detectamos
            mediaKind            // 'audio' | 'imagen'
        });
    } catch (error) {
        console.error('[chat/upload] error:', error.message);
        if (error.message && error.message.includes('OPENAI_API_KEY')) {
            return res.status(503).json({ error: 'OPENAI_API_KEY no está configurada' });
        }
        res.status(500).json({ error: error.message });
    }
});

// GET /api/chat/history — últimos 50 mensajes del usuario
router.get('/history', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const usuario = await db.Usuarios.findByPk(userId);
        if (!usuario || !usuario.telefono) return res.json({ messages: [] });

        const { normalizarTelefono } = require('../utils/phoneUtils');
        const waId = normalizarTelefono(usuario.telefono);

        const rows = await db.ChatMessages.findAll({
            where: { wa_id: waId },
            order: [['created_at', 'ASC'], ['id', 'ASC']],
            limit: 100
        });

        res.json({
            messages: rows.map(r => ({
                id: r.id,
                role: r.role,
                content: r.content,
                created_at: r.created_at
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/chat/history — limpia conversación del usuario
router.delete('/history', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const usuario = await db.Usuarios.findByPk(userId);
        if (!usuario || !usuario.telefono) return res.json({ deleted: 0 });

        const { normalizarTelefono } = require('../utils/phoneUtils');
        const waId = normalizarTelefono(usuario.telefono);

        const deleted = await db.ChatMessages.destroy({ where: { wa_id: waId } });
        res.json({ deleted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
