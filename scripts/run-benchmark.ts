import { initDb, saveDb, insertMemory, searchByVector, searchByKeyword, closeDb, embedBatch } from '../src/benchmark-lib.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Setup temp env
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-bench-'));
process.env.CORTEX_DATA_DIR = tempDir;

console.log(`Using temp dir: ${tempDir}`);

const itemCount = 500;
const SAMPLE_TEXTS = [
    "The quick brown fox jumps over the lazy dog.",
    "Cortex is a memory tool for Claude.",
    "Bun is a fast JavaScript runtime.",
    "SQLite is a C-language library that implements a small, fast, self-contained, high-reliability, full-featured, SQL database engine.",
    "Vector embeddings allow for semantic search."
];

async function run() {
    try {
        console.log('Initializing DB...');
        const db = await initDb();

        console.log('Warming up model...');
        await embedBatch(["Warmup"]);

        console.log('Generating data...');
        const items = [];
        for (let i = 0; i < itemCount; i++) {
            items.push({
                content: `${SAMPLE_TEXTS[i % SAMPLE_TEXTS.length]} [${i}]`,
                projectId: 'bench-project',
                timestamp: new Date()
            });
        }

        console.log('Generating embeddings...');
        console.time('Embedding Generation');
        const embeddings = await embedBatch(items.map(i => i.content));
        console.timeEnd('Embedding Generation');

        console.log('Starting Batch Insert...');
        console.time('Batch Insert (incl. 1 save)');
        
        for (let i = 0; i < itemCount; i++) {
            insertMemory(db, {
                content: items[i].content,
                embedding: embeddings[i],
                projectId: items[i].projectId,
                sourceSession: 'bench-session',
                timestamp: items[i].timestamp
            });
        }
        
        saveDb(db);
        
        console.timeEnd('Batch Insert (incl. 1 save)');

        console.log('Starting Vector Search...');
        console.time('Vector Search (50 queries)');
        const queryVec = embeddings[0];
        for (let i = 0; i < 50; i++) {
            searchByVector(db, queryVec, 'bench-project', 5);
        }
        console.timeEnd('Vector Search (50 queries)');

        console.log('Starting Keyword Search...');
        console.time('Keyword Search (50 queries)');
        for (let i = 0; i < 50; i++) {
            searchByKeyword(db, 'fast', 'bench-project', 5);
        }
        console.timeEnd('Keyword Search (50 queries)');

        closeDb();

    } catch (e) {
        console.error(e);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

run();
