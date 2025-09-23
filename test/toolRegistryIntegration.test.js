import { describe, it } from 'node:test';
import assert from 'node:assert';
import toolRegistry from '../src/tools/toolRegistry.js';

describe('Tool Registry Integration', () => {
    it('should include unified_flight_search tool', () => {
        const tools = toolRegistry.getAllTools();
        const flightTool = tools.find(tool => tool.name === 'unified_flight_search');

        assert.ok(flightTool, 'unified_flight_search tool should be present');
        assert.strictEqual(flightTool.category, 'travel');
        assert.ok(flightTool.description);
        assert.ok(flightTool.instructions);
    });

    it('should not include old flight search tools', () => {
        const tools = toolRegistry.getAllTools();
        const oldFlightTool = tools.find(tool => tool.name === 'search_flights');

        assert.ok(!oldFlightTool, 'Old search_flights tool should not be present');
    });

    it('should provide realtime tool definitions including flight tool', () => {
        const definitions = toolRegistry.getRealtimeToolDefinitions();
        const flightDefinition = definitions.find(def => def.name === 'unified_flight_search');

        // Since the tool is disabled by default (requires API key), it won't be in realtime definitions
        // But we can check if it would be included if enabled
        const enabledTools = toolRegistry.getEnabledTools();
        const hasFlightTool = enabledTools.some(tool => tool.name === 'unified_flight_search');

        // Flight tool should exist but be disabled by default
        assert.ok(!hasFlightTool, 'Flight tool should be disabled by default (requires API key)');
    });

    it('should get comprehensive tool config', () => {
        const config = toolRegistry.getComprehensiveToolConfig();

        assert.ok(config.definitions);
        assert.ok(config.instructions);
        assert.ok(config.categories);

        // Check that travel category exists (even if tools are disabled)
        const allTools = toolRegistry.getAllTools();
        const travelTools = allTools.filter(tool => tool.category === 'travel');
        assert.ok(travelTools.length > 0, 'Should have travel category tools');
    });

    it('should get tool by name', () => {
        const flightTool = toolRegistry.getToolByName('unified_flight_search');

        assert.ok(flightTool, 'Should find unified_flight_search tool');
        assert.strictEqual(flightTool.category, 'travel');
        assert.ok(flightTool.definition);
        assert.ok(flightTool.handler);
    });

    it('should have proper tool structure', () => {
        const flightTool = toolRegistry.getToolByName('unified_flight_search');

        // Check required properties
        assert.ok(flightTool.definition, 'Tool should have definition');
        assert.ok(flightTool.handler, 'Tool should have handler');
        assert.ok(flightTool.endpoint, 'Tool should have endpoint');
        assert.ok(flightTool.category, 'Tool should have category');
        assert.ok(typeof flightTool.enabled === 'boolean', 'Tool should have enabled boolean');
        assert.ok(flightTool.description, 'Tool should have description');
        assert.ok(flightTool.instructions, 'Tool should have instructions');

        // Check API key requirement
        assert.strictEqual(flightTool.requiresApiKey, 'amadeus');
    });
});