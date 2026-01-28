# Cortex Performance Benchmarks

This document details the performance improvements achieved by migrating Cortex from a Node.js + `sql.js` (WASM) architecture to a Bun-native architecture using `bun:sqlite`.

## Methodology

The benchmark compares two versions of Cortex:
1.  **Legacy:** Node.js v18 + `sql.js` (WASM implementation of SQLite)
2.  **Modern:** Bun v1.3.6 + `bun:sqlite` (Native SQLite with WAL mode)

### Test Environment
-   **OS:** macOS (Apple Silicon)
-   **Dataset:** 500 memory fragments with 768-dimensional vector embeddings.
-   **Operations:**
    -   **Batch Insert:** Inserting 500 items and persisting to disk.
    -   **Vector Search:** 50 sequential cosine similarity searches against the dataset.
    -   **Keyword Search:** 50 sequential keyword/FTS searches.

## Results

| Operation | Node.js + sql.js (Legacy) | Bun + bun:sqlite (Modern) | Improvement |
| :--- | :--- | :--- | :--- |
| **Vector Search (50 queries)** | ~148.59 ms | ~70.35 ms | **2.11x Faster** |
| **Keyword Search (50 queries)** | ~19.42 ms | ~14.45 ms | **1.34x Faster** |
| **Startup / Import Overhead** | High (WASM compilation) | Negligible (Native) | **Instant** |

## Architectural Improvements

### 1. Vector Search Speed
The transition to `bun:sqlite` leverages native code execution for database queries, removing the overhead of the WASM bridge. This results in a **2x speedup** for vector similarity calculations (cosine distance), which are CPU-intensive operations performed directly within the database context.

### 2. Persistence Strategy (The "Save" Bottleneck)
The most critical architectural change is in how data is persisted.

-   **Legacy (`sql.js`):** The database existed entirely in JavaScript memory. To "save", the **entire database file** (megabytes of data) had to be serialized to a buffer and written to disk atomically (`fs.writeFileSync`). This meant saving became strictly **O(N)**—as your memory grew, saving took longer and longer, causing UI freezes.
-   **Modern (`bun:sqlite`):** Uses SQLite's **Write-Ahead Logging (WAL)** mode. Changes are appended to a log file (`.wal`) efficiently. Saving is **O(1)** relative to the total database size, depending only on the size of the *new* data being inserted.

### 3. Concurrency
-   **Legacy:** Single-threaded WASM execution blocking the main Event Loop during heavy searches or saves.
-   **Modern:** Native SQLite execution allows for better concurrency. WAL mode allows readers (search) and writers (archival) to operate simultaneously without locking the entire database.

## Running the Benchmark

You can run the benchmark suite yourself to verify the current performance:

```bash
bun scripts/run-benchmark.ts
```
