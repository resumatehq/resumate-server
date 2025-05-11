import winston from 'winston';
import 'winston-daily-rotate-file';

class MyLogger {
    private logger: winston.Logger;

    constructor() {
        // Định dạng log message
        const formatPrint = winston.format.printf(
            (info: winston.Logform.TransformableInfo) => {
                const { level, message, context = '', requestId = '', timestamp = '', metadata = {} } = info;
                return `${timestamp}::${level}::${context}::${requestId}::${message}::${JSON.stringify(metadata)}`;
            }
        );

        // Cấu hình chung cho DailyRotateFile
        const commonRotateConfig = {
            dirname: 'src/logs',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '1m',
            maxFiles: '14d',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                formatPrint
            ),
        };

        // Khởi tạo logger
        this.logger = winston.createLogger({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                formatPrint
            ),
            transports: [
                // Console transport
                new winston.transports.Console(),

                // Info logs transport
                new winston.transports.DailyRotateFile({
                    ...commonRotateConfig,
                    filename: 'application-%DATE%.info.log',
                    level: 'info'
                }),

                // Error logs transport
                new winston.transports.DailyRotateFile({
                    ...commonRotateConfig,
                    filename: 'application-%DATE%.error.log',
                    level: 'error'
                })
            ]
        });
    }

    /**
     * Log info message
     * @param message - Log message
     * @param context - Context của log (vd: service name, function name)
     * @param requestId - ID của request
     * @param metadata - Thông tin bổ sung
     */
    public info(
        message: string,
        context: string = '',
        requestId: string = '',
        metadata: Record<string, any> = {}
    ): void {
        this.logger.info(message, { context, requestId, metadata });
    }

    /**
     * Log error message
     * @param message - Log message
     * @param context - Context của log (vd: service name, function name)
     * @param requestId - ID của request
     * @param metadata - Thông tin bổ sung
     */
    public error(
        message: string,
        context: string = '',
        requestId: string = '',
        metadata: Record<string, any> = {}
    ): void {
        this.logger.error(message, { context, requestId, metadata });
    }

    /**
     * Log warning message
     * @param message - Log message
     * @param context - Context của log (vd: service name, function name)
     * @param requestId - ID của request
     * @param metadata - Thông tin bổ sung
     */
    public warn(
        message: string,
        context: string = '',
        requestId: string = '',
        metadata: Record<string, any> = {}
    ): void {
        this.logger.warn(message, { context, requestId, metadata });
    }

    /**
     * Log debug message
     * @param message - Log message
     * @param context - Context của log (vd: service name, function name)
     * @param requestId - ID của request
     * @param metadata - Thông tin bổ sung
     */
    public debug(
        message: string,
        context: string = '',
        requestId: string = '',
        metadata: Record<string, any> = {}
    ): void {
        this.logger.debug(message, { context, requestId, metadata });
    }
}

export const logger = new MyLogger();

export type Logger = MyLogger;