const { Categorias, Divisas, TiposTransacciones, MetodosPagos } = require('../models');

/**
 * Seeds default preferences for a new user.
 * @param {number} usuario_id - The ID of the newly created user.
 */
async function seedUserDefaults(usuario_id) {
    try {
        // 1. Categorías por defecto
        const defaultCategories = [
            "Salidas",
            "Alimentos/Bebidas",
            "Deporte",
            "Educación",
            "Imagen Personal",
            "Otros"
        ];
        await Categorias.bulkCreate(
            defaultCategories.map(cat => ({ descripcion: cat, usuario_id }))
        );

        // 2. Divisas por defecto
        const defaultCurrencies = ["ARS", "USD"];
        await Divisas.bulkCreate(
            defaultCurrencies.map(curr => ({ descripcion: curr, usuario_id }))
        );

        // 3. Tipos de Transacción por defecto
        const defaultTypes = ["Ingreso", "Egreso"];
        await TiposTransacciones.bulkCreate(
            defaultTypes.map(type => ({ descripcion: type, usuario_id }))
        );

        // 4. Medios de Pago por defecto
        const defaultPaymentMethods = ["Naranja X", "Mercado Pago", "Efectivo"];
        await MetodosPagos.bulkCreate(
            defaultPaymentMethods.map(method => ({ descripcion: method, usuario_id }))
        );

        console.log(`[SEED] Default values created for user ${usuario_id}`);
    } catch (error) {
        console.error(`[ERROR] Failed to seed default values for user ${usuario_id}:`, error.message);
        // We don't throw to avoid breaking registration if seeding fails
    }
}

module.exports = { seedUserDefaults };
