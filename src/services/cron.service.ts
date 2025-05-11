import cron from 'node-cron';
import subscriptionService from './subscription.service';
import { logger } from '~/loggers/my-logger.log';

interface JobMetrics {
    lastRunTime?: Date;
    lastRunDuration?: number;
    lastRunStatus: 'success' | 'failed' | 'not_run';
    failureCount: number;
    averageDuration?: number;
    totalRuns: number;
}

class CronService {
    private cronJobs: Map<string, cron.ScheduledTask> = new Map();
    private jobMetrics: Map<string, JobMetrics> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes default timeout

    constructor() {
        // Initialize jobs
        this.initSubscriptionJobs();
        logger.info('CronService initialized', 'CronService.constructor');
    }

    /**
     * Initialize all subscription-related cron jobs
     */
    private initSubscriptionJobs() {
        // Check for expired subscriptions and process auto-renewals daily at 1:00 AM
        this.registerJob(
            'process-subscriptions',
            '0 1 * * *', // Run at 1:00 AM every day
            async () => {
                logger.info('Running subscription maintenance tasks', 'CronService.processSubscriptions');
                try {
                    await subscriptionService.processExpiredSubscriptions();
                    logger.info('Subscription maintenance completed successfully', 'CronService.processSubscriptions');
                } catch (error) {
                    logger.error(
                        'Error processing subscription maintenance',
                        'CronService.processSubscriptions',
                        '',
                        { error: error instanceof Error ? error.message : String(error) }
                    );
                    throw error; // Allow retry mechanism to handle it
                }
            }
        );
    }

    /**
     * Register a new cron job with retry mechanism and timeout
     * @param id Unique ID for the job
     * @param schedule Cron schedule expression
     * @param task Function to execute
     */
    private registerJob(id: string, schedule: string, task: () => Promise<void>) {
        try {
            // Validate cron expression
            if (!cron.validate(schedule)) {
                logger.error(
                    `Invalid cron schedule for ${id}: ${schedule}`,
                    'CronService.registerJob',
                    '',
                    { jobId: id, schedule }
                );
                return;
            }

            // Initialize metrics for this job
            this.jobMetrics.set(id, {
                lastRunStatus: 'not_run',
                failureCount: 0,
                totalRuns: 0
            });

            // Register the job with retry and timeout
            const job = cron.schedule(schedule, async () => {
                const startTime = Date.now();
                this.jobMetrics.get(id)!.lastRunTime = new Date();

                logger.info(`Running scheduled job: ${id}`, 'CronService.executeJob', '', { jobId: id });

                try {
                    // Execute task with timeout
                    await this.executeWithTimeout(task, this.JOB_TIMEOUT);

                    // Update success metrics
                    const metrics = this.jobMetrics.get(id)!;
                    metrics.lastRunStatus = 'success';
                    metrics.failureCount = 0;
                    metrics.lastRunDuration = Date.now() - startTime;
                    metrics.totalRuns++;

                    // Update average duration
                    if (!metrics.averageDuration) {
                        metrics.averageDuration = metrics.lastRunDuration;
                    } else {
                        metrics.averageDuration = (metrics.averageDuration * (metrics.totalRuns - 1) + metrics.lastRunDuration) / metrics.totalRuns;
                    }

                    logger.info(
                        `Job completed successfully: ${id}`,
                        'CronService.executeJob',
                        '',
                        {
                            jobId: id,
                            duration: metrics.lastRunDuration,
                            avgDuration: metrics.averageDuration
                        }
                    );
                } catch (error) {
                    const metrics = this.jobMetrics.get(id)!;
                    metrics.lastRunStatus = 'failed';
                    metrics.failureCount++;
                    metrics.totalRuns++;

                    logger.error(
                        `Error in scheduled job ${id}`,
                        'CronService.executeJob',
                        '',
                        {
                            jobId: id,
                            error: error instanceof Error ? error.message : String(error),
                            failureCount: metrics.failureCount
                        }
                    );

                    // Implement retry mechanism
                    if (metrics.failureCount <= this.MAX_RETRIES) {
                        const retryDelay = Math.pow(2, metrics.failureCount) * 1000; // Exponential backoff
                        logger.info(
                            `Scheduling retry for job ${id}`,
                            'CronService.executeJob',
                            '',
                            { jobId: id, retryAttempt: metrics.failureCount, retryDelay }
                        );

                        setTimeout(async () => {
                            try {
                                await this.executeWithTimeout(task, this.JOB_TIMEOUT);
                                metrics.lastRunStatus = 'success';
                                metrics.failureCount = 0;
                                logger.info(`Retry successful for job ${id}`, 'CronService.executeJob');
                            } catch (retryError) {
                                logger.error(
                                    `Retry failed for job ${id}`,
                                    'CronService.executeJob',
                                    '',
                                    {
                                        jobId: id,
                                        error: retryError instanceof Error ? retryError.message : String(retryError)
                                    }
                                );
                            }
                        }, retryDelay);
                    }
                }
            });

            // Store the job
            this.cronJobs.set(id, job);
            logger.info(
                `Registered cron job: ${id} with schedule: ${schedule}`,
                'CronService.registerJob',
                '',
                { jobId: id, schedule }
            );
        } catch (error) {
            logger.error(
                `Failed to register cron job ${id}`,
                'CronService.registerJob',
                '',
                {
                    jobId: id,
                    error: error instanceof Error ? error.message : String(error)
                }
            );
        }
    }

    /**
     * Execute a task with timeout
     */
    private async executeWithTimeout<T>(task: () => Promise<T>, timeout: number): Promise<T> {
        return Promise.race([
            task(),
            new Promise<T>((_, reject) => {
                setTimeout(() => reject(new Error('Task timed out')), timeout);
            })
        ]);
    }

    /**
     * Get metrics for all jobs
     */
    getJobMetrics(): Record<string, JobMetrics> {
        const metrics: Record<string, JobMetrics> = {};
        for (const [id, jobMetric] of this.jobMetrics.entries()) {
            metrics[id] = { ...jobMetric };
        }
        return metrics;
    }

    /**
     * Stop all cron jobs
     */
    stopAll() {
        for (const [id, job] of this.cronJobs.entries()) {
            job.stop();
            logger.info(`Stopped cron job: ${id}`, 'CronService.stopAll', '', { jobId: id });
        }
        logger.info('All cron jobs stopped', 'CronService.stopAll');
    }
}

export default new CronService(); 