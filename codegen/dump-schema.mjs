// Debug helper: dump the JSON Schema derived from the protocol source so we can
// see exactly how unions / inline object types get normalized.
import { createGenerator } from 'ts-json-schema-generator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../server/src/protocol.ts');

const schema = createGenerator({
  path: SOURCE,
  type: '*',
  expose: 'all',
  topRef: false,
  jsDoc: 'none',
  skipTypeCheck: true,
  additionalProperties: false,
}).createSchema('*');

console.log(JSON.stringify(schema, null, 2));
