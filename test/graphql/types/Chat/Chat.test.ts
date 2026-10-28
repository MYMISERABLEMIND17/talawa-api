import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { Chat as ChatType } from "~/src/graphql/types/Chat/Chat";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

const { implementSpy, objectRefSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	const objectRef = vi.fn(() => ({ implement }));
	return { implementSpy: implement, objectRefSpy: objectRef };
});

vi.mock("~/src/graphql/builder", () => ({
	builder: {
		objectRef: objectRefSpy,
	},
}));

vi.mock("~/src/graphql/types/ChatMessage/ChatMessage", () => ({
	ChatMessage: {},
}));

type ResolverField<T = unknown> = {
	key?: string;
	opts?: {
		description?: string;
		nullable?: boolean;
	};
	description?: string;
	nullable?: boolean;
	type?: unknown;
	resolve: (
		parent: ChatType,
		args: Record<string, never>,
		ctx: GraphQLContext,
	) => Promise<T> | T;
};

type ChatFieldsMap = {
	avatarMimeType: ResolverField<string | null>;
	description: ResolverField<string | null>;
	id: ResolverField<string>;
	name: ResolverField<string | null>;
	unreadMessagesCount: ResolverField<number>;
	hasUnread: ResolverField<boolean>;
	firstUnreadMessageId: ResolverField<string | null>;
	lastMessage: ResolverField<unknown>;
};

describe("Chat GraphQL Type", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let mockChat: ChatType;
	let fields: ChatFieldsMap;
	let implementConfig: { description?: string };

	const createSelectChain = (result: unknown[]) => {
		const chain: Record<string, unknown> = Promise.resolve(result);
		chain.from = vi.fn(() => chain);
		chain.where = vi.fn((_whereClause: unknown) => chain);
		chain.orderBy = vi.fn(() => chain);
		chain.limit = vi.fn(() => Promise.resolve(result));
		return vi.fn(() => chain);
	};

	const mockFindFirstMembership = (result: unknown) => {
		mocks.drizzleClient.query.chatMembershipsTable.findFirst.mockImplementation(
			async (opts?: {
				where?: (fields: unknown, operators: unknown) => unknown;
			}) => {
				if (opts?.where) {
					const dummyFields = { chatId: "chatId", memberId: "memberId" };
					const dummyOperators = {
						eq: vi.fn((a, b) => ({ op: "eq", a, b })),
						and: vi.fn((...args) => ({ op: "and", args })),
					};
					opts.where(dummyFields, dummyOperators);
				}
				return result;
			},
		);
	};

	beforeAll(async () => {
		await import("~/src/graphql/types/Chat/Chat");

		expect(objectRefSpy).toHaveBeenCalledWith("Chat");
		expect(implementSpy).toHaveBeenCalled();

		implementConfig = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = (
			implementConfig as {
				fields: (t: Record<string, unknown>) => ChatFieldsMap;
			}
		)?.fields;

		const tStub = {
			exposeID: vi.fn((key: string, opts?: { description?: string }) => ({
				key,
				opts,
				resolve: (parent: Record<string, unknown>) => parent[key],
			})),
			exposeString: vi.fn((key: string, opts?: { description?: string }) => ({
				key,
				opts,
				resolve: (parent: Record<string, unknown>) => parent[key],
			})),
			int: vi.fn((config: unknown) => config),
			boolean: vi.fn((config: unknown) => config),
			id: vi.fn((config: unknown) => config),
			field: vi.fn((config: unknown) => config),
		};

		fields = fieldsFactory(tStub);
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
			name: "Core Engineering Team",
			description: "Real-time collaboration channel for engineers",
			avatarMimeType: "image/png",
			organizationId: faker.string.uuid(),
			creatorId: faker.string.uuid(),
			updaterId: faker.string.uuid(),
			createdAt: new Date("2026-01-01T10:00:00Z"),
			updatedAt: new Date("2026-01-02T10:00:00Z"),
		} as unknown as ChatType;

		vi.restoreAllMocks();
	});

	describe("Type definition and exposed fields", () => {
		it("should configure Chat type description properly", () => {
			expect(implementConfig.description).toBe(
				"Chats are controlled spaces within organizations where their members can communicate with each other in realtime.",
			);
		});

		it("should expose string and id fields correctly", () => {
			expect(fields.avatarMimeType.opts?.description).toBe(
				"Mime type of the avatar of the chat.",
			);
			expect(fields.avatarMimeType.resolve(mockChat, {}, ctx)).toBe(
				"image/png",
			);

			expect(fields.description.opts?.description).toBe(
				"Custom information about the chat.",
			);
			expect(fields.description.resolve(mockChat, {}, ctx)).toBe(
				"Real-time collaboration channel for engineers",
			);

			expect(fields.id.opts?.description).toBe(
				"Global identifier of the chat.",
			);
			expect(fields.id.opts?.nullable).toBe(false);
			expect(fields.id.resolve(mockChat, {}, ctx)).toBe(mockChat.id);

			expect(fields.name.opts?.description).toBe("Name of the chat.");
			expect(fields.name.resolve(mockChat, {}, ctx)).toBe(
				"Core Engineering Team",
			);
		});
	});

	describe("unreadMessagesCount resolver", () => {
		it("should throw unauthenticated error when client is unauthenticated", async () => {
			const { context: unauthCtx } = createMockGraphQLContext(false);

			await expect(
				fields.unreadMessagesCount.resolve(mockChat, {}, unauthCtx),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await fields.unreadMessagesCount.resolve(mockChat, {}, unauthCtx);
				expect.fail("Expected unauthenticated error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should return 0 when current user is not a member of the chat", async () => {
			mockFindFirstMembership(undefined);

			const result = await fields.unreadMessagesCount.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(0);
		});

		it("should calculate unread messages count using membership.lastReadAt", async () => {
			const lastReadAt = new Date("2026-03-01T12:00:00Z");
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt,
			});

			mocks.drizzleClient.select = createSelectChain([{ cnt: 5 }]);

			const result = await fields.unreadMessagesCount.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(5);
		});

		it("should default lastReadAt to epoch when membership.lastReadAt is null", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: null,
			});

			mocks.drizzleClient.select = createSelectChain([{ cnt: 12 }]);

			const result = await fields.unreadMessagesCount.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(12);
		});

		it("should return 0 when count query returns empty rows", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: new Date("2026-03-01T12:00:00Z"),
			});

			mocks.drizzleClient.select = createSelectChain([]);

			const result = await fields.unreadMessagesCount.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(0);
		});
	});

	describe("hasUnread resolver", () => {
		it("should throw unauthenticated error when client is unauthenticated", async () => {
			const { context: unauthCtx } = createMockGraphQLContext(false);

			await expect(
				fields.hasUnread.resolve(mockChat, {}, unauthCtx),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await fields.hasUnread.resolve(mockChat, {}, unauthCtx);
				expect.fail("Expected unauthenticated error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should return false when current user is not a member of the chat", async () => {
			mockFindFirstMembership(undefined);

			const result = await fields.hasUnread.resolve(mockChat, {}, ctx);
			expect(result).toBe(false);
		});

		it("should return true when unread messages exist in the chat", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: new Date("2026-03-01T12:00:00Z"),
			});

			mocks.drizzleClient.select = createSelectChain([{ id: "msg-1" }]);

			const result = await fields.hasUnread.resolve(mockChat, {}, ctx);
			expect(result).toBe(true);
		});

		it("should default lastReadAt to epoch and return true when lastReadAt is null", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: null,
			});

			mocks.drizzleClient.select = createSelectChain([{ id: "msg-2" }]);

			const result = await fields.hasUnread.resolve(mockChat, {}, ctx);
			expect(result).toBe(true);
		});

		it("should return false when no unread messages are found", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: new Date("2026-03-01T12:00:00Z"),
			});

			mocks.drizzleClient.select = createSelectChain([]);

			const result = await fields.hasUnread.resolve(mockChat, {}, ctx);
			expect(result).toBe(false);
		});
	});

	describe("firstUnreadMessageId resolver", () => {
		it("should throw unauthenticated error when client is unauthenticated", async () => {
			const { context: unauthCtx } = createMockGraphQLContext(false);

			await expect(
				fields.firstUnreadMessageId.resolve(mockChat, {}, unauthCtx),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await fields.firstUnreadMessageId.resolve(mockChat, {}, unauthCtx);
				expect.fail("Expected unauthenticated error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should return null when current user is not a member of the chat", async () => {
			mockFindFirstMembership(undefined);

			const result = await fields.firstUnreadMessageId.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBeNull();
		});

		it("should return the ID of the first unread message when unread messages exist", async () => {
			const messageId = faker.string.uuid();
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: new Date("2026-03-01T12:00:00Z"),
			});

			mocks.drizzleClient.select = createSelectChain([{ id: messageId }]);

			const result = await fields.firstUnreadMessageId.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(messageId);
		});

		it("should default lastReadAt to epoch and return first unread message id when lastReadAt is null", async () => {
			const messageId = faker.string.uuid();
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: null,
			});

			mocks.drizzleClient.select = createSelectChain([{ id: messageId }]);

			const result = await fields.firstUnreadMessageId.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBe(messageId);
		});

		it("should return null when no unread messages exist in the chat", async () => {
			mockFindFirstMembership({
				chatId: mockChat.id,
				memberId: "user-123",
				lastReadAt: new Date("2026-03-01T12:00:00Z"),
			});

			mocks.drizzleClient.select = createSelectChain([]);

			const result = await fields.firstUnreadMessageId.resolve(
				mockChat,
				{},
				ctx,
			);
			expect(result).toBeNull();
		});
	});

	describe("lastMessage resolver", () => {
		it("should throw unauthenticated error when client is unauthenticated", async () => {
			const { context: unauthCtx } = createMockGraphQLContext(false);

			await expect(
				fields.lastMessage.resolve(mockChat, {}, unauthCtx),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await fields.lastMessage.resolve(mockChat, {}, unauthCtx);
				expect.fail("Expected unauthenticated error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("unauthenticated");
			}
		});

		it("should return the latest message when messages exist in the chat", async () => {
			const latestMessage = {
				id: faker.string.uuid(),
				chatId: mockChat.id,
				body: "See you all in the standup meeting!",
				creatorId: "user-123",
				createdAt: new Date("2026-03-01T14:30:00Z"),
			};

			mocks.drizzleClient.select = createSelectChain([latestMessage]);

			const result = await fields.lastMessage.resolve(mockChat, {}, ctx);
			expect(result).toEqual(latestMessage);
		});

		it("should return null when no messages exist in the chat", async () => {
			mocks.drizzleClient.select = createSelectChain([]);

			const result = await fields.lastMessage.resolve(mockChat, {}, ctx);
			expect(result).toBeNull();
		});
	});
});
