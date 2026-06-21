/**
 * Protocol code generation — single source of truth → two clients.
 *
 *   server/src/protocol.ts  (the ONE true wire protocol)
 *        │
 *        ├─►  app/src/api/protocol.gen.ts     (TS mirror; app re-exports it)
 *        └─►  flutter-app/lib/protocol/protocol.gen.dart  (Dart models)
 *
 * The TS target is a verbatim, header-stamped copy of the source (it is already
 * perfect TS — "generation" here means "sync from the source of truth", which is
 * what keeps the old hand-maintained mirror honest). The Dart target is a real
 * translation: enums for string-literal unions, sealed classes for discriminated
 * unions, plain classes for interfaces, all with fromJson / toJson.
 *
 * Run:  npm run gen   (from codegen/)
 */
import { createGenerator } from 'ts-json-schema-generator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SOURCE = resolve(ROOT, 'server/src/protocol.ts');
const TS_OUT = resolve(ROOT, 'app/src/api/protocol.gen.ts');
const DART_OUT = resolve(ROOT, 'flutter-app/lib/protocol/protocol.gen.dart');

const sourceText = readFileSync(SOURCE, 'utf8');

// ---------------------------------------------------------------------------
// 1. Collect a JSON Schema definition for every exported type/interface.
// ---------------------------------------------------------------------------
const exportedNames = [...sourceText.matchAll(/export\s+(?:interface|type)\s+(\w+)/g)].map((m) => m[1]);
const protocolVersion = Number((sourceText.match(/PROTOCOL_VERSION\s*=\s*(\d+)/) || [])[1] ?? 1);

const generator = createGenerator({
  path: SOURCE,
  expose: 'all',
  topRef: true,
  jsDoc: 'none',
  skipTypeCheck: true,
  additionalProperties: false,
});

/** name -> JSON Schema node */
const defs = {};
for (const name of exportedNames) {
  try {
    const schema = generator.createSchema(name);
    Object.assign(defs, schema.definitions || {});
  } catch (e) {
    console.error(`! failed to schematize ${name}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------
const DART_KEYWORDS = new Set([
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export',
  'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'function',
  'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library',
  'mixin', 'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'set',
  'show', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void',
  'while', 'with', 'yield',
]);

const pascal = (s) =>
  String(s)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

const camel = (s) => {
  const p = pascal(s);
  return p ? p[0].toLowerCase() + p.slice(1) : p;
};

const enumConst = (value) => {
  let id = camel(value);
  if (!id || /^[0-9]/.test(id)) id = `v${id}`;
  if (DART_KEYWORDS.has(id)) id = `${id}_`;
  return id;
};

const safeField = (name) => (DART_KEYWORDS.has(name) ? `${name}_` : name);

// Classify a top-level definition.
const isEnum = (node) => node && node.type === 'string' && Array.isArray(node.enum) && !node.properties;
const isUnion = (node) => node && Array.isArray(node.anyOf) && node.anyOf.every((m) => m.type === 'object');
const isObject = (node) => node && node.type === 'object' && node.properties;

/** Find the discriminator key of a union: a property present in every member
 *  carrying a `const`. */
function discriminatorOf(union) {
  const counts = {};
  for (const m of union.anyOf) {
    for (const [k, v] of Object.entries(m.properties || {})) {
      if (v && typeof v.const === 'string') counts[k] = (counts[k] || 0) + 1;
    }
  }
  return Object.keys(counts).find((k) => counts[k] === union.anyOf.length) || null;
}

/** Prefix for a union's variant class names: WireEvent→Wire, ServerMessage→Server. */
const variantPrefix = (unionName) => unionName.replace(/(Event|Message)$/, '');

// ---------------------------------------------------------------------------
// 3. Type resolution — schema node -> Dart type descriptor.
//    Synthetic classes (inline object literals) are registered as we go.
// ---------------------------------------------------------------------------
/** name -> {properties, required} for synthetic inline-object classes. */
const synthetics = {};

/** Returns { desc, nullable }. desc = { kind, dart, inner?, name? }. */
function resolveType(node, owner, field) {
  let nullable = false;

  // anyOf used as a nullable wrapper: [X, {type:'null'}] (or a bare union ref).
  if (Array.isArray(node.anyOf)) {
    const nonNull = node.anyOf.filter((m) => m.type !== 'null');
    if (node.anyOf.length !== nonNull.length) nullable = true;
    if (nonNull.length === 1) {
      const r = resolveType(nonNull[0], owner, field);
      return { desc: r.desc, nullable: nullable || r.nullable };
    }
    // A genuine inline union — fall back to dynamic.
    return { desc: { kind: 'dynamic', dart: 'Object?' }, nullable: true };
  }

  // type may be an array including 'null'.
  let type = node.type;
  if (Array.isArray(type)) {
    if (type.includes('null')) nullable = true;
    type = type.filter((t) => t !== 'null')[0];
  }

  if (node.$ref) {
    const refName = node.$ref.replace('#/definitions/', '');
    const target = defs[refName];
    if (target && isEnum(target)) return { desc: { kind: 'enum', dart: refName, name: refName }, nullable };
    return { desc: { kind: 'class', dart: refName, name: refName }, nullable };
  }

  if (type === 'array') {
    const inner = resolveType(node.items || {}, owner, field);
    return { desc: { kind: 'list', dart: `List<${inner.desc.dart}>`, inner: inner.desc }, nullable };
  }

  if (type === 'object') {
    if (node.properties) {
      const name = `${pascal(owner)}${pascal(field)}`;
      synthetics[name] = { properties: node.properties, required: node.required || [] };
      return { desc: { kind: 'class', dart: name, name }, nullable };
    }
    if (node.additionalProperties && typeof node.additionalProperties === 'object') {
      const inner = resolveType(node.additionalProperties, owner, field);
      return { desc: { kind: 'map', dart: `Map<String, ${inner.desc.dart}>`, inner: inner.desc }, nullable };
    }
    return { desc: { kind: 'dynamic', dart: 'Object?' }, nullable: true };
  }

  if (type === 'string') return { desc: { kind: 'prim', dart: 'String' }, nullable };
  if (type === 'number' || type === 'integer') return { desc: { kind: 'prim', dart: 'num' }, nullable };
  if (type === 'boolean') return { desc: { kind: 'prim', dart: 'bool' }, nullable };

  return { desc: { kind: 'dynamic', dart: 'Object?' }, nullable: true };
}

// fromJson expression converting `access` (a `dynamic` value) into the Dart type.
function fromJson(desc, access, nullable) {
  const core = () => {
    switch (desc.kind) {
      case 'prim':
        return `${access} as ${desc.dart}`;
      case 'dynamic':
        return access;
      case 'enum':
        return `${desc.name}.fromWire(${access} as String)`;
      case 'class':
        return `${desc.name}.fromJson(${access} as Map<String, dynamic>)`;
      case 'list':
        return `(${access} as List<dynamic>).map((e) => ${fromJson(desc.inner, 'e', false)}).toList()`;
      case 'map':
        return `(${access} as Map<String, dynamic>).map((k, v) => MapEntry(k, ${fromJson(desc.inner, 'v', false)}))`;
      default:
        return access;
    }
  };
  if (!nullable) return core();
  if (desc.kind === 'prim') return `${access} as ${desc.dart}?`;
  if (desc.kind === 'dynamic') return access;
  return `${access} == null ? null : ${core()}`;
}

// toJson expression converting a Dart value `v` back to a JSON-encodable value.
function toJson(desc, v, nullable) {
  const q = nullable ? '?' : '';
  switch (desc.kind) {
    case 'prim':
    case 'dynamic':
      return v;
    case 'enum':
    case 'class':
      return `${v}${q}.toJson()`;
    case 'list':
      return `${v}${q}.map((e) => ${toJson(desc.inner, 'e', false)}).toList()`;
    case 'map':
      return `${v}${q}.map((k, v) => MapEntry(k, ${toJson(desc.inner, 'v', false)}))`;
    default:
      return v;
  }
}

// ---------------------------------------------------------------------------
// 4. Dart emitters
// ---------------------------------------------------------------------------
function emitEnum(name, node) {
  const entries = node.enum.map((v) => `  ${enumConst(v)}('${v}')`).join(',\n');
  return `enum ${name} {
${entries};

  final String wire;
  const ${name}(this.wire);

  static ${name} fromWire(String w) =>
      values.firstWhere((e) => e.wire == w, orElse: () => throw ArgumentError('Unknown ${name}: \$w'));
  String toJson() => wire;
}`;
}

/** Build the field model for an object-like schema, skipping `skip` keys. */
function fieldsOf(properties, required, owner, skip = []) {
  const fields = [];
  for (const [key, node] of Object.entries(properties)) {
    if (skip.includes(key)) continue;
    const req = required.includes(key);
    const { desc, nullable } = resolveType(node, owner, key);
    const isNullable = nullable || !req;
    fields.push({ key, name: safeField(key), desc, nullable: isNullable, required: req });
  }
  return fields;
}

function emitCtorParams(fields) {
  return fields
    .map((f) => (f.required && !f.nullable ? `required this.${f.name}` : `this.${f.name}`))
    .join(', ');
}

function emitFieldDecls(fields) {
  // `dynamic` already carries its own nullability (Object?), so don't double it up.
  return fields
    .map((f) => `  final ${f.desc.dart}${f.nullable && f.desc.kind !== 'dynamic' ? '?' : ''} ${f.name};`)
    .join('\n');
}

function emitFromJson(fields) {
  return fields
    .map((f) => `        ${f.name}: ${fromJson(f.desc, `json['${f.key}']`, f.nullable)},`)
    .join('\n');
}

function emitToJsonEntries(fields, fixed = []) {
  const lines = fixed.map(([k, v]) => `        '${k}': ${v},`);
  for (const f of fields) {
    const val = toJson(f.desc, f.name, f.nullable);
    // Optional fields (not required) are omitted when null; required-but-nullable
    // fields (e.g. `model: string | null`) are always emitted.
    if (!f.required && f.nullable) lines.push(`        if (${f.name} != null) '${f.key}': ${val},`);
    else lines.push(`        '${f.key}': ${val},`);
  }
  return lines.join('\n');
}

function emitClass(name, properties, required, owner = name) {
  const fields = fieldsOf(properties, required, owner);
  const ctor = fields.length
    ? `  const ${name}({${emitCtorParams(fields)}});`
    : `  const ${name}();`;
  const decls = fields.length ? emitFieldDecls(fields) + '\n\n' : '';
  const fromBody = fields.length
    ? `${name}(\n${emitFromJson(fields)}\n      )`
    : `const ${name}()`;
  return `class ${name} {
${decls}${ctor}

  factory ${name}.fromJson(Map<String, dynamic> json) =>
      ${fromBody};

  Map<String, dynamic> toJson() => {
${emitToJsonEntries(fields)}
      };
}`;
}

function emitUnion(name, node) {
  const disc = discriminatorOf(node);
  const prefix = variantPrefix(name);
  const variants = node.anyOf.map((member) => {
    const tag = member.properties[disc].const;
    const variantName = `${prefix}${pascal(tag)}`;
    return { tag, variantName, member };
  });

  const cases = variants
    .map((v) => `      case '${v.tag}':\n        return ${v.variantName}.fromJson(json);`)
    .join('\n');

  const base = `sealed class ${name} {
  const ${name}();

  factory ${name}.fromJson(Map<String, dynamic> json) {
    switch (json['${disc}'] as String) {
${cases}
      default:
        throw ArgumentError('Unknown ${name} ${disc}: \${json['${disc}']}');
    }
  }

  Map<String, dynamic> toJson();
}`;

  const classes = variants.map(({ tag, variantName, member }) => {
    const fields = fieldsOf(member.properties, member.required || [], variantName, [disc]);
    const ctor = fields.length
      ? `  const ${variantName}({${emitCtorParams(fields)}});`
      : `  const ${variantName}();`;
    const decls = fields.length ? emitFieldDecls(fields) + '\n\n' : '';
    const fromBody = fields.length
      ? `${variantName}(\n${emitFromJson(fields)}\n      )`
      : `const ${variantName}()`;
    return `class ${variantName} extends ${name} {
${decls}${ctor}

  factory ${variantName}.fromJson(Map<String, dynamic> json) =>
      ${fromBody};

  @override
  Map<String, dynamic> toJson() => {
${emitToJsonEntries(fields, [[disc, `'${tag}'`]])}
      };
}`;
  });

  return [base, ...classes].join('\n\n');
}

// ---------------------------------------------------------------------------
// 5. Build the Dart file
// ---------------------------------------------------------------------------
const blocks = [];
const enums = [];
const unions = [];
const objects = [];

for (const [name, node] of Object.entries(defs)) {
  if (isEnum(node)) enums.push([name, node]);
  else if (isUnion(node)) unions.push([name, node]);
  else if (isObject(node)) objects.push([name, node]);
}

// Resolve object + union fields first so all synthetic classes get registered.
for (const [name, node] of objects) emitClass(name, node.properties, node.required || [], name);
for (const [name, node] of unions) emitUnion(name, node);

// Now emit for real (synthetics are fully known).
for (const [name, node] of enums) blocks.push(emitEnum(name, node));
for (const [name, node] of objects) blocks.push(emitClass(name, node.properties, node.required || [], name));
for (const [name, node] of unions) blocks.push(emitUnion(name, node));
for (const [name, s] of Object.entries(synthetics)) {
  if (defs[name]) continue; // don't shadow a real type
  blocks.push(emitClass(name, s.properties, s.required, name));
}

const dartHeader = `// GENERATED — DO NOT EDIT BY HAND.
// Source of truth: server/src/protocol.ts
// Regenerate with:  cd codegen && npm run gen
//
// Wire protocol shared between the Claude Remote server and the Flutter app.
// ignore_for_file: constant_identifier_names, non_constant_identifier_names

/// Wire protocol version (must match the server's PROTOCOL_VERSION).
const int kProtocolVersion = ${protocolVersion};
`;

const dartOutput = `${dartHeader}\n${blocks.join('\n\n')}\n`;

mkdirSync(dirname(DART_OUT), { recursive: true });
writeFileSync(DART_OUT, dartOutput);

// ---------------------------------------------------------------------------
// 6. Build the TS mirror for /app (verbatim copy + DO-NOT-EDIT header).
// ---------------------------------------------------------------------------
const tsHeader = `/* GENERATED — DO NOT EDIT BY HAND.
 * Source of truth: server/src/protocol.ts
 * Regenerate with:  cd codegen && npm run gen
 * The app re-exports this from app/src/api/protocol.ts. */
`;
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, tsHeader + '\n' + sourceText);

console.log(`✓ Dart  → ${DART_OUT}  (${blocks.length} types)`);
console.log(`✓ TS    → ${TS_OUT}`);
console.log(`  enums=${enums.length} objects=${objects.length} unions=${unions.length} synthetic=${Object.keys(synthetics).filter((n) => !defs[n]).length}`);
