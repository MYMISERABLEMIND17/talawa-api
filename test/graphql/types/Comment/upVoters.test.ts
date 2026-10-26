import { faker } from "@faker-js/faker";
import type {
	GraphQLFieldResolver,
	GraphQLObjectType,
	GraphQLResolveInfo,
} from "graphql";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import "~/src/graphql/scalars";
import { schema } from "~/src/graphql/schema";
import type { Comment as CommentType } from "~/src/graphql/types/Comment/Comment";
import "~/src/graphql/types/Comment/Comment";
import "~/src/graphql/types/Comment/upVoters";
import { upVotersComplexity } from "~/src/graphql/types/Comment/upVoters";
import type { User } from "~/src/graphql/types/User/User";
import envConfig from "~/src/utilities/graphqLimits";
import type { DefaultGraphQLConnection as Connection } from "~/src/utilities/graphqlConnection";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

const commentType = schema.getType("Comment") as GraphQLObjectType;
const upVotersField = commentType.getFields().upVoters;
if (!upVotersField?.resolve) {
	throw new Error("upVoters field or resolver not found on Comment schema");
}
const resolveUpVoters = upVotersField.resolve as GraphQLFieldResolver<
	CommentType,
	GraphQLContext
>;

describe("Comment Resolver - upVoters", () => {
	let mockComment: CommentType;
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
		);
		ctx = context;
		mocks = newMocks;

		mockComment = {
			body: faker.lorem.sentence(),
			createdAt: new Date(),
			creatorId: faker.string.uuid(),
			id: faker.string.uuid(),
			postId: faker.string.uuid(),
			updatedAt: new Date(),
		} as CommentType;

		const mockSelectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
		};
		mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);
	});

	describe("Complexity calculation", () => {
		it("should calculate complexity with 'first' multiplier", () => {
			expect(upVotersComplexity({ first: 10 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 10,
			});
		});

		it("should calculate complexity with 'last' multiplier", () => {
			expect(upVotersComplexity({ last: 5 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 5,
			});
		});

		it("should default multiplier to 1 when no arguments are provided", () => {
			expect(upVotersComplexity({})).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});

		it("should default multiplier to 1 when first and last are 0 or null", () => {
			expect(upVotersComplexity({ first: 0, last: null })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Schema registration", () => {
		it("should have upVoters field registered on Comment type", () => {
			expect(upVotersField).toBeDefined();
			expect(upVotersField?.description).toBe(
				"GraphQL connection to traverse through the users that up voted the comment.",
			);
			expect(upVotersField?.resolve).toBeDefined();
		});
	});

	describe("Forward pagination (first / after)", () => {
		it("should return upvoters successfully without cursor", async () => {
			const mockDate = new Date();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockVotes = [
				{
					createdAt: mockDate,
					creatorId: user1Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user1Id,
						name: faker.person.fullName(),
					},
				},
				{
					createdAt: mockDate,
					creatorId: user2Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user2Id,
						name: faker.person.fullName(),
					},
				},
			];

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(2);
			expect(result.edges[0]?.node).toEqual(mockVotes[0]?.creator);
			expect(result.edges[1]?.node).toEqual(mockVotes[1]?.creator);
			expect(
				mocks.drizzleClient.query.commentVotesTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle forward pagination with cursor (after)", async () => {
			const mockDate = new Date();
			const cursorCreatorId = faker.string.uuid();
			const resultCreatorId = faker.string.uuid();

			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					creatorId: cursorCreatorId,
				}),
			).toString("base64url");

			const mockVotes = [
				{
					createdAt: mockDate,
					creatorId: resultCreatorId,
					creator: {
						emailAddress: faker.internet.email(),
						id: resultCreatorId,
						name: faker.person.fullName(),
					},
				},
			];

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
			};
			mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ after: mockCursor, first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(resultCreatorId);
			expect(
				mocks.drizzleClient.query.commentVotesTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});
	});

	describe("Backward pagination (last / before)", () => {
		it("should return upvoters successfully without cursor (last only)", async () => {
			const mockDate = new Date();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockVotes = [
				{
					createdAt: mockDate,
					creatorId: user1Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user1Id,
						name: faker.person.fullName(),
					},
				},
				{
					createdAt: mockDate,
					creatorId: user2Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user2Id,
						name: faker.person.fullName(),
					},
				},
			];

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ last: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(2);
			expect(
				mocks.drizzleClient.query.commentVotesTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle backward pagination with cursor (before)", async () => {
			const olderDate = new Date("2025-01-01T10:00:00Z");
			const newerDate = new Date("2025-01-01T11:00:00Z");
			const cursorCreatorId = faker.string.uuid();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: newerDate.toISOString(),
					creatorId: cursorCreatorId,
				}),
			).toString("base64url");

			const mockVotes = [
				{
					createdAt: olderDate,
					creatorId: user1Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user1Id,
						name: faker.person.fullName(),
					},
				},
				{
					createdAt: newerDate,
					creatorId: user2Id,
					creator: {
						emailAddress: faker.internet.email(),
						id: user2Id,
						name: faker.person.fullName(),
					},
				},
			];

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
			};
			mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ before: mockCursor, last: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(2);
			// For backward pagination, results are reversed
			expect(result.edges[0]?.node.id).toBe(user2Id);
			expect(result.edges[1]?.node.id).toBe(user1Id);
		});
	});

	describe("Validation and Error Handling", () => {
		it("should throw invalid_arguments error for invalid cursor on forward pagination", async () => {
			const invalidCursor = "not-valid-base64url";
			await expect(
				resolveUpVoters(
					mockComment,
					{ after: invalidCursor, first: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "invalid_arguments",
					}),
				}),
			);
		});

		it("should throw invalid_arguments error for invalid cursor on backward pagination", async () => {
			const invalidCursor = "not-valid-base64url";
			await expect(
				resolveUpVoters(
					mockComment,
					{ before: invalidCursor, last: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "invalid_arguments",
					}),
				}),
			);
		});

		it("should throw invalid_arguments error when both first and last are missing", async () => {
			await expect(
				resolveUpVoters(mockComment, {}, ctx, {} as GraphQLResolveInfo),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw arguments_associated_resources_not_found when forward cursor returns 0 items", async () => {
			const mockDate = new Date();
			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					creatorId: faker.string.uuid(),
				}),
			).toString("base64url");

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveUpVoters(
					mockComment,
					{ after: mockCursor, first: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "arguments_associated_resources_not_found",
					}),
				}),
			);
		});

		it("should throw arguments_associated_resources_not_found when backward cursor returns 0 items", async () => {
			const mockDate = new Date();
			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					creatorId: faker.string.uuid(),
				}),
			).toString("base64url");

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveUpVoters(
					mockComment,
					{ before: mockCursor, last: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "arguments_associated_resources_not_found",
					}),
				}),
			);
		});
	});

	describe("Data transformations and edge cases", () => {
		it("should fallback to empty string when creatorId is null", async () => {
			const mockDate = new Date();
			const validUserId = faker.string.uuid();

			const mockVotes = [
				{
					createdAt: mockDate,
					creatorId: null,
					creator: {
						emailAddress: faker.internet.email(),
						id: validUserId,
						name: faker.person.fullName(),
					},
				},
			];

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.cursor).toBeDefined();
		});

		it("should filter out votes where creator is null", async () => {
			const mockDate = new Date();
			const validUserId = faker.string.uuid();

			const mockVotes = [
				{
					createdAt: mockDate,
					creatorId: validUserId,
					creator: {
						emailAddress: faker.internet.email(),
						id: validUserId,
						name: faker.person.fullName(),
					},
				},
				{
					createdAt: mockDate,
					creatorId: null,
					creator: null,
				},
			];

			mocks.drizzleClient.query.commentVotesTable.findMany.mockResolvedValueOnce(
				mockVotes,
			);

			const result = (await resolveUpVoters(
				mockComment,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(validUserId);
		});
	});
});
