import express from 'express'
import dotenv from 'dotenv'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import http from 'http'
import { initSocket } from './socket/index.js'

import connectDB from './config/db.connection.js'
import userRoutes from './routes/route.user.js'
import chatRoutes from './routes/route.chat.js'
import transactionRoutes from './routes/route.transaction.js'
import cookieParser from 'cookie-parser'

const allowedOrigins = [
    process.env.NODE_ENV === 'production' ?[ process.env.DEP_URL, process.env.DEP_URL_WWW] : process.env.CLIENT_URL,
    process.env.CLIENT_URL_2
]

//env variables
dotenv.config()


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
        if (allowedOrigins.indexOf(origin) === -1) {
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
app.use('/api/users', userRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/chats', chatRoutes)
app.get('/health', (req, res) => {
    res.send('OK');
  });
  
  


connectDB(process.env.MONGO_URI)

server.listen(process.env.PORT, () => {
    console.log(`Server started at http://localhost:${process.env.PORT}`)
})

