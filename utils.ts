/**
 * CodeSight Utility Functions
 *
 * Security & Token Optimization Utilities:
 * - escapeMarkdown: Prevent injection attacks
 * - maskSensitiveEnvVar: Hide secret names
 * - validateFilePath: Block path traversal
 * - estimateTokens: Track token usage
 */

/**
 * Escape markdown special characters to prevent injection attacks
 * Applied to: route paths, middleware names, env var names, model/field names, component props
 *
 * CRITICAL: Escape backslashes first - order matters!
 */
export function escapeMarkdown(str: string): string {
  if (!str || typeof str !== 'string') return str || '';

  return str
    .replace(/\\/g, '\\\\')      // Backslashes FIRST
    .replace(/`/g, '\\`')        // Backticks (code blocks)
    .replace(/\[/g, '\\[')       // Opening brackets (links)
    .replace(/\]/g, '\\]')       // Closing brackets (links)
    .replace(/\*/g, '\\*')       // Asterisks (bold/italic)
    .replace(/_/g, '\\_')        // Underscores (italic)
    .replace(/\|/g, '\\|')       // Pipes (tables)
    .replace(/#/g, '\\#');       // Hash (headers)
}

/**
 * Estimate token usage for Claude
 * Rough approximation: ~4 characters = 1 token (varies by content)
 *
 * @param content - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  // Claude uses approximately 3.5-4 chars per token
  // 4 is conservative (safe estimate)
  return Math.ceil(content.length / 4);
}

/**
 * Mask sensitive environment variable names
 * Shows structure without exposing actual secret names
 *
 * Examples:
 * - DB_PASSWORD_PROD_2024 → DB_***
 * - GITHUB_TOKEN_PERSONAL → GITHUB_***
 * - DATABASE_URL → DATABASE_URL (not masked, not sensitive)
 *
 * @param name - Environment variable name
 * @returns Masked name if sensitive, original if not
 */
export function maskSensitiveEnvVar(name: string): string {
  if (!name || typeof name !== 'string') return name || '';

  // Patterns that indicate sensitive data
  const sensitivePatterns = [
    /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|APIKEY|BEARER|PRIVATE/i,
    /PROD_|_PROD$|STAGING_|_STAGING$/i
  ];

  const isSensitive = sensitivePatterns.some(p => p.test(name));

  if (isSensitive) {
    // Show only first part (context) + masked rest
    const parts = name.split('_');
    if (parts.length === 1) return '***'; // Single word secret
    return parts[0] + '_***'; // Keep context, mask secrets
  }

  return name; // Non-sensitive vars shown as-is
}

/**
 * Mask source file paths for sensitive env vars
 * Don't reveal where secrets are stored
 *
 * @param path - Source file path
 * @param varName - Environment variable name (checked for sensitivity)
 * @returns Masked path if sensitive var, original if not
 */
export function maskSensitiveSourcePath(path: string, varName: string): string {
  if (!varName || typeof varName !== 'string') return path || '';

  if (/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(varName)) {
    return '_[source file masked]_';
  }
  return path || '';
}

/**
 * Validate that a file path is within the project root
 * Prevents directory traversal attacks (../../../etc/passwd)
 *
 * Returns false for:
 * - Absolute paths (/etc/passwd)
 * - Path traversal attempts (../../config)
 * - Paths outside project root
 *
 * @param file - File path (can be relative)
 * @param projectRoot - Project root directory
 * @returns true if path is valid and within project
 */
export function validateFilePath(file: string, projectRoot: string): boolean {
  if (!file || typeof file !== 'string') return false;

  // Import inside function to avoid circular deps
  const path = require('path');

  // Reject absolute paths - must be relative to project
  if (path.isAbsolute(file)) return false;

  try {
    // Resolve relative path against project root
    const resolved = path.resolve(projectRoot, file);
    const relativePath = path.relative(projectRoot, resolved);

    // Reject if trying to escape project (../../../etc/passwd)
    if (relativePath.startsWith('..')) return false;

    // Ensure resolved path is actually within project
    return resolved.startsWith(projectRoot);
  } catch (error) {
    // If any error occurs, reject the path
    return false;
  }
}

/**
 * Deduplicate schemas by content hash
 * Useful for monorepos with duplicate schema definitions
 *
 * @param schemas - Array of schema objects with name, fields
 * @returns Deduplicated schemas (first occurrence kept)
 */
export function deduplicateSchemas(
  schemas: Array<{ name: string; fields?: any[]; file?: string }>
): Array<{ name: string; fields?: any[]; file?: string }> {
  const crypto = require('crypto');
  const seen = new Map<string, boolean>();
  const result: typeof schemas = [];

  for (const schema of schemas) {
    // Create hash from schema structure (not including file location)
    const schemaStr = JSON.stringify({
      name: schema.name,
      fields: schema.fields?.map((f: any) => ({
        name: f.name,
        type: f.type,
        flags: f.flags
      }))
    });

    const hash = crypto
      .createHash('sha256')
      .update(schemaStr)
      .digest('hex')
      .substring(0, 12); // First 12 chars sufficient

    // Only include if we haven't seen this exact structure
    if (!seen.has(hash)) {
      result.push(schema);
      seen.set(hash, true);
    }
  }

  return result;
}

/**
 * Check if a file should be scanned
 * Skips binary files to reduce token usage
 *
 * @param filePath - Path to file
 * @returns true if file should be scanned
 */
export function shouldScanFile(filePath: string): boolean {
  const path = require('path');

  // Binary file extensions to skip
  const BINARY_EXTENSIONS = new Set([
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Archives
    '.zip', '.tar', '.gz', '.rar', '.7z',
    // Fonts
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    // Media
    '.mp4', '.mp3', '.avi', '.mov', '.flv',
    // Build artifacts
    '.o', '.a', '.so', '.dll', '.exe',
    // Build output
    '.wasm'
  ]);

  const ext = path.extname(filePath).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}
