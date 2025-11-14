/**
 * Blockchain data caching utility
 *
 * Caches expensive blockchain RPC calls (getDynamicFields, multiGetObjects)
 * since market data changes infrequently on-chain.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Blockchain Cache Manager
 * Caches blockchain queries that don't change frequently
 */
class BlockchainCacheManager {
  private static instance: BlockchainCacheManager;
  private cache: Map<string, CacheEntry<unknown>>;

  // Default TTLs for different data types
  private static readonly DEFAULT_MARKETS_TTL = 60000; // 60 seconds - markets change rarely

  private constructor() {
    this.cache = new Map();
  }

  static getInstance(): BlockchainCacheManager {
    if (!BlockchainCacheManager.instance) {
      BlockchainCacheManager.instance = new BlockchainCacheManager();
    }
    return BlockchainCacheManager.instance;
  }

  /**
   * Get cached data or execute fetcher if cache miss/expired
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: {
      ttl?: number;
      skipCache?: boolean;
    },
  ): Promise<T> {
    const ttl = options?.ttl ?? BlockchainCacheManager.DEFAULT_MARKETS_TTL;
    const skipCache = options?.skipCache ?? false;

    const cacheKey = key;
    const cachedEntry = this.cache.get(cacheKey);

    // Skip cache if requested
    if (skipCache) {
      const data = await fetcher();
      // Still store in cache for future calls
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl,
      });
      return data;
    }

    // Check if cache is still fresh
    if (cachedEntry && Date.now() - cachedEntry.timestamp < cachedEntry.ttl) {
      return cachedEntry.data as T;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    return data;
  }

  /**
   * Clear specific cache entry or all cache
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      age: (Date.now() - value.timestamp) / 1000,
      ttl: value.ttl / 1000,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

// Export singleton instance
export const blockchainCache = BlockchainCacheManager.getInstance();

// Export types
export type { CacheEntry };
