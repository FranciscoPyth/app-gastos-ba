// src/routes/audio.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
const db = require("../models"); // Importamos los modelos de Sequelize
const { OpenAI } = require("openai"); // Importamos la librería oficial de OpenAI
require('dotenv').config();

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Asegúrate de tener esta variable en tu .env
});

// Modelo a utilizar (puedes cambiarlo según tus necesidades)
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

router.post("/", async (req, res) => {
  try {
    const { texto, usuario_id } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "El texto es requerido" });
    }

    if (!usuario_id) {
      return res.status(400).json({ error: "El ID de usuario es requerido" });
    }

    console.log("Texto recibido:", texto);
    console.log("Usuario ID:", usuario_id);

    // Obtener las opciones disponibles para este usuario desde la base de datos
    const userOptions = await getUserOptions(usuario_id);
    
    // Formatear las opciones para el prompt
    const formattedOptions = formatOptionsForPrompt(userOptions);

    // Definir el contenido del mensaje para OpenAI
    const promptContent = `
      You are a financial assistant API that extracts expense details from text.
      Your output must be valid JSON without any additional text, comments, or formatting.
      
      Extract the expense details from this text: "${texto}"
      
      The user has these available options:
      ${formattedOptions}
      
      STRICT REQUIREMENTS:
      1. ONLY use categories, currencies, payment methods, and transaction types from the provided lists with their exact IDs.
      2. If something is mentioned but doesn't match the available options, choose the closest match.
      3. For the amount (monto), extract ONLY the numerical value (like 100 or 99.99) - DO NOT include currency symbols or codes.
      4. For the description, create a clear and concise summary of the expense based on the text.
      5. DO NOT INCLUDE ANY DATE OR "fecha" FIELD in your JSON response.
      6. DO NOT INCLUDE ANY COMMENTS in your JSON - comments like "// note" are not valid JSON.
      7. Include ONLY the exact fields listed in the JSON structure below.
      8. Return ONLY valid parseable JSON.
      
      EXACT JSON STRUCTURE TO RETURN:
      {
        "monto": 0, // MUST BE A NUMBER, not a string
        "descripcion": "description text",
        "divisa_id": 0,
        "tipostransaccion_id": 0,
        "metodopago_id": 0,
        "categoria_id": 0
      }
    `;

    // Llamar a la API de OpenAI usando la librería oficial
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system", 
          content: "You are a financial data extraction API. You only respond with valid JSON."
        },
        {
          role: "user",
          content: promptContent
        }
      ],
      temperature: 0.1, // Bajo para mantener respuestas consistentes
      response_format: { type: "json_object" } // Forzar formato JSON
    });

    // Obtener la respuesta de OpenAI
    const llmResponse = completion.choices[0].message.content;
    
    if (!llmResponse) {
      return res.status(500).json({ error: "Error al procesar el texto con OpenAI" });
    }

    // Limpiar la respuesta para asegurar que sea JSON válido
    let cleanedResponse = cleanLLMResponse(llmResponse);
    console.log("Respuesta limpia:", cleanedResponse);

    try {
      // Parsear la respuesta limpia del LLM a JSON
      let gastoData;
      
      try {
        gastoData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error("Error parseando JSON inicial:", parseError);
        console.log("Intentando limpiar más a fondo para solucionar el error de parseo...");
        
        // Intento adicional de limpieza para casos difíciles
        let furtherCleanedResponse = cleanedResponse;
        
        // Eliminar comentarios en formato JSON (como el ejemplo que mostraste)
        furtherCleanedResponse = furtherCleanedResponse.replace(/\/\/[^\n]*\n/g, '\n');
        
        // Si el monto es un string con formato (ej. "ARS 8999"), intentar extraer solo el número
        furtherCleanedResponse = furtherCleanedResponse.replace(/"monto"\s*:\s*"[^"]*?(\d+\.?\d*)[^"]*"/g, '"monto": $1');
        
        console.log("Respuesta después de limpieza adicional:", furtherCleanedResponse);
        
        try {
          gastoData = JSON.parse(furtherCleanedResponse);
        } catch (secondParseError) {
          console.error("Error en segundo intento de parseo:", secondParseError);
          throw secondParseError; // Re-lanzar para que sea manejado por el bloque catch exterior
        }
      }
      
      console.log("Datos extraídos del LLM:", gastoData);
      
      // Eliminación explícita de campos no deseados o con nombres incorrectos 
      // que podrían venir en la respuesta del LLM
      const cleanData = { ...gastoData };
      
      // Eliminar campo 'fecha' si existe
      if (cleanData.fecha) {
        delete cleanData.fecha;
      }
      
      // Corregir nombres de campos que podrían estar mal escritos
      if (cleanData.category_id && !cleanData.categoria_id) {
        cleanData.categoria_id = cleanData.category_id;
        delete cleanData.category_id;
      }
      
      if (cleanData.tipostransaction_id && !cleanData.tipostransaccion_id) {
        cleanData.tipostransaccion_id = cleanData.tipostransaction_id;
        delete cleanData.tipostransaction_id;
      }
      
      // Asegurarse de que monto sea un número
      if (typeof cleanData.monto === 'string') {
        // Intentar extraer solo los dígitos si contiene caracteres no numéricos
        const numericMatch = cleanData.monto.match(/(\d+(\.\d+)?)/);
        if (numericMatch) {
          cleanData.monto = parseFloat(numericMatch[0]);
        } else {
          cleanData.monto = 0.01; // Valor predeterminado si no se puede extraer
        }
      }
      
      // Validar los datos y aplicar valores predeterminados si es necesario
      const validatedData = await validateExpenseData(cleanData, userOptions, texto);
      
      // Agregar el usuario_id al objeto de datos
      validatedData.usuario_id = usuario_id;
      
      // Guardar el gasto en la base de datos usando Sequelize
      const savedExpense = await db.Gastos.create(validatedData);
      
      // Obtener el gasto completo con sus relaciones
      const completeExpense = await db.Gastos.findByPk(savedExpense.id, {
        include: [
          { model: db.Categorias },
          { model: db.Divisas },
          { model: db.MetodosPagos },
          { model: db.TiposTransacciones }
        ]
      });
      
      res.status(201).json({ 
        message: "Gasto registrado con éxito", 
        data: completeExpense 
      });
    } catch (jsonError) {
      console.error("Error parseando JSON o guardando datos:", jsonError);
      console.error("Texto que causó el error:", cleanedResponse);
      
      try {
        // Crear un objeto con valores predeterminados
        const defaultData = await createDefaultExpense(userOptions, usuario_id, texto);
        
        // Guardar el gasto predeterminado
        const savedExpense = await db.Gastos.create(defaultData);
        
        // Obtener el gasto completo con sus relaciones
        const completeExpense = await db.Gastos.findByPk(savedExpense.id, {
          include: [
            { model: db.Categorias },
            { model: db.Divisas },
            { model: db.MetodosPagos },
            { model: db.TiposTransacciones }
          ]
        });
        
        res.status(201).json({ 
          message: "No se pudo extraer información precisa. Se ha creado un gasto con valores predeterminados.", 
          data: completeExpense 
        });
      } catch (dbError) {
        console.error("Error guardando el gasto predeterminado:", dbError);
        res.status(500).json({ 
          error: "Error guardando el gasto: " + dbError.message 
        });
      }
    }
  } catch (error) {
    console.error("Error procesando texto:", error);
    res.status(500).json({ error: "Error procesando el texto: " + error.message });
  }
});

// Función para obtener las opciones disponibles para un usuario
async function getUserOptions(usuario_id) {
  try {
    // Obtener categorías del usuario
    const categorias = await db.Categorias.findAll({
      where: { usuario_id },
      attributes: ['id', 'descripcion']
    });
    
    // Obtener divisas del usuario
    const divisas = await db.Divisas.findAll({
      where: { usuario_id },
      attributes: ['id', 'descripcion']
    });
    
    // Obtener métodos de pago del usuario
    const metodosPago = await db.MetodosPagos.findAll({
      where: { usuario_id },
      attributes: ['id', 'descripcion']
    });
    
    // Obtener tipos de transacción del usuario
    const tiposTransaccion = await db.TiposTransacciones.findAll({
      where: { usuario_id },
      attributes: ['id', 'descripcion']
    });
    
    return {
      categorias,
      divisas,
      metodosPago,
      tiposTransaccion
    };
  } catch (error) {
    console.error("Error obteniendo opciones del usuario:", error);
    throw error;
  }
}

// Función para formatear las opciones para el prompt
function formatOptionsForPrompt(options) {
  return `
    CATEGORIES (use the exact ID number):
    ${options.categorias.map(cat => `- ID ${cat.id}: ${cat.descripcion}`).join('\n    ')}
    
    CURRENCIES (use the exact ID number):
    ${options.divisas.map(div => `- ID ${div.id}: ${div.descripcion}`).join('\n    ')}
    
    PAYMENT METHODS (use the exact ID number):
    ${options.metodosPago.map(met => `- ID ${met.id}: ${met.descripcion}`).join('\n    ')}
    
    TRANSACTION TYPES (use the exact ID number):
    ${options.tiposTransaccion.map(tipo => `- ID ${tipo.id}: ${tipo.descripcion}`).join('\n    ')}
  `;
}

// Función para limpiar la respuesta del LLM
function cleanLLMResponse(response) {
  let cleaned = response.trim();
  
  // Eliminar posibles tags como <think> o markdown ```json ```
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  cleaned = cleaned.replace(/```json\s*/g, "");
  cleaned = cleaned.replace(/```\s*$/g, "");
  
  // Eliminar comentarios de estilo // que no son válidos en JSON
  cleaned = cleaned.replace(/\/\/.*$/gm, "");
  
  // Eliminar posibles comas finales antes de cerrar objetos
  cleaned = cleaned.replace(/,(\s*})/g, "$1");
  
  // Encontrar el primer { y el último } para extraer solo el JSON
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

// Función para validar los datos del gasto y aplicar valores predeterminados
async function validateExpenseData(data, options, textoOriginal) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const validated = { ...data };
  
  // Validar y establecer valores predeterminados
  if (!validated.monto || isNaN(validated.monto)) {
    validated.monto = 0.01;
  }
  
  // Asignar fecha actual independientemente de lo que haya devuelto el LLM
  validated.fecha = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
  
  if (!validated.descripcion) {
    // Generar una descripción basada en el texto original si no fue extraída por el LLM
    validated.descripcion = await generateExpenseDescription(textoOriginal);
  }
  
  // Validar que los IDs existan en las opciones disponibles
  if (!validated.categoria_id || !options.categorias.some(cat => cat.id === validated.categoria_id)) {
    // Si no hay una categoría válida, usar la primera disponible
    validated.categoria_id = options.categorias.length > 0 ? options.categorias[0].id : null;
    
    // Si no hay categorías disponibles, crear una predeterminada
    if (validated.categoria_id === null) {
      const defaultCategory = await db.Categorias.create({
        descripcion: "Otros",
        usuario_id: data.usuario_id
      });
      validated.categoria_id = defaultCategory.id;
    }
  }
  
  // Validar divisa_id
  if (!validated.divisa_id || !options.divisas.some(div => div.id === validated.divisa_id)) {
    validated.divisa_id = options.divisas.length > 0 ? options.divisas[0].id : null;
    
    if (validated.divisa_id === null) {
      const defaultCurrency = await db.Divisas.create({
        descripcion: "ARS",
        usuario_id: data.usuario_id
      });
      validated.divisa_id = defaultCurrency.id;
    }
  }
  
  // Validar metodopago_id
  if (!validated.metodopago_id || !options.metodosPago.some(met => met.id === validated.metodopago_id)) {
    validated.metodopago_id = options.metodosPago.length > 0 ? options.metodosPago[0].id : null;
    
    if (validated.metodopago_id === null) {
      const defaultPaymentMethod = await db.MetodosPagos.create({
        descripcion: "Efectivo",
        usuario_id: data.usuario_id
      });
      validated.metodopago_id = defaultPaymentMethod.id;
    }
  }
  
  // Validar tipostransaccion_id
  if (!validated.tipostransaccion_id || !options.tiposTransaccion.some(tipo => tipo.id === validated.tipostransaccion_id)) {
    validated.tipostransaccion_id = options.tiposTransaccion.length > 0 ? options.tiposTransaccion[0].id : null;
    
    if (validated.tipostransaccion_id === null) {
      const defaultTransactionType = await db.TiposTransacciones.create({
        descripcion: "Gasto",
        usuario_id: data.usuario_id
      });
      validated.tipostransaccion_id = defaultTransactionType.id;
    }
  }
  
  return validated;
}

// Función para generar una descripción basada en el texto
async function generateExpenseDescription(texto) {
  try {
    // Utilizamos OpenAI para generar la descripción
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "Generate a concise description (max 5-7 words) for this expense. Return ONLY the description text without quotes or additional text."
        },
        {
          role: "user",
          content: `Generate a concise description for this expense: "${texto}"`
        }
      ],
      max_tokens: 20,
      temperature: 0.3
    });
    
    if (completion.choices && completion.choices.length > 0) {
      // Limpiar y limitar la respuesta
      let generatedDescription = completion.choices[0].message.content.trim();
      // Eliminar comillas, markdown u otros caracteres no deseados
      generatedDescription = generatedDescription.replace(/^["']|["']$/g, "").replace(/```/g, "");
      
      // Limitar a 50 caracteres si es demasiado largo
      if (generatedDescription.length > 50) {
        generatedDescription = generatedDescription.substring(0, 47) + "...";
      }
      
      return generatedDescription;
    } else {
      return "Gasto sin descripción";
    }
  } catch (error) {
    console.error("Error generando descripción:", error);
    return "Gasto sin descripción";
  }
}

// Función para crear un gasto con valores predeterminados
async function createDefaultExpense(options, usuario_id, texto) {
  // Verificar si hay opciones disponibles, si no, crear valores predeterminados
  let categoria_id = options.categorias.length > 0 ? options.categorias[0].id : null;
  if (categoria_id === null) {
    const defaultCategory = await db.Categorias.create({
      descripcion: "Otros",
      usuario_id
    });
    categoria_id = defaultCategory.id;
  }
  
  let divisa_id = options.divisas.length > 0 ? options.divisas[0].id : null;
  if (divisa_id === null) {
    const defaultCurrency = await db.Divisas.create({
      descripcion: "ARS",
      usuario_id
    });
    divisa_id = defaultCurrency.id;
  }
  
  let metodopago_id = options.metodosPago.length > 0 ? options.metodosPago[0].id : null;
  if (metodopago_id === null) {
    const defaultPaymentMethod = await db.MetodosPagos.create({
      descripcion: "Efectivo",
      usuario_id
    });
    metodopago_id = defaultPaymentMethod.id;
  }
  
  let tipostransaccion_id = options.tiposTransaccion.length > 0 ? options.tiposTransaccion[0].id : null;
  if (tipostransaccion_id === null) {
    const defaultTransactionType = await db.TiposTransacciones.create({
      descripcion: "Gasto",
      usuario_id
    });
    tipostransaccion_id = defaultTransactionType.id;
  }
  
  // Asegurarnos de usar la fecha actual del sistema
  return {
    monto: 0.01,
    descripcion: await generateExpenseDescription(texto),
    fecha: new Date().toISOString().split('T')[0], // Siempre fecha actual en formato YYYY-MM-DD
    categoria_id,
    divisa_id,
    metodopago_id,
    tipostransaccion_id,
    usuario_id
  };
}

module.exports = router;