import dotenv from 'dotenv'

// NODE_ENV must come from the real process environment (e.g. docker-compose), not from
// the dotenv file itself, since it decides which dotenv file gets loaded.
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local' })
