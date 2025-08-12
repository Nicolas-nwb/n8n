import { mock } from 'jest-mock-extended';
import type { ISupplyDataFunctions } from 'n8n-workflow';

import { LmChatOllama } from '../LMChatOllama/LmChatOllama.node';

describe('LmChatOllama', () => {
	const node = new LmChatOllama();

	it.each([
		{
			name: 'no reasoning options',
			options: {},
			assert: (params: Record<string, unknown>) => {
				expect(params).not.toHaveProperty('think');
				expect(params).not.toHaveProperty('reasoning');
			},
		},
		{
			name: 'thinking disabled',
			options: { think: false },
			assert: (params: Record<string, unknown>) => {
				expect(params).not.toHaveProperty('think');
				expect(params).not.toHaveProperty('reasoning');
			},
		},
		{
			name: 'thinking enabled with effort',
			options: { think: true, reasoningEffort: 'medium' },
			assert: (params: Record<string, unknown>) => {
				expect(params).toMatchObject({
					think: true,
					reasoning: { effort: 'medium' },
				});
			},
		},
	])('serializes correctly when $name', async ({ options, assert }) => {
		const exec = mock<ISupplyDataFunctions>();
		exec.getCredentials.mockResolvedValue({ baseUrl: 'http://localhost' });
		exec.getNodeParameter.mockImplementation((name: string) => {
			if (name === 'model') return 'llama3.2';
			if (name === 'options') return options;
			return undefined;
		});

		const result = await node.supplyData.call(exec, 0);
		const params = (result.response as any).invocationParams({});

		assert(params);
	});
});
