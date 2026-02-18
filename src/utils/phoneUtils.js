const normalizarTelefono = (numero) => {
    if (!numero) return null;
    
    // Convertir a string y remover cualquier carácter que no sea dígito
    let numeroLimpio = numero.toString().replace(/\D/g, '');

    // Si ya empieza con 549, lo dejamos así
    if (numeroLimpio.startsWith('549')) {
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

    return numeroLimpio;
};

module.exports = { normalizarTelefono };
