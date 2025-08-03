# App Gastos BA - Backend API

A comprehensive expense management backend API built with Node.js, Express, and Sequelize. This application provides a robust REST API for managing personal and business expenses with features like user authentication, expense tracking, categorization, and AI-powered expense extraction from text.

## 🚀 Features

- **User Authentication**: Secure user registration and login with JWT tokens
- **Expense Management**: Full CRUD operations for expense tracking
- **Multi-Currency Support**: Support for different currencies
- **Payment Methods**: Track various payment methods
- **Transaction Types**: Categorize transactions (income/expense)
- **Expense Categories**: Organize expenses by categories
- **AI-Powered Text Processing**: Extract expense details from natural language using OpenAI
- **Database Support**: MySQL, PostgreSQL, and SQLite support
- **RESTful API**: Clean and intuitive API endpoints

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database ORM**: Sequelize
- **Database**: MySQL/PostgreSQL/SQLite
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt
- **AI Integration**: OpenAI API
- **File Upload**: Multer
- **Validation**: Joi
- **CORS**: Cross-Origin Resource Sharing enabled

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MySQL/PostgreSQL database (or SQLite for development)
- OpenAI API key (for AI features)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd app-gastos-ba
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   PORT=4000
   DB_HOST=localhost
   DB_USER=your_username
   DB_PASS=your_password
   DB_NAME=projectgastos
   DB_DIALECT=mysql
   JWT_SECRET=your_jwt_secret_key
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-3.5-turbo
   ```

4. **Database Setup**
   - For MySQL: Run the SQL script in `src/database/db.sql`
   - For PostgreSQL: Modify the script accordingly
   - For SQLite: The database will be created automatically

5. **Start the application**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:4000`

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/register
Content-Type: application/json

{
  "username": "user123",
  "password": "password123",
  "email": "user@example.com"
}
```

#### Login
```http
POST /api/login
Content-Type: application/json

{
  "username": "user123",
  "password": "password123"
}
```

### Expense Management

#### Get All Expenses
```http
GET /api/gastos?usuario_id=1&descripcion=groceries
Authorization: Bearer <jwt_token>
```

#### Create Expense
```http
POST /api/gastos
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "descripcion": "Grocery shopping",
  "monto": 150.50,
  "fecha": "2024-01-15",
  "divisa_id": 1,
  "tipostransaccion_id": 1,
  "metodopago_id": 1,
  "categoria_id": 1,
  "usuario_id": 1
}
```

#### Update Expense
```http
PUT /api/gastos/:id
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "monto": 160.00,
  "descripcion": "Updated grocery shopping"
}
```

#### Delete Expense
```http
DELETE /api/gastos/:id
Authorization: Bearer <jwt_token>
```

### AI-Powered Text Processing

#### Extract Expense from Text
```http
POST /api/audio
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "texto": "I spent $50 on groceries yesterday using my credit card",
  "usuario_id": 1
}
```

### Master Data Endpoints

#### Categories
```http
GET /api/categorias
POST /api/categorias
PUT /api/categorias/:id
DELETE /api/categorias/:id
```

#### Currencies
```http
GET /api/divisas
POST /api/divisas
PUT /api/divisas/:id
DELETE /api/divisas/:id
```

#### Payment Methods
```http
GET /api/metodosPagos
POST /api/metodosPagos
PUT /api/metodosPagos/:id
DELETE /api/metodosPagos/:id
```

#### Transaction Types
```http
GET /api/tiposTransacciones
POST /api/tiposTransacciones
PUT /api/tiposTransacciones/:id
DELETE /api/tiposTransacciones/:id
```

## 🗄️ Database Schema

The application uses the following main tables:

- **usuarios**: User accounts and authentication
- **gastos**: Main expense records
- **categorias**: Expense categories
- **divisas**: Supported currencies
- **metodospagos**: Payment methods
- **tipostransacciones**: Transaction types (income/expense)

## 🔐 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Input validation with Joi
- CORS protection
- SQL injection prevention through Sequelize ORM

## 🤖 AI Integration

The application integrates with OpenAI's GPT models to:
- Extract expense details from natural language text
- Automatically categorize expenses
- Identify amounts, currencies, and payment methods
- Generate expense descriptions

## 🚀 Development

### Project Structure
```
app-gastos-ba/
├── app.js                 # Main application file
├── package.json           # Dependencies and scripts
├── src/
│   ├── models/           # Sequelize models
│   ├── routes/           # API route handlers
│   ├── database/         # Database schema
│   └── security/         # Authentication middleware
└── assets/               # Static assets
```

### Available Scripts
- `npm run dev`: Start development server with nodemon
- `npm start`: Start production server
- `npm test`: Run tests (to be implemented)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions, please open an issue in the repository or contact the development team.

## 🔄 Version History

- **v1.0.0**: Initial release with basic expense management and AI integration 