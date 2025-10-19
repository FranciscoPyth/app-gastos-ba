-- Crear la base de datos
CREATE DATABASE projectgastos;

-- Usar la base de datos recién creada
USE projectgastos;

-- Crear la tabla 'divisas'
CREATE TABLE divisas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL
);

-- Crear la tabla 'tipostransacciones'
CREATE TABLE tipostransacciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL
);

-- Crear la tabla 'metodospagos'
CREATE TABLE metodospagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL
);

-- Crear la tabla 'categorias'
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL
);

-- Crear la tabla 'usuarios'
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE
);

-- Crear la tabla 'gastos' con todas las foreign keys
CREATE TABLE gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(255),
    monto DECIMAL(10, 2) NOT NULL,
    fecha DATE NOT NULL,
    divisa_id INT,
    tipostransaccion_id INT,
    metodopago_id INT,
    categoria_id INT,
    usuario_id INT,
    numero_cel BIGINT,
    FOREIGN KEY (divisa_id) REFERENCES divisas(id),
    FOREIGN KEY (tipostransaccion_id) REFERENCES tipostransacciones(id),
    FOREIGN KEY (metodopago_id) REFERENCES metodospagos(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Crear la tabla 'GastosPruebaN8N' para pruebas (sin foreign keys)
CREATE TABLE GastosPruebaN8N (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(255) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha DATE NOT NULL,
    divisa VARCHAR(50),
    tipos_transaccion VARCHAR(100),
    metodo_pago VARCHAR(100),
    categoria VARCHAR(100),
    numero_cel VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);