const normalizarTelefono = (numero, pais = 'AR') => {
    if (!numero) return null;

    // Convertir a string y remover cualquier carácter que no sea dígito
    let numeroLimpio = numero.toString().replace(/\D/g, '');

    // Si es de Argentina o si no se especificó país
    if (pais === 'AR') {
        // Si ya empieza con 549, revisamos el caso especial del doble 9
        if (numeroLimpio.startsWith('549')) {
            // Corrección: Si el usuario o el frontend agregó un 9 extra (ej: 5499383...)
            if (numeroLimpio.startsWith('5499') && numeroLimpio.length >= 14) {
                return '549' + numeroLimpio.substring(4);
            }
            return numeroLimpio;
        }

        // CASO 1: Empieza con 54, pero no sigue con 9 (ej: 54351...) -> Agregar 9 después del 54
        if (numeroLimpio.startsWith('54') && !numeroLimpio.startsWith('549')) {
            return '549' + numeroLimpio.substring(2);
        }

        // CASO 2: No tiene el prefijo de país (ej: 351...) -> Agregar 549
        if (!numeroLimpio.startsWith('54')) {
            return '549' + numeroLimpio;
        }
    }

    return numeroLimpio;
};

/**
 * Retorna un array con las posibles variantes de un número de teléfono.
 * Útil para búsquedas cuando el usuario pudo registrarse con o sin el prefijo "9" (Argentina).
 */
const obtenerVariantesTelefono = (numero) => {
    const normalizado = normalizarTelefono(numero);
    if (!normalizado) return [];

    const variantes = [normalizado];

    // Si es un número de Argentina normalizado (empieza con 549)
    if (normalizado && normalizado.startsWith('549')) {
        // Agregar la variante sin el "9" (ej: 54351...)
        variantes.push('54' + normalizado.substring(3));
    }

    return [...new Set(variantes)];
};

module.exports = {
    normalizarTelefono,
    obtenerVariantesTelefono
};
