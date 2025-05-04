import express, { Application } from 'express'
import http from 'http'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import cors from 'cors'
import databaseServices from './services/database.service'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'
import { NOT_FOUND } from '~/core/error.response'
import rootRouterV1 from './routes'
import { envConfig } from './constants/config'
import cronService from './services/cron.service'
import { logger } from './loggers/my-logger.log'
import SocketManager from './socket'

// Khởi tạo ứng dụng Express
const app: Application = express()
const server = http.createServer(app)

// Khởi tạo Socket.IO
// const socketManager = new SocketManager(server)

// init middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "wss:", "ws:"]
      },
    },
  })
);

app.use(compression())
app.use(morgan('dev'))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Kết nối database
databaseServices.connect()

// init route
app.use('/api/v1', rootRouterV1)

app.use((req, res) => {
  new NOT_FOUND({
    message: 'The requested resource was not found',
    data: {
      path: req.originalUrl,
      method: req.method
    }
  }).send(res)
})

// init error handler
app.use(defaultErrorHandler)

// Sử dụng server HTTP thay vì app.listen để Socket.IO hoạt động
server.listen(envConfig.port, () => {
  console.log('Welcome to Express & TypeScript Server')
  console.log(`Server is Fire at http://localhost:${envConfig.port}`)
  console.log(`WebSocket server is running on ws://localhost:${envConfig.port}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server')
  cronService.stopAll()
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server')
  cronService.stopAll()
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
})

// const metrics = cronService.getJobMetrics();
// console.log(metrics);