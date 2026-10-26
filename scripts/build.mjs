import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('out/', root);
const entry = await readFile(new URL('index.html', root));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), entry);
await cp(new URL('dist/', root), new URL('dist/', output), { recursive: true });

console.log(`Static site ready: ${fileURLToPath(output)}`);
