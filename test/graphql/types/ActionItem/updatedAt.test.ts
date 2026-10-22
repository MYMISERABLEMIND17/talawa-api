import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { ActionItem as ActionItemType } from "~/src/graphql/types/ActionItem/ActionItem";
import { actionItemUpdatedAtResolver } from "~/src/graphql/types/ActionItem/updatedAt";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import "~/src/graphql/types/ActionItem/ActionItem";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";

type MockUser = {
	id: string;
	role: string;
	organizationMembershipsWhereMember: Array<{
		role: string;
		organizationId: string;
	}>;
};

describe("ActionItem UpdatedAt Resolver Tests", () => {
	let ctx: GraphQLContext;
	let mockActionItem: ActionItemType;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let testUserId: string;
	let testOrgId: string;

	beforeEach(() => {
		testUserId = faker.string.uuid();
		testOrgId = faker.string.uuid();

		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			testUserId,
		);
		ctx = context;
		mocks = newMocks;

		mockActionItem = {
			id: faker.string.uuid(),
			organizationId: testOrgId,
			categoryId: faker.string.uuid(),
			assignedAt: new Date("2026-01-01T10:00:00Z"),
			isCompleted: false,
			completionAt: null,
			preCompletionNotes: null,
			postCompletionNotes: null,
			creatorId: faker.string.uuid(),
			updaterId: faker.string.uuid(),
			eventId: null,
			isTemplate: false,
			recurringEventInstanceId: null,
			volunteerId: faker.string.uuid(),
			volunteerGroupId: null,
			createdAt: new Date("2026-02-01T10:00:00Z"),
			updatedAt: new Date("2026-02-05T12:00:00Z"),
		} as ActionItemType;
	});

	it("should throw unexpected error if parent.updatedAt is missing", async () => {
		const actionItemWithoutUpdatedAt = {
			...mockActionItem,
			updatedAt: null as unknown as Date,
		};
		await expect(
			actionItemUpdatedAtResolver(actionItemWithoutUpdatedAt, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({
				message: "Missing updatedAt value for the action item",
				extensions: { code: "unexpected" },
			}),
		);
	});

	it("should throw unauthenticated error if user is not logged in", async () => {
		ctx.currentClient.isAuthenticated = false;
		await expect(
			actionItemUpdatedAtResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthenticated" } }),
		);
	});

	it("should throw unauthenticated error if current user does not exist in database", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(undefined);
		await expect(
			actionItemUpdatedAtResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthenticated" } }),
		);
	});

	it("should throw unauthorized_action error if user is not an administrator and has no org membership", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		await expect(
			actionItemUpdatedAtResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthorized_action" } }),
		);
	});

	it("should throw unauthorized_action error if user is a member with non-admin org role", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [
				{
					role: "member",
					organizationId: mockActionItem.organizationId,
				},
			],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		await expect(
			actionItemUpdatedAtResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthorized_action" } }),
		);
	});

	it("should return updatedAt if user is a system administrator", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.updatedAt);
		expect(ctx.log.error).not.toHaveBeenCalled();
	});

	it("should return updatedAt if user is a system administrator even if org membership is regular member", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [
				{
					role: "member",
					organizationId: mockActionItem.organizationId,
				},
			],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.updatedAt);
		expect(ctx.log.error).not.toHaveBeenCalled();
	});

	it("should return updatedAt if user is an organization administrator", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [
				{
					role: "administrator",
					organizationId: mockActionItem.organizationId,
				},
			],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.updatedAt);
	});

	it("should catch unexpected database error, log it, and throw unexpected error", async () => {
		const dbError = new Error("Database query failed");
		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(dbError);

		await expect(
			actionItemUpdatedAtResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({
				message: "Internal server error",
				extensions: { code: "unexpected" },
			}),
		);

		expect(ctx.log.error).toHaveBeenCalledWith(dbError);
	});

	it("should query the database with the correct organizationId filter", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [
				{
					role: "administrator",
					organizationId: mockActionItem.organizationId,
				},
			],
		};

		(
			mocks.drizzleClient.query.usersTable.findFirst as ReturnType<typeof vi.fn>
		).mockImplementation(({ with: withClause }) => {
			expect(withClause).toBeDefined();

			const mockFields = {
				organizationId: "organization-field-id",
			};
			const mockOperators = { eq: vi.fn((a, b) => ({ [a]: b })) };

			const innerWhereResult =
				withClause.organizationMembershipsWhereMember.where(
					mockFields,
					mockOperators,
				);
			expect(innerWhereResult).toEqual(
				expect.objectContaining({
					[mockFields.organizationId]: mockActionItem.organizationId,
				}),
			);
			return Promise.resolve(mockUserData);
		});

		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toEqual(mockActionItem.updatedAt);
	});

	it("should query the database with the correct user ID filter", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};

		(
			mocks.drizzleClient.query.usersTable.findFirst as ReturnType<typeof vi.fn>
		).mockImplementation(({ where: whereClause }) => {
			expect(whereClause).toBeDefined();

			const mockFields = {
				id: "user-field-id",
			};
			const mockOperators = { eq: vi.fn((a, b) => ({ [a]: b })) };

			const whereResult = whereClause(mockFields, mockOperators);
			expect(whereResult).toEqual(
				expect.objectContaining({
					[mockFields.id]: ctx.currentClient.user?.id,
				}),
			);
			return Promise.resolve(mockUserData);
		});

		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toEqual(mockActionItem.updatedAt);
	});

	it("should handle multiple organization memberships and evaluate the matching one", async () => {
		const otherOrgId = faker.string.uuid();
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [
				{
					role: "administrator",
					organizationId: mockActionItem.organizationId,
				},
				{
					role: "member",
					organizationId: otherOrgId,
				},
			],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		const result = await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.updatedAt);
	});

	it("should return the exact updatedAt date object from parent", async () => {
		const specificDate = new Date("2026-11-20T18:45:00.000Z");
		const actionItemWithSpecificDate = {
			...mockActionItem,
			updatedAt: specificDate,
		};

		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		const result = await actionItemUpdatedAtResolver(
			actionItemWithSpecificDate,
			{},
			ctx,
		);
		expect(result).toBe(specificDate);
		expect(result.getTime()).toBe(specificDate.getTime());
	});

	it("should handle empty args object correctly", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		const result = await actionItemUpdatedAtResolver(
			mockActionItem,
			{} as Record<string, never>,
			ctx,
		);
		expect(result).toBe(mockActionItem.updatedAt);
	});

	it("should verify database query columns and structure", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		await actionItemUpdatedAtResolver(mockActionItem, {}, ctx);

		expect(mocks.drizzleClient.query.usersTable.findFirst).toHaveBeenCalledWith(
			{
				columns: {
					role: true,
				},
				with: {
					organizationMembershipsWhereMember: {
						columns: {
							role: true,
						},
						where: expect.any(Function),
					},
				},
				where: expect.any(Function),
			},
		);
	});
});
