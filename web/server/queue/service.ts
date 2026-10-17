import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface QueueMetrics {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  concurrency: number;
}

export interface QueueStatus {
  redis_connected: boolean;
  redis_url: string;
  ai_scan_queue: QueueMetrics;
  import_queue: QueueMetrics;
}

class InMemorySemaphore {
  readonly concurrency: number;
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.concurrency) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.active--;
    if (this.queue.length > 0 && this.active < this.concurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get stats() {
    return {
      active: this.active,
      waiting: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}

export class QueueService {
  private redisClient: Redis | null = null;
  private redisConnected = false;
  private redisUrl: string;

  private aiCompletedCount = 0;
  private aiFailedCount = 0;
  private aiWaitingCount = 0;
  private aiSemaphore: InMemorySemaphore;

  private importCompletedCount = 0;
  private importFailedCount = 0;
  private importWaitingCount = 0;
  private importSemaphore: InMemorySemaphore;

  readonly aiConcurrency: number;
  readonly importConcurrency: number;

  constructor() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    this.redisUrl = process.env.REDIS_URL || `redis://${host}:${port}`;

    this.aiConcurrency = Math.max(1, Number(process.env.AI_SCAN_CONCURRENCY || 1));
    this.importConcurrency = Math.max(1, Number(process.env.IMPORT_CONCURRENCY || 2));

    this.aiSemaphore = new InMemorySemaphore(this.aiConcurrency);
    this.importSemaphore = new InMemorySemaphore(this.importConcurrency);

    this.initRedis();
  }

  private initRedis() {
    try {
      this.redisClient = new Redis(this.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 3000,
        retryStrategy: (times) => Math.min(times * 1000, 10000),
      });

      this.redisClient.on('connect', () => {
        this.redisConnected = true;
      });

      this.redisClient.on('error', () => {
        this.redisConnected = false;
      });
    } catch {
      this.redisConnected = false;
    }
  }

  /**
   * Acquire a distributed slot from Redis using an atomic Sorted Set lease.
   */
  private async acquireRedisSlot(
    key: string,
    maxSlots: number,
    leaseTtlMs = 180000,
  ): Promise<string> {
    if (!this.redisClient || !this.redisConnected) {
      throw new Error('Redis not connected');
    }
    const token = randomUUID();
    const redis = this.redisClient;

    // Retry loop until a slot is free
    while (true) {
      const now = Date.now();
      const cutoff = now - leaseTtlMs;

      // Clean up expired leases
      await redis.zremrangebyscore(key, 0, cutoff).catch(() => {});

      // Check current active count
      const count = await redis.zcard(key);
      if (count < maxSlots) {
        // Try adding our token
        const added = await redis.zadd(key, 'NX', now, token);
        if (added) {
          return token;
        }
      }

      // Wait a short jittered delay before checking again
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 50));
    }
  }

  private async releaseRedisSlot(key: string, token: string) {
    if (this.redisClient && this.redisConnected) {
      await this.redisClient.zrem(key, token).catch(() => {});
    }
  }

  /**
   * Chạy tác vụ suy luận AI (PointPillars 3D hoặc YOLO 2D) thông qua hàng đợi.
   * Giới hạn concurrency = 1 (hoặc theo cấu hình AI_SCAN_CONCURRENCY) để ngăn sập VRAM GPU.
   */
  async runAiTask<T>(
    name: string,
    fn: () => Promise<T>,
    _metadata?: Record<string, unknown>,
  ): Promise<T> {
    const startedAt = Date.now();
    this.aiWaitingCount++;

    let releaseInMemory: (() => void) | null = null;
    let redisToken: string | null = null;
    const redisKey = 'smartreview:lock:ai-scan';

    try {
      // 1. First serialize within this process via memory semaphore
      releaseInMemory = await this.aiSemaphore.acquire();
      this.aiWaitingCount = Math.max(0, this.aiWaitingCount - 1);

      // 2. Then acquire global distributed slot if Redis is available
      if (this.redisClient && this.redisConnected) {
        try {
          redisToken = await this.acquireRedisSlot(redisKey, this.aiConcurrency, 180000);
        } catch {
          // Fall back gracefully to local semaphore
        }
      }

      console.log(`[QueueService] Bắt đầu tác vụ AI: "${name}"`);
      const result = await fn();
      this.aiCompletedCount++;
      console.log(
        `[QueueService] Hoàn thành tác vụ AI: "${name}" (${Date.now() - startedAt}ms)`,
      );
      return result;
    } catch (err) {
      this.aiFailedCount++;
      console.error(`[QueueService] Lỗi tác vụ AI: "${name}":`, (err as Error).message);
      throw err;
    } finally {
      if (redisToken) {
        await this.releaseRedisSlot(redisKey, redisToken);
      }
      if (releaseInMemory) {
        releaseInMemory();
      }
    }
  }

  /**
   * Chạy tác vụ Import / Export dữ liệu nặng qua hàng đợi.
   * Giới hạn concurrency = 2 (hoặc theo cấu hình IMPORT_CONCURRENCY) để không quá tải CPU / RAM.
   */
  async runImportTask<T>(
    name: string,
    fn: () => Promise<T>,
    _metadata?: Record<string, unknown>,
  ): Promise<T> {
    const startedAt = Date.now();
    this.importWaitingCount++;

    let releaseInMemory: (() => void) | null = null;
    let redisToken: string | null = null;
    const redisKey = 'smartreview:lock:import';

    try {
      releaseInMemory = await this.importSemaphore.acquire();
      this.importWaitingCount = Math.max(0, this.importWaitingCount - 1);

      if (this.redisClient && this.redisConnected) {
        try {
          redisToken = await this.acquireRedisSlot(redisKey, this.importConcurrency, 600000);
        } catch {}
      }

      console.log(`[QueueService] Bắt đầu tác vụ Import: "${name}"`);
      const result = await fn();
      this.importCompletedCount++;
      console.log(
        `[QueueService] Hoàn thành tác vụ Import: "${name}" (${Date.now() - startedAt}ms)`,
      );
      return result;
    } catch (err) {
      this.importFailedCount++;
      console.error(`[QueueService] Lỗi tác vụ Import: "${name}":`, (err as Error).message);
      throw err;
    } finally {
      if (redisToken) {
        await this.releaseRedisSlot(redisKey, redisToken);
      }
      if (releaseInMemory) {
        releaseInMemory();
      }
    }
  }

  async getStatus(): Promise<QueueStatus> {
    let aiActive = this.aiSemaphore.stats.active;
    let importActive = this.importSemaphore.stats.active;

    if (this.redisClient && this.redisConnected) {
      try {
        const [aCount, iCount] = await Promise.all([
          this.redisClient.zcard('smartreview:lock:ai-scan'),
          this.redisClient.zcard('smartreview:lock:import'),
        ]);
        aiActive = Math.max(aiActive, aCount);
        importActive = Math.max(importActive, iCount);
      } catch {}
    }

    return {
      redis_connected: this.redisConnected,
      redis_url: this.redisUrl,
      ai_scan_queue: {
        active: aiActive,
        waiting: this.aiWaitingCount,
        completed: this.aiCompletedCount,
        failed: this.aiFailedCount,
        concurrency: this.aiConcurrency,
      },
      import_queue: {
        active: importActive,
        waiting: this.importWaitingCount,
        completed: this.importCompletedCount,
        failed: this.importFailedCount,
        concurrency: this.importConcurrency,
      },
    };
  }

  async close() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }
}

// Global Singleton Instance
export const queueService = new QueueService();
