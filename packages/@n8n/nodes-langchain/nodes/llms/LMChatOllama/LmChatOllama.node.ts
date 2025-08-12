import type { ChatOllamaInput } from '@langchain/ollama';
import { ChatOllama } from '@langchain/ollama';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessageChunk } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import {
	convertOllamaMessagesToLangChain,
	convertToOllamaMessages,
} from '@langchain/ollama/dist/utils.js';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { getConnectionHintNoticeField } from '@utils/sharedFields';

import { ollamaModel, ollamaOptions, ollamaDescription } from '../LMOllama/description';
import { makeN8nLlmFailedAttemptHandler } from '../n8nLlmFailedAttemptHandler';
import { N8nLlmTracing } from '../N8nLlmTracing';

export class ChatOllamaWithReasoning extends ChatOllama {
	invocationParams(options: this['ParsedCallOptions']) {
		const params = super.invocationParams(options) as any;
		const think = (options as any)?.think;
		const reasoningEffort = (options as any)?.reasoningEffort;
		if (think) {
			params.think = true;
			if (reasoningEffort) {
				params.reasoning = reasoningEffort;
			}
		}
		return params;
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun,
	): AsyncGenerator<ChatGenerationChunk> {
		if (this.checkOrPullModel) {
			if (!(await this.checkModelExistsOnMachine(this.model))) {
				await this.pull(this.model, {
					logProgress: true,
				});
			}
		}
		const params = this.invocationParams(options);
		const ollamaMessages = convertToOllamaMessages(messages);
		const usageMetadata = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
		const stream = await this.client.chat({
			...params,
			messages: ollamaMessages,
			stream: true,
		});
		let lastMetadata: Record<string, unknown> | undefined;
		let lastThinking: string | undefined;
		for await (const chunk of stream as AsyncIterable<any>) {
			if (options.signal?.aborted) {
				this.client.abort();
			}
			const { message: responseMessage, ...rest } = chunk as any;
			const thinking = (responseMessage as any)?.thinking ?? (rest as any)?.thinking;
			usageMetadata.input_tokens += rest.prompt_eval_count ?? 0;
			usageMetadata.output_tokens += rest.eval_count ?? 0;
			usageMetadata.total_tokens = usageMetadata.input_tokens + usageMetadata.output_tokens;
			lastMetadata = rest;
			if (thinking) {
				lastThinking = thinking;
			}
			const lcMessage = convertOllamaMessagesToLangChain(responseMessage);
			if (thinking) {
				lcMessage.additional_kwargs = {
					...lcMessage.additional_kwargs,
					thinking,
				};
			}
			yield new ChatGenerationChunk({
				text: responseMessage.content ?? '',
				message: lcMessage,
			});
			await runManager?.handleLLMNewToken(responseMessage.content ?? '');
		}
		yield new ChatGenerationChunk({
			text: '',
			message: new AIMessageChunk({
				content: '',
				additional_kwargs: lastThinking ? { thinking: lastThinking } : undefined,
				response_metadata: lastMetadata,
				usage_metadata: usageMetadata,
			}),
		});
	}
}

export class LmChatOllama implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ollama Chat Model',

		name: 'lmChatOllama',
		icon: 'file:ollama.svg',
		group: ['transform'],
		version: 1,
		description: 'Language Model Ollama',
		defaults: {
			name: 'Ollama Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatollama/',
					},
				],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		...ollamaDescription,
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			ollamaModel,
			ollamaOptions,
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('ollamaApi');

		const modelName = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as ChatOllamaInput;
		const headers = credentials.apiKey
			? {
					Authorization: `Bearer ${credentials.apiKey as string}`,
				}
			: undefined;

		const model = new ChatOllamaWithReasoning({
			...options,
			baseUrl: credentials.baseUrl as string,
			model: modelName,
			format: options.format === 'default' ? undefined : options.format,
			callbacks: [new N8nLlmTracing(this)],
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			headers,
		});

		return {
			response: model,
		};
	}
}
