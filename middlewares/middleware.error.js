import logger from '../utils/logger.js'

const KNOWN_ERROR_STATUS_CODES = {
    JsonWebTokenError: 401,
    TokenExpiredError: 401,
    CastError: 400,
    ValidationError: 400,
}

export const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || KNOWN_ERROR_STATUS_CODES[err.name] || 500
    err.status = err.status || "error"

    //log error
    logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`)
    
    //send response
    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    })
}