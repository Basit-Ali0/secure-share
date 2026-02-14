/**
 * Worker Pool - Manages multiple Web Workers for parallel encryption
 * Uses work-stealing queue pattern for load balancing
 */

const DEFAULT_WORKER_COUNT = 4

export class WorkerPool {
    constructor(workerCount = DEFAULT_WORKER_COUNT) {
        this.workers = []
        this.queue = []
        this.activeJobs = new Map()
        this.requestId = 0
        this.workerCount = workerCount
        this.initialized = false
    }

    /**
     * Initialize the worker pool
     */
    async init() {
        if (this.initialized) return

        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker(
                new URL('../workers/encryptionWorker.js', import.meta.url),
                { type: 'module' }
            )

            worker.onmessage = (e) => this.handleWorkerMessage(i, e)
            worker.onerror = (e) => this.handleWorkerError(i, e)
            worker.busy = false
            worker.currentRequestId = null

            this.workers.push(worker)
        }

        this.initialized = true
    }

    /**
     * Handle message from worker
     */
    handleWorkerMessage(workerIndex, event) {
        const { type, payload, requestId, error } = event.data
        const job = this.activeJobs.get(requestId)

        if (!job) return

        this.workers[workerIndex].busy = false
        this.workers[workerIndex].currentRequestId = null
        this.activeJobs.delete(requestId)

        if (type === 'ERROR') {
            job.reject(new Error(error))
        } else {
            job.resolve(payload)
        }

        // Process next job in queue
        this.processQueue()
    }

    /**
     * Handle worker error — uses tracked requestId to reject the correct job
     */
    handleWorkerError(workerIndex, error) {
        console.error(`Worker ${workerIndex} error:`, error)
        const worker = this.workers[workerIndex]
        worker.busy = false

        // Use tracked requestId to reject the correct job
        const requestId = worker.currentRequestId
        worker.currentRequestId = null

        if (requestId != null && this.activeJobs.has(requestId)) {
            const job = this.activeJobs.get(requestId)
            this.activeJobs.delete(requestId)
            job.reject(new Error(`Worker ${workerIndex} error: ${error.message || 'Unknown error'}`))
        }

        this.processQueue()
    }

    /**
     * Add job to queue
     */
    enqueue(type, payload) {
        return new Promise((resolve, reject) => {
            const requestId = this.requestId++
            this.queue.push({ type, payload, requestId, resolve, reject })
            this.processQueue()
        })
    }

    /**
     * Process queued jobs — assigns work to available workers
     */
    processQueue() {
        while (this.queue.length > 0) {
            // Find available worker
            const availableWorker = this.workers.find(w => !w.busy)
            if (!availableWorker) return

            const job = this.queue.shift()
            availableWorker.busy = true
            availableWorker.currentRequestId = job.requestId
            this.activeJobs.set(job.requestId, job)

            availableWorker.postMessage({
                type: job.type,
                payload: job.payload,
                requestId: job.requestId
            })
        }
    }

    /**
     * Encrypt a chunk using worker pool
     * @param {ArrayBuffer} buffer - Chunk data
     * @param {Uint8Array} keyBytes - Encryption key
     * @param {Uint8Array} baseIv - Base IV
     * @param {number} chunkIndex - Chunk index for IV derivation
     */
    async encryptChunk(buffer, keyBytes, baseIv, chunkIndex) {
        await this.init()
        return this.enqueue('ENCRYPT_CHUNK', { buffer, keyBytes, baseIv, chunkIndex })
    }

    /**
     * Decrypt a chunk using worker pool
     */
    async decryptChunk(encryptedBuffer, authTag, keyBytes, baseIv, chunkIndex) {
        await this.init()
        return this.enqueue('DECRYPT_CHUNK', { encryptedBuffer, authTag, keyBytes, baseIv, chunkIndex })
    }

    /**
     * Terminate all workers
     */
    terminate() {
        this.workers.forEach((w) => {
            w.currentRequestId = null
            w.terminate()
        })
        this.workers = []

        // Reject all queued jobs
        for (const job of this.queue) {
            job.reject(new Error('Worker pool terminated'))
        }
        this.queue = []

        // Reject all active jobs
        for (const [, job] of this.activeJobs) {
            job.reject(new Error('Worker pool terminated'))
        }
        this.activeJobs.clear()
        this.initialized = false
    }
}

// Singleton instance
let poolInstance = null

export function getWorkerPool() {
    if (!poolInstance) {
        poolInstance = new WorkerPool()
    }
    return poolInstance
}

export function terminateWorkerPool() {
    if (poolInstance) {
        poolInstance.terminate()
        poolInstance = null
    }
}
