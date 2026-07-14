import './config/config.env.js'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import http from 'http'
import { initSocket } from './socket/index.js'

import connectDB from './config/db.connection.js'
import userRoutes from './routes/route.user.js'
import chatRoutes from './routes/route.chat.js'
import cookieParser from 'cookie-parser'
import { globalErrorHandler } from './middlewares/middleware.error.js'
import logger from './utils/logger.js'

// Process-level safety net: without these, any uncaught exception or
// unhandled promise rejection crashes the whole Node process.
process.on('uncaughtException', (err) => {
    logger.error(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`)
    console.error('UNCAUGHT EXCEPTION:', err)
})

process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error(`UNHANDLED REJECTION: ${err.message}\n${err.stack}`)
    console.error('UNHANDLED REJECTION:', err)
})

const getAllowedOrigins = () => {
    const origins = [
        process.env.DEP_URL,
        process.env.DEP_URL_WWW,
        process.env.CLIENT_URL,
        process.env.CLIENT_URL_2
    ].filter(Boolean)

    // Local dev frontends (Next.js) aren't in DEP_URL/CLIENT_URL, so allow them explicitly outside production
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:3000', 'http://127.0.0.1:3000')
    }

    return origins
}

//app initialization
export const app = express()

// Socket.io setup
const server = http.createServer(app);
initSocket(server);

// proxy setup for vercel
app.set('trust proxy', 1);

//middlewares
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (getAllowedOrigins().indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({limit : '10kb'}))
app.use(cookieParser())
express.urlencoded({ extended: true })


//routes
app.get("/health", (req, res) => {
    res.status(200).send("Server is healthy");
});

app.use('/api/users', userRoutes)
app.use('/api/chats', chatRoutes)

app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io')) {
      return next(); // let Socket.IO handle it
    }
    return res.send('I am alive');
  });

// Global error handler — must be registered after all routes
app.use(globalErrorHandler)


connectDB(process.env.MONGO_URI)

server.listen(process.env.PORT, () => {
    console.log(`Server started at http://localhost:${process.env.PORT}`)
})
 
