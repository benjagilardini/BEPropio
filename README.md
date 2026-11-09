# Propio API

Backend del sistema de administración de contratos de alquiler.

## Stack

- Node.js + Express 5
- TypeScript
- MongoDB (Mongoose)
- Socket.IO (notificaciones en tiempo real)
- Zod (validación)
- Vitest (testing)

## Requisitos

- Node.js >= 20
- MongoDB corriendo en local o remoto

## Instalación

```bash
git clone https://github.com/benjagilardini/BEPropio.git
cd BEPropio
npm install
```

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/mykey

JWT_ACCESS_SECRET=tu-secret-de-access-token
JWT_REFRESH_SECRET=tu-secret-de-refresh-token

# OpenAI (extracción de datos de contratos)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Email (SMTP) — sin configurar, los emails se loguean a consola
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
EMAIL_FROM=tu-email@gmail.com

FRONTEND_URL=http://localhost:5173
```

Las variables obligatorias son `MONGODB_URI`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`. El resto es opcional para desarrollo.

## Levantar en desarrollo

```bash
npm run dev
```

El servidor arranca en `http://localhost:3000` con hot-reload via `tsx watch`.

## Build y producción

```bash
npm run build
npm start
```

## Tests

```bash
npm test              # modo watch
npm run test:run      # ejecución única
npm run test:coverage # con cobertura
```

## Estructura del proyecto

```
src/
  config/          # Variables de entorno y configuración
  constants/       # Constantes de dominio
  controllers/     # Manejo de request/response
  middleware/       # Auth, rate limiting, upload
  models/          # Esquemas de Mongoose
  routes/          # Definición de rutas
  services/        # Lógica de negocio
  utils/           # Funciones auxiliares
```
