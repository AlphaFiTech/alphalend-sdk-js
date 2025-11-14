/**
 * HTTP Cache utility with ETag and Cache-Control support
 * Implements client-side caching following HTTP standards
 */

interface CacheEntry<T> {
  data: T;
  etag?: string;
  cacheControl?: string;
  timestamp: number;
}

interface CacheControlDirectives {
  maxAge?: number; // in seconds
  public?: boolean;
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
}

/**
 * Parse Cache-Control header
 */
function parseCacheControl(header: string): CacheControlDirectives {
  const directives: CacheControlDirectives = {};
  const parts = header.split(",").map((s) => s.trim());

  for (const part of parts) {
    const [key, value] = part.split("=").map((s) => s.trim());

    switch (key.toLowerCase()) {
      case "max-age":
        directives.maxAge = parseInt(value, 10);
        break;
      case "public":
        directives.public = true;
        break;
      case "private":
        directives.private = true;
        break;
      case "no-cache":
        directives.noCache = true;
        break;
      case "no-store":
        directives.noStore = true;
        break;
      case "must-revalidate":
        directives.mustRevalidate = true;
        break;
    }
  }

  return directives;
}

/**
 * Check if cached data is still fresh based on Cache-Control max-age
 */
function isCacheFresh(
  cacheControl: string | undefined,
  timestamp: number,
): boolean {
  if (!cacheControl) return false;

  const directives = parseCacheControl(cacheControl);

  // If no-store or no-cache, always revalidate
  if (directives.noStore || directives.noCache) {
    return false;
  }

  // Check max-age
  if (directives.maxAge !== undefined) {
    const ageInSeconds = (Date.now() - timestamp) / 1000;
    return ageInSeconds < directives.maxAge;
  }

  return false;
}

/**
 * HTTP Cache Manager
 * Singleton pattern for managing HTTP cache across the SDK
 */
class HttpCacheManager {
  private static instance: HttpCacheManager;
  private cache: Map<string, CacheEntry<unknown>>;

  private constructor() {
    this.cache = new Map();
  }

  static getInstance(): HttpCacheManager {
    if (!HttpCacheManager.instance) {
      HttpCacheManager.instance = new HttpCacheManager();
    }
    return HttpCacheManager.instance;
  }

  /**
   * Fetch with HTTP caching (ETag + Cache-Control)
   */
  async fetchWithCache<T>(url: string): Promise<T> {
    const cacheKey = url;
    const cachedEntry = this.cache.get(cacheKey);

    // Check if we have fresh cached data (within max-age)
    if (cachedEntry && isCacheFresh(cachedEntry.cacheControl, cachedEntry.timestamp)) {
      return cachedEntry.data as T;
    }

    // Prepare headers
    const headers: HeadersInit = {
      "Accept": "application/json",
    };

    // Add If-None-Match header if we have an ETag
    if (cachedEntry?.etag) {
      headers["If-None-Match"] = cachedEntry.etag;
    }

    // Make the request
    const response = await fetch(url, { headers });

    // Handle 304 Not Modified
    if (response.status === 304 && cachedEntry) {
      // Update timestamp to extend cache lifetime
      cachedEntry.timestamp = Date.now();
      return cachedEntry.data as T;
    }

    // Handle errors
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Parse response
    const data = await response.json();

    // Extract caching headers
    const etag = response.headers.get("etag") || undefined;
    const cacheControl = response.headers.get("cache-control") || undefined;

    // Store in cache
    this.cache.set(cacheKey, {
      data,
      etag,
      cacheControl,
      timestamp: Date.now(),
    });

    return data;
  }

  /**
   * Clear cache for a specific URL or all cache
   */
  clearCache(url?: string): void {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const httpCache = HttpCacheManager.getInstance();

// Export types
export type { CacheEntry, CacheControlDirectives };
