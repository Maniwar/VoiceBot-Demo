import { describe, it } from 'node:test';
import assert from 'node:assert';
import unifiedFlightTool from '../src/tools/unifiedFlightTool.js';

describe('Unified Flight Tool', () => {
    it('should have correct exports', () => {
        assert.ok(unifiedFlightTool.UnifiedFlightTool, 'UnifiedFlightTool class should be exported');
        assert.ok(unifiedFlightTool.definition, 'Tool definition should be exported');
        assert.ok(unifiedFlightTool.execute, 'Execute function should be exported');
    });

    it('should have comprehensive tool definition', () => {
        const definition = unifiedFlightTool.definition;

        assert.strictEqual(definition.name, 'unified_flight_search');
        assert.ok(definition.description.includes('Comprehensive flight and travel search'));
        assert.ok(definition.parameters);
        assert.ok(definition.parameters.properties);
        assert.ok(definition.parameters.properties.action);

        // Check key actions are included
        const actions = definition.parameters.properties.action.enum;
        assert.ok(actions.includes('search'));
        assert.ok(actions.includes('price_prediction'));
        assert.ok(actions.includes('inspiration'));
        assert.ok(actions.includes('hotel_search'));
        assert.ok(actions.includes('airport_search'));
    });

    it('should create tool instance without errors', () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool({
            enabled: true,
            sandbox: true
        });

        assert.ok(tool);
        assert.strictEqual(tool.enabled, true);
        assert.strictEqual(tool.sandbox, true);
    });

    it('should handle missing action parameter', async () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool({
            enabled: true,
            sandbox: true,
            clientId: 'test',
            clientSecret: 'test'
        });

        try {
            await tool.execute({});
            assert.fail('Should have thrown error for missing action');
        } catch (error) {
            assert.ok(error.message.includes('Unknown action: undefined'));
        }
    });

    it('should handle disabled tool', async () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool({
            enabled: false
        });

        try {
            await tool.execute({ action: 'search' });
            assert.fail('Should have thrown error for disabled tool');
        } catch (error) {
            assert.strictEqual(error.message, 'Flight tool is disabled');
        }
    });

    it('should handle missing credentials', async () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool({
            enabled: true,
            clientId: null,
            clientSecret: null
        });

        try {
            await tool.execute({ action: 'search', origin: 'JFK', destination: 'LAX' });
            assert.fail('Should have thrown error for missing credentials');
        } catch (error) {
            assert.strictEqual(error.message, 'Amadeus API credentials not configured');
        }
    });

    it('should format duration correctly', () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool();

        assert.strictEqual(tool.formatDuration('PT2H30M'), '2h 30m');
        assert.strictEqual(tool.formatDuration('PT1H'), '1h');
        assert.strictEqual(tool.formatDuration('PT45M'), '45m');
        assert.strictEqual(tool.formatDuration('invalid'), 'invalid');
    });

    it('should clean empty params correctly', () => {
        const tool = new unifiedFlightTool.UnifiedFlightTool();
        const params = new URLSearchParams({
            origin: 'JFK',
            destination: 'LAX',
            empty: '',
            undefined: 'undefined',
            valid: 'test'
        });

        tool.cleanEmptyParams(params);

        assert.ok(params.has('origin'));
        assert.ok(params.has('destination'));
        assert.ok(params.has('valid'));
        assert.ok(!params.has('empty'));
        assert.ok(!params.has('undefined'));
    });
});