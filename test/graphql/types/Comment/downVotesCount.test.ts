import { faker } from "@faker-js/faker";
import type { GraphQLObjectType } from "graphql";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { commentVotesTable } from "~/src/drizzle/tables/commentVotes";
import type { GraphQLContext } from "~/src/graphql/context";
import { schema } from "~/src/graphql/schema";
import type { Comment } from "~/src/graphql/types/Comment/Comment";
import { downVotesCountResolver } from "~/src/graphql/types/Comment/downVotesCount";

const commentType = schema.getType("Comment") as GraphQLObjectType;
if (!commentType) {
	throw new Error("Comment type not found in GraphQL schema");
}

const downVotesCountField = commentType.getFields().downVotesCount;
if (!downVotesCountField) {
	throw new Error("downVotesCount field not found on Comment type");
}

describe("Comment.downVotesCount GraphQL Field & Resolver", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let mockSelectChain: {
		from: Mock;
		where: Mock;
	};
	let mockComment: Comment;

	beforeEach(() => {
		vi.clearAllMocks();

		const { context, mocks: createdMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
		);
		ctx = context;
		mocks = createdMocks;

		mockSelectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn(),
		};
		mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);

		mockComment = {
			id: faker.string.uuid(),
			postId: faker.string.uuid(),
			creatorId: faker.string.uuid(),
			body: faker.lorem.sentence(),
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	});

	describe("Schema Field Definition", () => {
		it("should have correct description", () => {
			expect(downVotesCountField.description).toBe(
				"Total number of down votes on the comment.",
			);
		});

		it("should have Int return type", () => {
			expect(downVotesCountField.type.toString()).toBe("Int");
		});

		it("should not define any arguments", () => {
			expect(downVotesCountField.args).toEqual([]);
		});
	});

	describe("Resolver Execution", () => {
		it("should return the exact count when down votes exist for the comment", async () => {
			mockSelectChain.where.mockResolvedValue([{ count: 7 }]);

			const result = await downVotesCountResolver(mockComment, {}, ctx);

			expect(result).toBe(7);
			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(1);
			expect(mockSelectChain.from).toHaveBeenCalledWith(commentVotesTable);
			expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
		});

		it("should return 0 when no records are returned (undefined commentVote)", async () => {
			mockSelectChain.where.mockResolvedValue([]);

			const result = await downVotesCountResolver(mockComment, {}, ctx);

			expect(result).toBe(0);
			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(1);
			expect(mockSelectChain.from).toHaveBeenCalledWith(commentVotesTable);
			expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
		});

		it("should return 0 when the count returned by the database is 0", async () => {
			mockSelectChain.where.mockResolvedValue([{ count: 0 }]);

			const result = await downVotesCountResolver(mockComment, {}, ctx);

			expect(result).toBe(0);
			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(1);
			expect(mockSelectChain.from).toHaveBeenCalledWith(commentVotesTable);
			expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
		});

		it("should handle large counts accurately", async () => {
			mockSelectChain.where.mockResolvedValue([{ count: 125000 }]);

			const result = await downVotesCountResolver(mockComment, {}, ctx);

			expect(result).toBe(125000);
			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(1);
		});

		it("should propagate database errors when the query rejects", async () => {
			const dbError = new Error("Database query execution error");
			mockSelectChain.where.mockRejectedValue(dbError);

			await expect(
				downVotesCountResolver(mockComment, {}, ctx),
			).rejects.toThrow("Database query execution error");

			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(1);
			expect(mockSelectChain.from).toHaveBeenCalledWith(commentVotesTable);
			expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
		});

		it("should execute resolver wired via schema field", async () => {
			mockSelectChain.where.mockResolvedValue([{ count: 42 }]);

			const schemaResolver = downVotesCountField.resolve as (
				parent: Comment,
				args: Record<string, never>,
				ctx: GraphQLContext,
			) => Promise<number>;

			const result = await schemaResolver(mockComment, {}, ctx);

			expect(result).toBe(42);
		});

		it("should handle multiple concurrent resolution requests safely without cross-talk", async () => {
			const comment1: Comment = {
				id: faker.string.uuid(),
				postId: faker.string.uuid(),
				creatorId: faker.string.uuid(),
				body: "Comment 1",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const comment2: Comment = {
				id: faker.string.uuid(),
				postId: faker.string.uuid(),
				creatorId: faker.string.uuid(),
				body: "Comment 2",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const selectChain1 = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ count: 3 }]),
			};
			const selectChain2 = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ count: 15 }]),
			};

			mocks.drizzleClient.select = vi
				.fn()
				.mockReturnValueOnce(selectChain1)
				.mockReturnValueOnce(selectChain2);

			const [res1, res2] = await Promise.all([
				downVotesCountResolver(comment1, {}, ctx),
				downVotesCountResolver(comment2, {}, ctx),
			]);

			expect(res1).toBe(3);
			expect(res2).toBe(15);
			expect(mocks.drizzleClient.select).toHaveBeenCalledTimes(2);
			expect(selectChain1.from).toHaveBeenCalledWith(commentVotesTable);
			expect(selectChain2.from).toHaveBeenCalledWith(commentVotesTable);
		});
	});
});
