import { Buffer } from "node:buffer";
import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { Chat as ChatType } from "~/src/graphql/types/Chat/Chat";
import {
	messagesComplexity,
	resolveChatMessagesPaginated,
} from "~/src/graphql/types/Chat/messages";
import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

const { implementSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	return { implementSpy: implement };
});

vi.mock("~/src/graphql/types/Chat/Chat", () => ({
	Chat: {
		implement: implementSpy,
	},
}));

vi.mock("~/src/graphql/types/ChatMessage/ChatMessage", () => ({
	ChatMessage: {},
}));

type ComplexityResult = {
	field: number;
	multiplier: number;
};

type ConnectionConfig = {
	description: string;
	resolve: typeof resolveChatMessagesPaginated;
	complexity: typeof messagesComplexity;
	type: unknown;
	edgesField?: { complexity: ComplexityResult };
	nodeField?: { complexity: ComplexityResult };
};

type ChatFieldsMap = {
	messages: ConnectionConfig;
};

const makeCursor = (data: { id: string }) => {
	return Buffer.from(JSON.stringify(data), "utf-8").toString("base64url");
};

describe("Chat messages connection field", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let mockChat: ChatType;
	let connectionField: ConnectionConfig;

	const mockCurrentUser = (user?: {
		id: string;
		role: string;
		organizationMembershipsWhereMember: Array<{ role: string }>;
		chatMembershipsWhereMember: Array<{ role: string }>;
	}) => {
		mocks.drizzleClient.query.usersTable.findFirst.mockImplementation(
			async (opts?: {
				with?: {
					chatMembershipsWhereMember?: {
						where?: (fields: unknown, operators: unknown) => unknown;
					};
					organizationMembershipsWhereMember?: {
						where?: (fields: unknown, operators: unknown) => unknown;
					};
				};
				where?: (fields: unknown, operators: unknown) => unknown;
			}) => {
				if (opts?.where) {
					const dummyFields = { id: "id" };
					const dummyOps = { eq: vi.fn((a, b) => ({ op: "eq", a, b })) };
					opts.where(dummyFields, dummyOps);
				}
				if (opts?.with?.chatMembershipsWhereMember?.where) {
					const dummyFields = { chatId: "chatId" };
					const dummyOps = { eq: vi.fn((a, b) => ({ op: "eq", a, b })) };
					opts.with.chatMembershipsWhereMember.where(dummyFields, dummyOps);
				}
				if (opts?.with?.organizationMembershipsWhereMember?.where) {
					const dummyFields = { organizationId: "organizationId" };
					const dummyOps = { eq: vi.fn((a, b) => ({ op: "eq", a, b })) };
					opts.with.organizationMembershipsWhereMember.where(
						dummyFields,
						dummyOps,
					);
				}
				return user;
			},
		);
	};

	beforeAll(async () => {
		await import("~/src/graphql/types/Chat/messages");

		const implementCall = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = implementCall?.fields;

		const tStub = {
			connection: vi.fn((config, edgesOpts, nodeOpts) => ({
				...config,
				edgesField: edgesOpts?.edgesField,
				nodeField: nodeOpts?.nodeField,
			})),
		};

		const fields = fieldsFactory(tStub) as ChatFieldsMap;
		connectionField = fields.messages;
	});

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			"user-123",
		);
		ctx = context;
		mocks = newMocks;

		mockChat = {
			id: faker.string.uuid(),
			organizationId: faker.string.uuid(),
			name: "Core Engineering",
			description: "General dev talk",
			avatarMimeType: "image/png",
			creatorId: faker.string.uuid(),
			updaterId: faker.string.uuid(),
			createdAt: new Date("2026-01-01T10:00:00Z"),
			updatedAt: new Date("2026-01-02T10:00:00Z"),
		} as unknown as ChatType;

		mockCurrentUser({
			id: "user-123",
			role: "regular",
			organizationMembershipsWhereMember: [{ role: "regular" }],
			chatMembershipsWhereMember: [{ role: "regular" }],
		});

		mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue([]);

		mocks.drizzleClient.select = vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({})),
			})),
		}));
	});

	describe("Schema definition and complexity", () => {
		it("should register the messages connection field with proper description and type", () => {
			expect(connectionField).toBeDefined();
			expect(connectionField.description).toBe(
				"GraphQL connection to traverse through the messages created within the chat.",
			);
			expect(connectionField.resolve).toBe(resolveChatMessagesPaginated);
			expect(connectionField.complexity).toBe(messagesComplexity);
		});

		it("should calculate complexity based on first, last, or default multiplier", () => {
			expect(messagesComplexity({ first: 20 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 20,
			});
			expect(messagesComplexity({ last: 15 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 15,
			});
			expect(messagesComplexity({})).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});

		it("should configure edges and node field complexities correctly", () => {
			expect(connectionField.edgesField?.complexity).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
			expect(connectionField.nodeField?.complexity).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Arguments validation", () => {
		it("should throw invalid_arguments error when both first and last are provided", async () => {
			await expect(
				resolveChatMessagesPaginated(
					mockChat,
					{ first: 10, last: 5 } as unknown as { first: number },
					ctx,
				),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ first: 10, last: 5 } as unknown as { first: number },
					ctx,
				);
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
			}
		});

		it("should throw invalid_arguments error when neither first nor last is provided", async () => {
			await expect(
				resolveChatMessagesPaginated(
					mockChat,
					{} as unknown as { first: number },
					ctx,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw invalid_arguments error when malformed cursor is passed with forward pagination (after)", async () => {
			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ first: 10, after: "not-a-valid-cursor" },
					ctx,
				);
				expect.fail("Expected invalid arguments error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["after"]);
			}
		});

		it("should throw invalid_arguments error when malformed cursor is passed with backward pagination (before)", async () => {
			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ last: 10, before: "bad-before-cursor" },
					ctx,
				);
				expect.fail("Expected invalid arguments error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["before"]);
			}
		});

		it("should throw invalid_arguments error when cursor JSON lacks valid id", async () => {
			const badCursor = Buffer.from(
				JSON.stringify({ id: "not-a-valid-uuid" }),
			).toString("base64url");

			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ first: 10, after: badCursor },
					ctx,
				);
				expect.fail("Expected invalid arguments error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["after"]);
			}
		});
	});

	describe("Authentication and Authorization", () => {
		it("should throw unauthenticated error when client is not authenticated", async () => {
			const { context: unauthCtx } = createMockGraphQLContext(false);

			await expect(
				resolveChatMessagesPaginated(mockChat, { first: 10 }, unauthCtx),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await resolveChatMessagesPaginated(mockChat, { first: 10 }, unauthCtx);
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should throw unauthenticated error when current user is not found in database", async () => {
			mockCurrentUser(undefined);

			try {
				await resolveChatMessagesPaginated(mockChat, { first: 10 }, ctx);
				expect.fail("Expected unauthenticated error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should allow access when current user has system administrator role", async () => {
			mockCurrentUser({
				id: "admin-user",
				role: "administrator",
				organizationMembershipsWhereMember: [],
				chatMembershipsWhereMember: [],
			});

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10 },
				ctx,
			);
			expect(result.edges).toEqual([]);
		});

		it("should allow access when current user is an organization administrator", async () => {
			mockCurrentUser({
				id: "org-admin-user",
				role: "regular",
				organizationMembershipsWhereMember: [{ role: "administrator" }],
				chatMembershipsWhereMember: [],
			});

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10 },
				ctx,
			);
			expect(result.edges).toEqual([]);
		});

		it("should allow access when current user is both an organization member and a chat member", async () => {
			mockCurrentUser({
				id: "member-user",
				role: "regular",
				organizationMembershipsWhereMember: [{ role: "regular" }],
				chatMembershipsWhereMember: [{ role: "regular" }],
			});

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10 },
				ctx,
			);
			expect(result.edges).toEqual([]);
		});

		it("should throw unauthorized_action error when user is not a member of the organization", async () => {
			mockCurrentUser({
				id: "outsider-user",
				role: "regular",
				organizationMembershipsWhereMember: [],
				chatMembershipsWhereMember: [],
			});

			try {
				await resolveChatMessagesPaginated(mockChat, { first: 10 }, ctx);
				expect.fail("Expected unauthorized_action error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthorized_action");
			}
		});

		it("should throw unauthorized_action error when user is an organization member but not a chat member", async () => {
			mockCurrentUser({
				id: "org-member-not-chat-member",
				role: "regular",
				organizationMembershipsWhereMember: [{ role: "regular" }],
				chatMembershipsWhereMember: [],
			});

			try {
				await resolveChatMessagesPaginated(mockChat, { first: 10 }, ctx);
				expect.fail("Expected unauthorized_action error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthorized_action");
			}
		});
	});

	describe("Forward pagination", () => {
		it("should return empty connection when no chat messages exist without cursor", async () => {
			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10 },
				ctx,
			);

			expect(result.edges).toHaveLength(0);
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		it("should return messages connection with edges and nodes when messages exist", async () => {
			const msgId = faker.string.uuid();
			const mockMessage = {
				id: msgId,
				chatId: mockChat.id,
				creatorId: "user-123",
				body: "Hello team!",
				createdAt: new Date("2026-03-01T10:00:00Z"),
				updatedAt: new Date("2026-03-01T10:00:00Z"),
			};

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue([
				mockMessage,
			]);

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10 },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(msgId);
			expect(result.edges[0]?.node.body).toBe("Hello team!");
		});

		it("should handle forward pagination with a valid after cursor", async () => {
			const cursorId = faker.string.uuid();
			const validAfterCursor = makeCursor({ id: cursorId });

			const nextMsgId = faker.string.uuid();
			const nextMessage = {
				id: nextMsgId,
				chatId: mockChat.id,
				creatorId: "user-123",
				body: "Next message after cursor",
				createdAt: new Date("2026-03-01T10:05:00Z"),
				updatedAt: new Date("2026-03-01T10:05:00Z"),
			};

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue([
				nextMessage,
			]);

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ first: 10, after: validAfterCursor },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(nextMsgId);
		});

		it("should throw arguments_associated_resources_not_found when forward cursor returns 0 items", async () => {
			const validAfterCursor = makeCursor({ id: faker.string.uuid() });

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue(
				[],
			);

			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ first: 10, after: validAfterCursor },
					ctx,
				);
				expect.fail("Expected missing resource error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe(
					"arguments_associated_resources_not_found",
				);
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["after"]);
			}
		});
	});

	describe("Backward pagination", () => {
		it("should return empty connection when no chat messages exist without cursor", async () => {
			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ last: 5 },
				ctx,
			);

			expect(result.edges).toHaveLength(0);
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		it("should return messages connection with edges and nodes when backward query returns messages", async () => {
			const msgId = faker.string.uuid();
			const mockMessage = {
				id: msgId,
				chatId: mockChat.id,
				creatorId: "user-123",
				body: "Previous message in chat",
				createdAt: new Date("2026-03-01T09:50:00Z"),
				updatedAt: new Date("2026-03-01T09:50:00Z"),
			};

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue([
				mockMessage,
			]);

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ last: 5 },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(msgId);
		});

		it("should handle backward pagination with a valid before cursor", async () => {
			const cursorId = faker.string.uuid();
			const validBeforeCursor = makeCursor({ id: cursorId });

			const prevMsgId = faker.string.uuid();
			const prevMessage = {
				id: prevMsgId,
				chatId: mockChat.id,
				creatorId: "user-123",
				body: "Message before cursor",
				createdAt: new Date("2026-03-01T09:40:00Z"),
				updatedAt: new Date("2026-03-01T09:40:00Z"),
			};

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue([
				prevMessage,
			]);

			const result = await resolveChatMessagesPaginated(
				mockChat,
				{ last: 5, before: validBeforeCursor },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(prevMsgId);
		});

		it("should throw arguments_associated_resources_not_found when backward cursor returns 0 items", async () => {
			const validBeforeCursor = makeCursor({ id: faker.string.uuid() });

			mocks.drizzleClient.query.chatMessagesTable.findMany.mockResolvedValue(
				[],
			);

			try {
				await resolveChatMessagesPaginated(
					mockChat,
					{ last: 5, before: validBeforeCursor },
					ctx,
				);
				expect.fail("Expected missing resource error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe(
					"arguments_associated_resources_not_found",
				);
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["before"]);
			}
		});
	});
});
