import { faker } from "@faker-js/faker";
import type {
	GraphQLFieldResolver,
	GraphQLObjectType,
	GraphQLResolveInfo,
} from "graphql";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import { schema } from "~/src/graphql/schema";
import "~/src/graphql/scalars";
import "~/src/graphql/types/Tag/Tag";
import { assigneesComplexity } from "~/src/graphql/types/Tag/assignees";
import type { Tag as TagType } from "~/src/graphql/types/Tag/Tag";
import "~/src/graphql/types/Tag/assignees";
import type { User } from "~/src/graphql/types/User/User";
import envConfig from "~/src/utilities/graphqLimits";
import type { DefaultGraphQLConnection as Connection } from "~/src/utilities/graphqlConnection";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

// Retrieve the Tag.assignees field resolver from the Pothos schema
const tagType = schema.getType("Tag") as GraphQLObjectType;
const assigneesField = tagType.getFields().assignees;
if (!assigneesField?.resolve) {
	throw new Error("Assignees field or resolver not found in schema");
}
const resolveAssignees = assigneesField.resolve as GraphQLFieldResolver<
	TagType,
	GraphQLContext
>;

describe("Tag.assignees Field Resolver", () => {
	let mockTag: TagType;
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
		);
		ctx = context;
		mocks = newMocks;

		mockTag = {
			id: faker.string.uuid(),
			name: "Test Tag",
			createdAt: new Date(),
			creatorId: faker.string.uuid(),
			folderId: faker.string.uuid(),
			organizationId: faker.string.uuid(),
		} as TagType;
	});

	describe("Complexity calculation", () => {
		it("should calculate complexity correctly with first argument", () => {
			expect(assigneesComplexity({ first: 10 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 10,
			});
		});

		it("should calculate complexity correctly with last argument", () => {
			expect(assigneesComplexity({ last: 5 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 5,
			});
		});

		it("should calculate complexity correctly with default multiplier when no limits are provided", () => {
			expect(assigneesComplexity({})).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Data retrieval and forward pagination", () => {
		it("should return assignees successfully when first is provided", async () => {
			const mockDate = new Date();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockAssignments = [
				{
					createdAt: mockDate,
					assigneeId: user1Id,
					assignee: {
						id: user1Id,
						name: "User One",
						emailAddress: "user1@example.com",
					},
				},
				{
					createdAt: mockDate,
					assigneeId: user2Id,
					assignee: {
						id: user2Id,
						name: "User Two",
						emailAddress: "user2@example.com",
					},
				},
			];

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				mockAssignments,
			);

			const result = (await resolveAssignees(
				mockTag,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(2);
			expect(result.edges[0]?.node).toEqual(mockAssignments[0]?.assignee);
			expect(result.edges[1]?.node).toEqual(mockAssignments[1]?.assignee);
			expect(
				mocks.drizzleClient.query.tagAssignmentsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle forward pagination with after cursor", async () => {
			const mockDate = new Date();
			const cursorAssigneeId = faker.string.uuid();
			const resultAssigneeId = faker.string.uuid();

			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					assigneeId: cursorAssigneeId,
				}),
			).toString("base64url");

			const mockAssignments = [
				{
					createdAt: mockDate,
					assigneeId: resultAssigneeId,
					assignee: {
						id: resultAssigneeId,
						name: "Next Assignee",
						emailAddress: "next@example.com",
					},
				},
			];

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
			};
			mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				mockAssignments,
			);

			const result = (await resolveAssignees(
				mockTag,
				{ first: 5, after: mockCursor },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(resultAssigneeId);
			expect(
				mocks.drizzleClient.query.tagAssignmentsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should return empty connection when tag has no assignees and no cursor is provided", async () => {
			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				[],
			);

			const result = (await resolveAssignees(
				mockTag,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(0);
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});
	});

	describe("Backward pagination", () => {
		it("should handle backward pagination without cursor (last only)", async () => {
			const mockDate = new Date();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockAssignments = [
				{
					createdAt: mockDate,
					assigneeId: user1Id,
					assignee: {
						id: user1Id,
						name: "User One",
						emailAddress: "user1@example.com",
					},
				},
				{
					createdAt: mockDate,
					assigneeId: user2Id,
					assignee: {
						id: user2Id,
						name: "User Two",
						emailAddress: "user2@example.com",
					},
				},
			];

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				mockAssignments,
			);

			const result = (await resolveAssignees(
				mockTag,
				{ last: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			// Results are reversed by transformToDefaultGraphQLConnection for isInversed=true
			expect(result.edges).toHaveLength(2);
			expect(result.edges[0]?.node.id).toBe(user2Id);
			expect(result.edges[1]?.node.id).toBe(user1Id);
			expect(
				mocks.drizzleClient.query.tagAssignmentsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle backward pagination with before cursor", async () => {
			const olderDate = new Date("2024-01-01T10:00:00.000Z");
			const newerDate = new Date("2024-01-01T11:00:00.000Z");
			const cursorAssigneeId = faker.string.uuid();
			const user1Id = faker.string.uuid();
			const user2Id = faker.string.uuid();

			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: newerDate.toISOString(),
					assigneeId: cursorAssigneeId,
				}),
			).toString("base64url");

			const mockAssignments = [
				{
					createdAt: olderDate,
					assigneeId: user1Id,
					assignee: {
						id: user1Id,
						name: "User One",
						emailAddress: "user1@example.com",
					},
				},
				{
					createdAt: newerDate,
					assigneeId: user2Id,
					assignee: {
						id: user2Id,
						name: "User Two",
						emailAddress: "user2@example.com",
					},
				},
			];

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
			};
			mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				mockAssignments,
			);

			const result = (await resolveAssignees(
				mockTag,
				{ last: 5, before: mockCursor },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<User>;

			expect(result.edges).toHaveLength(2);
			expect(result.edges[0]?.node.id).toBe(user2Id);
			expect(result.edges[1]?.node.id).toBe(user1Id);
		});
	});

	describe("Validation and Error handling", () => {
		it("should throw TalawaGraphQLError when after cursor is not valid base64url or malformed JSON", async () => {
			const invalidCursor = "not-a-valid-cursor-string!!!";

			await expect(
				resolveAssignees(
					mockTag,
					{ first: 5, after: invalidCursor },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw TalawaGraphQLError when before cursor is not valid base64url or malformed JSON", async () => {
			const invalidCursor = "not-a-valid-cursor-string!!!";

			await expect(
				resolveAssignees(
					mockTag,
					{ last: 5, before: invalidCursor },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw TalawaGraphQLError when cursor schema fails validation (missing assigneeId or invalid date)", async () => {
			const invalidCursor = Buffer.from(
				JSON.stringify({
					createdAt: "invalid-date",
					assigneeId: "not-a-uuid",
				}),
			).toString("base64url");

			await expect(
				resolveAssignees(
					mockTag,
					{ first: 5, after: invalidCursor },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw TalawaGraphQLError when both first and last arguments are provided", async () => {
			await expect(
				resolveAssignees(
					mockTag,
					{ first: 5, last: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw TalawaGraphQLError when after cursor is provided but no matching resources are found", async () => {
			const mockDate = new Date();
			const validUuid = faker.string.uuid();
			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					assigneeId: validUuid,
				}),
			).toString("base64url");

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveAssignees(
					mockTag,
					{ first: 5, after: mockCursor },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw TalawaGraphQLError when before cursor is provided but no matching resources are found (inversed)", async () => {
			const mockDate = new Date();
			const validUuid = faker.string.uuid();
			const mockCursor = Buffer.from(
				JSON.stringify({
					createdAt: mockDate.toISOString(),
					assigneeId: validUuid,
				}),
			).toString("base64url");

			mocks.drizzleClient.query.tagAssignmentsTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveAssignees(
					mockTag,
					{ last: 5, before: mockCursor },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrow(TalawaGraphQLError);
		});
	});
});
