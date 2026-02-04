import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerConfig } from '../../shared/types';
import { AppSettings } from '../../shared/types';
import * as path from 'path';

export class McpService {
    private clients: Map<string, Client> = new Map();
    private activeServers: Map<string, McpServerConfig> = new Map();

    constructor() { }

    /**
     * Start an MCP server
     */
    async startServer(config: McpServerConfig): Promise<void> {
        if (this.clients.has(config.id)) {
            console.log(`[McpService] Server ${config.name} (${config.id}) is already running.`);
            return;
        }

        console.log(`[McpService] Starting server: ${config.name}`, config);

        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: config.env || {},
            });

            const client = new Client({
                name: "Mucheng Notes Client",
                version: "1.0.0",
            }, {
                capabilities: {}
            });

            await client.connect(transport);

            this.clients.set(config.id, client);
            this.activeServers.set(config.id, config);
            console.log(`[McpService] Server ${config.name} started successfully.`);
        } catch (error) {
            console.error(`[McpService] Failed to start server ${config.name}:`, error);
            throw error;
        }
    }

    /**
     * Stop an MCP server
     */
    async stopServer(serverId: string): Promise<void> {
        const client = this.clients.get(serverId);
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error(`[McpService] Error closing client ${serverId}:`, e);
            }
            this.clients.delete(serverId);
            this.activeServers.delete(serverId);
            console.log(`[McpService] Server ${serverId} stopped.`);
        }
    }

    /**
     * Restart a server
     */
    async restartServer(config: McpServerConfig): Promise<void> {
        await this.stopServer(config.id);
        await this.startServer(config);
    }

    /**
     * List tools available on a specific server
     */
    async listTools(serverId: string): Promise<any[]> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`Server ${serverId} not found or not running`);
        }

        try {
            const result = await client.listTools();
            return result.tools;
        } catch (error) {
            console.error(`[McpService] Failed to list tools for ${serverId}:`, error);
            throw error;
        }
    }

    /**
     * Call a tool on a specific server
     */
    async callTool(serverId: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`Server ${serverId} not found or not running`);
        }

        try {
            const result = await client.callTool({
                name: toolName,
                arguments: args,
            });
            return result;
        } catch (error) {
            console.error(`[McpService] Failed to call tool ${toolName} on ${serverId}:`, error);
            throw error;
        }
    }

    /**
     * Get all actively running servers
     */
    getActiveServers(): McpServerConfig[] {
        return Array.from(this.activeServers.values());
    }

    /**
     * Stop all servers
     */
    async dispose(): Promise<void> {
        for (const id of this.clients.keys()) {
            await this.stopServer(id);
        }
    }
}

export const mcpService = new McpService();
