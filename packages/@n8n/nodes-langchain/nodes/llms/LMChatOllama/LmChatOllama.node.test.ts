import { ChatOllamaWithReasoning } from './LmChatOllama.node';

describe('ChatOllamaWithReasoning', () => {
	test('invocationParams sets think true without reasoning', () => {
		const model = new ChatOllamaWithReasoning({
			baseUrl: 'http://localhost:11434',
			model: 'test-model',
		});
		const params = model.invocationParams({ think: true } as any);
		expect(params.think).toBe(true);
		expect('reasoning' in params).toBe(false);
	});
});
