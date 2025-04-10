import express, { Application } from 'express'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import cors from 'cors'
import databaseServices from './services/database.service'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'
import { NOT_FOUND } from '~/core/error.response'
import rootRouterV1 from './routes'
import { envConfig } from './constants/config'

// Khởi tạo socket service
const app: Application = express()

// init middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

app.use(compression())
app.use(morgan('dev'))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
app.listen(envConfig.port, () => {
  console.log('Welcome to Express & TypeScript Server')
  console.log(`Server is Fire at http://localhost:${envConfig.port}`)
})
