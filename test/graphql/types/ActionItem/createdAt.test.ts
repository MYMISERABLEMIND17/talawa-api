import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { ActionItem as ActionItemType } from "~/src/graphql/types/ActionItem/ActionItem";
import { resolveCreatedAt } from "~/src/graphql/types/ActionItem/createdAt";
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

describe("ActionItem CreatedAt Resolver Tests", () => {
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

	it("should throw unauthenticated error if user is not logged in", async () => {
		ctx.currentClient.isAuthenticated = false;
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthenticated" } }),
		);
	});

	it("should throw unauthenticated error if current user does not exist", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(undefined);
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthenticated" } }),
		);
	});

	it("should throw unauthorized_action error if user is not an administrator", async () => {
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
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthorized_action" } }),
		);
	});

	it("should throw unauthorized_action error if user has no organization membership", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthorized_action" } }),
		);
	});

	it("should throw unauthorized_action error if user is regular member", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "member",
			organizationMembershipsWhereMember: [
				{
					role: "regular",
					organizationId: mockActionItem.organizationId,
				},
			],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new TalawaGraphQLError({ extensions: { code: "unauthorized_action" } }),
		);
	});

	it("should return createdAt if user is system administrator", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.createdAt);
	});

	it("should return createdAt if user is organization administrator", async () => {
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
		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.createdAt);
	});

	it("should return createdAt if global admin with no organization membership", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);
		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.createdAt);
	});

	it("should handle database query failures", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			new Error("Database error"),
		);
		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			new Error("Database error"),
		);
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

		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toEqual(mockActionItem.createdAt);
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

		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toEqual(mockActionItem.createdAt);
	});

	it("should handle organization membership check correctly", async () => {
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

		const result = await resolveCreatedAt(mockActionItem, {}, ctx);
		expect(result).toBe(mockActionItem.createdAt);
	});

	it("should return the exact createdAt date from parent", async () => {
		const specificDate = new Date("2026-12-25T15:30:45.123Z");
		const actionItemWithSpecificDate = {
			...mockActionItem,
			createdAt: specificDate,
		};

		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		const result = await resolveCreatedAt(actionItemWithSpecificDate, {}, ctx);
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

		const result = await resolveCreatedAt(
			mockActionItem,
			{} as Record<string, never>,
			ctx,
		);
		expect(result).toBe(mockActionItem.createdAt);
	});

	it("should handle network timeout during database query", async () => {
		const timeoutError = new Error("Connection timeout");
		timeoutError.name = "TimeoutError";

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			timeoutError,
		);

		await expect(resolveCreatedAt(mockActionItem, {}, ctx)).rejects.toThrow(
			timeoutError,
		);
	});

	it("should verify database query structure", async () => {
		const mockUserData: MockUser = {
			id: testUserId,
			role: "administrator",
			organizationMembershipsWhereMember: [],
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
			mockUserData,
		);

		await resolveCreatedAt(mockActionItem, {}, ctx);

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
