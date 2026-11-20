/** The `mcp_servers` storage domain: user-managed MCP server definitions. */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { mcpServerDefSchema } from './types.ts'
import type { McpServerDef } from './types.ts'

/** The versioned `mcp_servers` domain: one `servers` table of definitions keyed by id. */
export const mcpServersDomain = defineDomain({
  name: 'mcp_servers',
  version: 1,
  tables: {
    servers: domainTable<string, McpServerDef>(mcpServerDefSchema as never),
  },
})
