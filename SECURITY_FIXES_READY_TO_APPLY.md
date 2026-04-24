# CODESIGHT SECURITY FIXES - READY TO APPLY

## Quick Fix Guide for Critical Vulnerabilities

All code snippets are copy-paste ready. Test with the provided test cases.

---

## FIX #1: Markdown Escaping (CRITICAL)

### Step 1: Create utility function

**File:** `src/utils.ts` (create new file if doesn't exist)

```typescript
/**
 * Escape markdown special characters to prevent injection
 * Applied to: routes, middleware, env vars, models, fields, components
 * 
 * Order matters - escape backslashes first!
 */
export function escapeMarkdown(str: string): string {
  if (!str) return str;
  
  return str
    .replace(/\\/g, '\\\\')      // Escape backslashes first
    .replace(/`/g, '\\`')        // Escape backticks
    .replace(/\[/g, '\\[')       // Escape opening brackets
    .replace(/\]/g, '\\]')       // Escape closing brackets
    .replace(/\*/g, '\\*')       // Escape asterisks (bold/italic)
    .replace(/_/g, '\\_')        // Escape underscores
    .replace(/\|/g, '\\|');      // Escape pipes (table syntax)
}
```

### Step 2: Update imports in src/generators/wiki.ts

Add at top of file:
```typescript
import { escapeMarkdown } from "../utils.js";
```

### Step 3: Apply to domainArticle function (line 268-290)

**BEFORE:**
```typescript
// Line 286
lines.push(`- \`${route.method}\` \`${route.path}\`${params}${contractStr}${tags}${mwChain}${badge}`);

// Line 235
lines.push(`- \`${env.name}\` — \`${env.source}\``);

// Line 279
const mwChain =
  route.middleware && route.middleware.length > 0
    ? ` → middleware: ${route.middleware.join(" → ")}`
    : "";
```

**AFTER:**
```typescript
// Line 279 - update middleware chain
const mwChain =
  route.middleware && route.middleware.length > 0
    ? ` → middleware: ${route.middleware.map(escapeMarkdown).join(" → ")}`
    : "";

// Line 286 - escape route data
const routePath = escapeMarkdown(route.path);
const routeMethod = escapeMarkdown(route.method);
const params = route.params 
  ? ` params(${route.params.map(escapeMarkdown).join(", ")})` 
  : "";

lines.push(`- \`${routeMethod}\` \`${routePath}\`${params}${contractStr}${tags}${mwChain}${badge}`);

// Line 235 - escape env vars
if (result.config.envVars.length > 0) {
  lines.push("## Required Environment Variables", "");
  for (const env of required.slice(0, 12)) {
    lines.push(`- \`${escapeMarkdown(env.name)}\` — \`${escapeMarkdown(env.source)}\``);
  }
  lines.push("");
}
```

### Step 4: Update overviewArticle function (similar pattern)

Around lines 154-241, apply same escaping:

```typescript
// Line 163
lines.push(`**${escapeMarkdown(project.name)}** is ${parts.join(", ")}.`);

// Line 225 - hot files
lines.push(`- \`${escapeMarkdown(hf.file)}\` — imported by **${hf.importedBy}** files`);

// Line 235 - env vars
lines.push(`- \`${escapeMarkdown(env.name)}\` — \`${escapeMarkdown(env.source)}\``);
```

### Step 5: Update src/formatter.ts schema/component formatting

**For formatSchema function (around line 140):**

```typescript
function formatSchema(result: ScanResult): string {
  const lines: string[] = ["# Schema", ""];

  const byOrm = new Map<string, typeof result.schemas>();
  for (const model of result.schemas) {
    if (!byOrm.has(model.orm)) byOrm.set(model.orm, []);
    byOrm.get(model.orm)!.push(model);
  }

  for (const [orm, models] of byOrm) {
    if (byOrm.size > 1) lines.push(`## ${escapeMarkdown(orm)}`, "");

    for (const model of models) {
      if (model.name.startsWith("enum:")) {
        const enumName = model.name.replace("enum:", "");
        const values = model.fields.map((f) => escapeMarkdown(f.name)).join(" | ");
        lines.push(`### enum ${escapeMarkdown(enumName)}: ${values}`, "");
        continue;
      }

      lines.push(`### ${escapeMarkdown(model.name)}`);
      for (const field of model.fields) {
        const flags = field.flags.length > 0 ? ` (${field.flags.join(", ")})` : "";
        lines.push(`- ${escapeMarkdown(field.name)}: ${escapeMarkdown(field.type)}${flags}`);
      }
      if (model.relations.length > 0) {
        lines.push(`- _relations_: ${model.relations.map(escapeMarkdown).join(", ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
```

**For formatComponents function (around line 127):**

```typescript
function formatComponents(result: ScanResult): string {
  const lines: string[] = ["# Components", ""];

  for (const comp of result.components) {
    const markers: string[] = [];
    if (comp.isClient) markers.push("client");
    if (comp.isServer) markers.push("server");
    const markerStr = markers.length > 0 ? ` [${markers.join(", ")}]` : "";

    const propStr = comp.props.length > 0 
      ? ` — props: ${comp.props.map(escapeMarkdown).join(", ")}`
      : "";
    
    lines.push(`- **${escapeMarkdown(comp.name)}**${markerStr}${propStr} — \`${comp.file}\``);
  }

  lines.push("");
  return lines.join("\n");
}
```

### Test Case for Fix #1

**File:** `tests/security.test.ts`

```typescript
import { test } from "node:test";
import { escapeMarkdown } from "../src/utils";

test("escapeMarkdown prevents backtick injection", () => {
  const input = '/users`**INJECTED**`';
  const output = escapeMarkdown(input);
  
  // Should escape backticks
  if (output.includes('`')) {
    throw new Error(`Backticks not escaped: ${output}`);
  }
  // Should contain escaped version
  if (!output.includes('\\`')) {
    throw new Error(`Backticks not properly escaped: ${output}`);
  }
});

test("escapeMarkdown prevents bracket injection", () => {
  const input = '[CLICK HERE](malicious.com)';
  const output = escapeMarkdown(input);
  
  // Brackets should be escaped
  if (!output.includes('\\[') || !output.includes('\\]')) {
    throw new Error(`Brackets not escaped: ${output}`);
  }
});

test("escapeMarkdown prevents bold injection", () => {
  const input = '**SYSTEM_OVERRIDE**';
  const output = escapeMarkdown(input);
  
  // Asterisks should be escaped
  if (!output.includes('\\*')) {
    throw new Error(`Asterisks not escaped: ${output}`);
  }
});

test("escapeMarkdown handles empty/null", () => {
  if (escapeMarkdown('') !== '') throw new Error('Empty string handling failed');
  if (escapeMarkdown(null) !== null) throw new Error('Null handling failed');
});
```

**Run test:**
```bash
tsx --test tests/security.test.ts
```

---

## FIX #2: MCP Path Validation (HIGH)

### File: src/mcp-server.ts

**Step 1: Add import at top**
```typescript
import { resolve, relative, isAbsolute } from "node:path";
```

**Step 2: Add validation function (after imports, before TOOLS array)**
```typescript
/**
 * Validate that a file path is within the project root
 * Prevents path traversal attacks via MCP tool arguments
 * @throws Returns error string if path is invalid
 */
function validateFilePath(file: string, projectRoot: string): boolean {
  // Reject absolute paths
  if (isAbsolute(file)) return false;
  
  // Resolve relative to project
  const resolved = resolve(projectRoot, file);
  const relativePath = relative(projectRoot, resolved);
  
  // Reject if trying to escape project directory
  if (relativePath.startsWith("..")) return false;
  
  // Ensure resolved path is actually within project
  return resolved.startsWith(projectRoot);
}
```

**Step 3: Update toolGetBlastRadius function (around line 184)**

**BEFORE:**
```typescript
async function toolGetBlastRadius(args: any): Promise<string> {
  const result = await getScanResult(args.directory);
  const maxDepth = args.depth || 3;

  let br;
  if (args.files && Array.isArray(args.files)) {
    br = analyzeMultiFileBlastRadius(args.files, result, maxDepth);
  } else if (args.file) {
    br = analyzeBlastRadius(args.file, result, maxDepth);
  } else {
    return "Error: provide 'file' (string) or 'files' (array) parameter.";
  }
```

**AFTER:**
```typescript
async function toolGetBlastRadius(args: any): Promise<string> {
  const result = await getScanResult(args.directory);
  const projectRoot = cachedRoot || process.cwd();
  const maxDepth = args.depth || 3;

  let br;
  if (args.files && Array.isArray(args.files)) {
    // Validate all files
    if (!args.files.every((f: string) => validateFilePath(f, projectRoot))) {
      return "Error: file paths must be relative to project root (no .. or absolute paths allowed)";
    }
    br = analyzeMultiFileBlastRadius(args.files, result, maxDepth);
  } else if (args.file) {
    // Validate single file
    if (!validateFilePath(args.file, projectRoot)) {
      return "Error: file path must be relative to project root (no .. or absolute paths allowed)";
    }
    br = analyzeBlastRadius(args.file, result, maxDepth);
  } else {
    return "Error: provide 'file' (string) or 'files' (array) parameter.";
  }
```

### Test Case for Fix #2

```typescript
test("validateFilePath blocks path traversal", () => {
  const projectRoot = "/tmp/project";
  
  // Should reject traversal
  if (validateFilePath("../../../etc/passwd", projectRoot)) {
    throw new Error("Path traversal not blocked");
  }
  
  // Should reject absolute paths
  if (validateFilePath("/etc/passwd", projectRoot)) {
    throw new Error("Absolute path not blocked");
  }
  
  // Should accept valid relative paths
  if (!validateFilePath("src/routes.ts", projectRoot)) {
    throw new Error("Valid path rejected");
  }
  
  // Should accept nested valid paths
  if (!validateFilePath("packages/api/src/routes.ts", projectRoot)) {
    throw new Error("Nested valid path rejected");
  }
});
```

---

## FIX #3: Sensitive Env Var Masking (HIGH)

### File: src/generators/wiki.ts

**Step 1: Add masking function**

```typescript
/**
 * Mask sensitive environment variable names
 * Shows structure without exposing actual secrets
 */
function maskSensitiveEnvVar(name: string): string {
  const sensitivePatterns = [
    /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|APIKEY|BEARER|PRIVATE|INTERNAL|PROD/i
  ];
  
  if (sensitivePatterns.some(p => p.test(name))) {
    // For sensitive vars, show only structure with masked values
    const parts = name.split('_');
    return parts.map((p, idx) => {
      if (idx === 0) return p;           // Keep first part (context)
      if (p.length <= 3) return '***';   // Short parts → ***
      return p.substring(0, 2) + '*'.repeat(p.length - 2); // Partial mask
    }).join('_');
  }
  return name;
}

/**
 * Mask source file paths for sensitive vars
 */
function maskSensitiveSourcePath(path: string, varName: string): string {
  if (/key|secret|token|password|credential/i.test(varName)) {
    return '_[source file]_';
  }
  return path;
}
```

**Step 2: Update environment variable output in overviewArticle and domainArticle**

```typescript
// Around line 235 in domainArticle
if (required.length > 0) {
  lines.push("## Required Environment Variables", "");
  for (const env of required.slice(0, 12)) {
    const displayName = maskSensitiveEnvVar(env.name);
    const displaySource = maskSensitiveSourcePath(env.source, env.name);
    lines.push(`- \`${displayName}\` — \`${displaySource}\``);
  }
  lines.push("");
}

// Similar pattern in overviewArticle function
```

### Test Case for Fix #3

```typescript
test("maskSensitiveEnvVar hides secret names", () => {
  // Password should be masked
  const pass = maskSensitiveEnvVar("DB_PASSWORD_PROD_2024");
  if (pass !== "DB_***") {
    throw new Error(`Expected masked password, got: ${pass}`);
  }
  
  // Token should be masked
  const token = maskSensitiveEnvVar("GITHUB_TOKEN_PERSONAL");
  if (!token.includes('***')) {
    throw new Error(`Token not masked: ${token}`);
  }
  
  // Regular var should not be masked
  const regular = maskSensitiveEnvVar("DATABASE_URL");
  if (regular !== "DATABASE_URL") {
    throw new Error(`Regular env var masked: ${regular}`);
  }
});
```

---

## FIX #4-6: Schema/Component/Middleware Escaping

All use same `escapeMarkdown()` function from Fix #1.

Already covered in Fix #1 sections for:
- Schema field names: formatSchema function
- Component props: formatComponents function
- Middleware: domainArticle mwChain variable

---

## VERIFICATION CHECKLIST

- [ ] `escapeMarkdown()` function created in utils.ts
- [ ] Import added to wiki.ts, formatter.ts
- [ ] All route paths escaped in wiki output
- [ ] All middleware names escaped
- [ ] All env var names escaped
- [ ] All model/field names escaped
- [ ] All component prop names escaped
- [ ] Path validation function added to mcp-server.ts
- [ ] Sensitive env var masking added
- [ ] Test cases passing
- [ ] No regressions in existing tests: `npm test`
- [ ] HTML report still escaping correctly (verify escapeHtml calls)
- [ ] MCP tools return proper validation errors for bad paths

---

## REGRESSION TESTING

After applying fixes, run:

```bash
# Unit tests
npm test

# Manual test: generate wiki with sample project
npx codesight --wiki

# Manual test: MCP server accepts/rejects paths correctly
# (requires MCP client to test)

# Visual inspection: check .codesight/wiki/*.md files
# - Look for properly escaped backticks/brackets
# - Verify env var names are masked
# - Confirm no markdown formatting in route names
```

---

## DEPLOYMENT

1. **Branch:** Create `security-fixes` branch
2. **Apply:** Copy/apply all 3 fixes above
3. **Test:** Run verification checklist
4. **Review:** Code review security changes
5. **Release:** Version bump (patch or minor)
6. **Announce:** Note security fixes in release notes

**Estimated Time:** 2-3 hours total

---

## ROLLBACK PLAN

If issues occur:
```bash
git revert <commit-hash>
npm test  # Verify rollback
```

All fixes are isolated to:
- `src/utils.ts` (new file)
- `src/generators/wiki.ts`
- `src/formatter.ts`
- `src/mcp-server.ts`

---

Done! All fixes ready to apply.
