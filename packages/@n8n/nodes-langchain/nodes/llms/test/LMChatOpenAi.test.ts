import { mock } from 'jest-mock-extended';
import type { ISupplyDataFunctions } from 'n8n-workflow';

import { LmChatOpenAi } from '../LMChatOpenAi/LmChatOpenAi.node';

describe('LmChatOpenAi', () => {
	const node = new LmChatOpenAi();

	it.each([
		{
			name: 'no reasoning options',
			options: {},
			assert: (params: Record<string, unknown>) => {
				expect(params).not.toHaveProperty('reasoning');
			},
		},
		{
			name: 'reasoning effort set',
			options: { reasoningEffort: 'medium' },
			assert: (params: Record<string, unknown>) => {
				expect(params).toMatchObject({ reasoning: { effort: 'medium' } });
			},
		},
	])('serializes correctly when $name', async ({ options, assert }) => {
		const exec = mock<ISupplyDataFunctions>();
		exec.getCredentials.mockResolvedValue({ apiKey: 'test' });
		exec.getNode.mockReturnValue({ typeVersion: 1.2 });
		exec.getNodeParameter.mockImplementation((name: string) => {
			if (name === 'model.value') return 'o3-mini';
			if (name === 'options') return options;
			return undefined;
		});

		const result = await node.supplyData.call(exec, 0);
		const params = (result.response as any).invocationParams({});

		assert(params);
	});
});
