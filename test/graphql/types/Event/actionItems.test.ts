import { Buffer } from "node:buffer";
import { faker } from "@faker-js/faker";
import type { GraphQLObjectType } from "graphql";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "~/src/graphql/schema";
import {
	actionItemsComplexity,
	resolveActionItemsPaginated,
} from "~/src/graphql/types/Event/actionItems";
import type { Event as EventType } from "~/src/graphql/types/Event/Event";
import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

type UsersTableFindFirstOptions = {
	where?: (
		fields: Record<string, unknown>,
		operators: { eq: (a: unknown, b: unknown) => unknown },
	) => unknown;
	with?: {
		organizationMembershipsWhereMember?: {
			where?: (
				fields: Record<string, unknown>,
				operators: { eq: (a: unknown, b: unknown) => unknown },
			) => unknown;
		};
	};
};

type ActionItemWithException = {
	id: string;
	organizationId: string;
	eventId: string | null;
	isCompleted: boolean;
	postCompletionNotes: string | null;
	preCompletionNotes: string | null;
	volunteerId: string | null;
	volunteerGroupId: string | null;
	categoryId: string | null;
	assignedAt: Date;
	createdAt: Date;
	updatedAt: Date | null;
	creatorId: string | null;
	updaterId: string | null;
	recurringEventInstanceId: string | null;
	isInstanceException?: boolean;
};

describe("Event/actionItems", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const createMockEvent = (
		overrides?: Partial<EventType & { baseRecurringEventId?: string }>,
	): EventType & { baseRecurringEventId?: string } => ({
		id: faker.string.uuid(),
		name: "Test Community Event",
		organizationId: faker.string.uuid(),
		creatorId: faker.string.uuid(),
		createdAt: new Date(),
		updatedAt: new Date(),
		startAt: new Date(),
		endAt: new Date(),
		description: "Event description",
		location: "Test Venue",
		allDay: false,
		isPublic: true,
		isRegisterable: true,
		isInviteOnly: false,
		updaterId: null,
		isRecurringEventTemplate: false,
		startDate: null,
		endDate: null,
		attachments: [],
		...overrides,
	});

	const createValidCursor = (id: string, assignedAt: Date) =>
		Buffer.from(
			JSON.stringify({
				id,
				assignedAt: assignedAt.toISOString(),
			}),
		).toString("base64url");

	describe("actionItemsComplexity", () => {
		it("calculates complexity based on first limit", () => {
			const result = actionItemsComplexity({ first: 10 });
			expect(result).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 10,
			});
		});

		it("calculates complexity based on last limit", () => {
			const result = actionItemsComplexity({ last: 5 });
			expect(result).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 5,
			});
		});

		it("defaults multiplier to 1 when neither first nor last is specified", () => {
			const result = actionItemsComplexity({});
			expect(result).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Authentication", () => {
		it("throws unauthenticated error when client is not authenticated", async () => {
			const { context } = createMockGraphQLContext(false);
			const mockEvent = createMockEvent();

			await expect(
				resolveActionItemsPaginated(mockEvent, {}, context),
			).rejects.toThrow(TalawaGraphQLError);

			await expect(
				resolveActionItemsPaginated(mockEvent, {}, context),
			).rejects.toMatchObject({
				extensions: { code: "unauthenticated" },
			});
		});

		it("throws unauthenticated error when user is not found in database", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockImplementation(
				async (options?: UsersTableFindFirstOptions) => {
					if (options?.where) {
						options.where({ id: "id" }, { eq: vi.fn((a, b) => [a, b]) });
					}
					if (options?.with?.organizationMembershipsWhereMember?.where) {
						options.with.organizationMembershipsWhereMember.where(
							{ organizationId: "org-id" },
							{ eq: vi.fn((a, b) => [a, b]) },
						);
					}
					return undefined;
				},
			);

			await expect(
				resolveActionItemsPaginated(mockEvent, { first: 10 }, context),
			).rejects.toMatchObject({
				extensions: { code: "unauthenticated" },
			});
		});
	});

	describe("Argument Validation", () => {
		it("throws invalid_arguments error when after cursor is malformed base64url / JSON", async () => {
			const { context } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			await expect(
				resolveActionItemsPaginated(
					mockEvent,
					{ after: "invalid-not-base64url-json!", first: 10 },
					context,
				),
			).rejects.toMatchObject({
				extensions: {
					code: "invalid_arguments",
					issues: [
						{
							argumentPath: ["after"],
							message: "Not a valid cursor.",
						},
					],
				},
			});
		});

		it("throws invalid_arguments error when before cursor is malformed base64url / JSON", async () => {
			const { context } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			await expect(
				resolveActionItemsPaginated(
					mockEvent,
					{ before: "invalid-not-base64url-json!", last: 10 },
					context,
				),
			).rejects.toMatchObject({
				extensions: {
					code: "invalid_arguments",
					issues: [
						{
							argumentPath: ["before"],
							message: "Not a valid cursor.",
						},
					],
				},
			});
		});

		it("throws invalid_arguments error when arguments violate schema (e.g. negative limit)", async () => {
			const { context } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			await expect(
				resolveActionItemsPaginated(mockEvent, { first: -5 }, context),
			).rejects.toMatchObject({
				extensions: {
					code: "invalid_arguments",
				},
			});
		});
	});

	describe("Authorization", () => {
		it("authorizes a global administrator without organization membership", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockImplementation(
				async (options?: UsersTableFindFirstOptions) => {
					if (options?.where) {
						options.where({ id: "id" }, { eq: vi.fn((a, b) => [a, b]) });
					}
					if (options?.with?.organizationMembershipsWhereMember?.where) {
						options.with.organizationMembershipsWhereMember.where(
							{ organizationId: "org-id" },
							{ eq: vi.fn((a, b) => [a, b]) },
						);
					}
					return {
						id: context.currentClient.user?.id ?? faker.string.uuid(),
						role: "administrator",
						organizationMembershipsWhereMember: [],
					};
				},
			);

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);
			expect(result.edges).toEqual([]);
		});

		it("authorizes a regular user who is an organization administrator", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "regular",
				organizationMembershipsWhereMember: [
					{
						role: "administrator",
					},
				],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);
			expect(result.edges).toEqual([]);
		});

		it("authorizes a regular user who is a regular organization member", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "regular",
				organizationMembershipsWhereMember: [
					{
						role: "regular",
					},
				],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);
			expect(result.edges).toEqual([]);
		});

		it("throws unauthorized_action when regular user has no organization membership", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "regular",
				organizationMembershipsWhereMember: [],
			});

			await expect(
				resolveActionItemsPaginated(mockEvent, { first: 10 }, context),
			).rejects.toMatchObject({
				extensions: { code: "unauthorized_action" },
			});
		});

		it("throws unauthorized_action when regular user has non-admin and non-regular role", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "regular",
				organizationMembershipsWhereMember: [
					{
						role: "guest",
					},
				],
			});

			await expect(
				resolveActionItemsPaginated(mockEvent, { first: 10 }, context),
			).rejects.toMatchObject({
				extensions: { code: "unauthorized_action" },
			});
		});
	});

	describe("Event ID Resolution & Database Queries", () => {
		it("uses baseRecurringEventId when present on parent event", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const baseRecurringEventId = faker.string.uuid();
			const mockEvent = createMockEvent({
				baseRecurringEventId,
			});

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);
			expect(result.edges).toEqual([]);
			expect(
				mocks.drizzleClient.query.actionItemsTable.findMany,
			).toHaveBeenCalledTimes(1);
		});

		it("uses parent.id when baseRecurringEventId is not present on parent", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();
			delete mockEvent.baseRecurringEventId;

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);
			expect(result.edges).toEqual([]);
			expect(
				mocks.drizzleClient.query.actionItemsTable.findMany,
			).toHaveBeenCalledTimes(1);
		});
	});

	describe("Exceptions and Overrides", () => {
		it("filters out deleted exceptions and applies exception field overrides", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			const actionItem1 = {
				id: faker.string.uuid(),
				organizationId: mockEvent.organizationId,
				eventId: mockEvent.id,
				isCompleted: false,
				postCompletionNotes: "Initial post",
				preCompletionNotes: "Initial pre",
				volunteerId: faker.string.uuid(),
				volunteerGroupId: faker.string.uuid(),
				categoryId: faker.string.uuid(),
				assignedAt: new Date("2025-01-01T10:00:00Z"),
				createdAt: new Date(),
				updatedAt: new Date(),
				creatorId: faker.string.uuid(),
				updaterId: null,
				recurringEventInstanceId: null,
			};

			const actionItem2Deleted = {
				id: faker.string.uuid(),
				organizationId: mockEvent.organizationId,
				eventId: mockEvent.id,
				isCompleted: false,
				postCompletionNotes: null,
				preCompletionNotes: null,
				volunteerId: null,
				volunteerGroupId: null,
				categoryId: null,
				assignedAt: new Date("2025-01-02T10:00:00Z"),
				createdAt: new Date(),
				updatedAt: new Date(),
				creatorId: faker.string.uuid(),
				updaterId: null,
				recurringEventInstanceId: null,
			};

			const actionItem3NoException = {
				id: faker.string.uuid(),
				organizationId: mockEvent.organizationId,
				eventId: mockEvent.id,
				isCompleted: false,
				postCompletionNotes: "Unchanged post",
				preCompletionNotes: "Unchanged pre",
				volunteerId: null,
				volunteerGroupId: null,
				categoryId: null,
				assignedAt: new Date("2025-01-03T10:00:00Z"),
				createdAt: new Date(),
				updatedAt: new Date(),
				creatorId: faker.string.uuid(),
				updaterId: null,
				recurringEventInstanceId: null,
			};

			const actionItem4NullOverrides = {
				id: faker.string.uuid(),
				organizationId: mockEvent.organizationId,
				eventId: mockEvent.id,
				isCompleted: false,
				postCompletionNotes: "Original post",
				preCompletionNotes: "Original pre",
				volunteerId: faker.string.uuid(),
				volunteerGroupId: faker.string.uuid(),
				categoryId: faker.string.uuid(),
				assignedAt: new Date("2025-01-04T10:00:00Z"),
				createdAt: new Date(),
				updatedAt: new Date(),
				creatorId: faker.string.uuid(),
				updaterId: null,
				recurringEventInstanceId: null,
			};

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([
				actionItem1,
				actionItem2Deleted,
				actionItem3NoException,
				actionItem4NullOverrides,
			]);

			const newVolunteerId = faker.string.uuid();
			const newVolunteerGroupId = faker.string.uuid();
			const newCategoryId = faker.string.uuid();
			const newAssignedAt = new Date("2025-01-10T12:00:00Z");

			mocks.drizzleClient.query.actionItemExceptionsTable.findMany.mockResolvedValue(
				[
					{
						id: faker.string.uuid(),
						actionId: actionItem1.id,
						eventId: mockEvent.id,
						deleted: false,
						completed: true,
						postCompletionNotes: "Updated post",
						preCompletionNotes: "Updated pre",
						volunteerId: newVolunteerId,
						volunteerGroupId: newVolunteerGroupId,
						categoryId: newCategoryId,
						assignedAt: newAssignedAt,
					},
					{
						id: faker.string.uuid(),
						actionId: actionItem2Deleted.id,
						eventId: mockEvent.id,
						deleted: true,
						completed: null,
						postCompletionNotes: null,
						preCompletionNotes: null,
						volunteerId: null,
						volunteerGroupId: null,
						categoryId: null,
						assignedAt: null,
					},
					{
						id: faker.string.uuid(),
						actionId: actionItem4NullOverrides.id,
						eventId: mockEvent.id,
						deleted: false,
						completed: null,
						postCompletionNotes: null,
						preCompletionNotes: null,
						volunteerId: null,
						volunteerGroupId: null,
						categoryId: null,
						assignedAt: null,
					},
				],
			);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ first: 10 },
				context,
			);

			// actionItem2Deleted should be excluded; 3 items should remain
			expect(result.edges).toHaveLength(3);

			const node1 = result.edges.find((e) => e.node.id === actionItem1.id)
				?.node as ActionItemWithException;
			expect(node1).toBeDefined();
			expect(node1.isCompleted).toBe(true);
			expect(node1.postCompletionNotes).toBe("Updated post");
			expect(node1.preCompletionNotes).toBe("Updated pre");
			expect(node1.volunteerId).toBe(newVolunteerId);
			expect(node1.volunteerGroupId).toBe(newVolunteerGroupId);
			expect(node1.categoryId).toBe(newCategoryId);
			expect(node1.assignedAt).toBe(newAssignedAt);
			expect(node1.isInstanceException).toBe(true);

			const node3 = result.edges.find(
				(e) => e.node.id === actionItem3NoException.id,
			)?.node as ActionItemWithException;
			expect(node3).toBeDefined();
			expect(node3.isInstanceException).toBe(false);

			const node4 = result.edges.find(
				(e) => e.node.id === actionItem4NullOverrides.id,
			)?.node as ActionItemWithException;
			expect(node4).toBeDefined();
			expect(node4.isCompleted).toBe(false);
			expect(node4.postCompletionNotes).toBe("Original post");
			expect(node4.preCompletionNotes).toBe("Original pre");
			expect(node4.volunteerId).toBe(actionItem4NullOverrides.volunteerId);
			expect(node4.isInstanceException).toBe(true);
		});
	});

	describe("Pagination and Cursors", () => {
		it("throws arguments_associated_resources_not_found when after cursor is specified but results are empty", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const validAfterCursor = createValidCursor(
				faker.string.uuid(),
				new Date(),
			);

			await expect(
				resolveActionItemsPaginated(
					mockEvent,
					{ after: validAfterCursor, first: 10 },
					context,
				),
			).rejects.toMatchObject({
				extensions: {
					code: "arguments_associated_resources_not_found",
					issues: [{ argumentPath: ["after"] }],
				},
			});
		});

		it("throws arguments_associated_resources_not_found when before cursor is specified but results are empty", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([]);

			const validBeforeCursor = createValidCursor(
				faker.string.uuid(),
				new Date(),
			);

			await expect(
				resolveActionItemsPaginated(
					mockEvent,
					{ before: validBeforeCursor, last: 10 },
					context,
				),
			).rejects.toMatchObject({
				extensions: {
					code: "arguments_associated_resources_not_found",
					issues: [{ argumentPath: ["before"] }],
				},
			});
		});

		it("successfully paginates with valid cursor and limit", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const mockEvent = createMockEvent();

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				id: context.currentClient.user?.id ?? faker.string.uuid(),
				role: "administrator",
				organizationMembershipsWhereMember: [],
			});

			const actionItem = {
				id: faker.string.uuid(),
				organizationId: mockEvent.organizationId,
				eventId: mockEvent.id,
				isCompleted: false,
				postCompletionNotes: null,
				preCompletionNotes: null,
				volunteerId: null,
				volunteerGroupId: null,
				categoryId: null,
				assignedAt: new Date("2025-01-01T10:00:00Z"),
				createdAt: new Date(),
				updatedAt: new Date(),
				creatorId: faker.string.uuid(),
				updaterId: null,
				recurringEventInstanceId: null,
			};

			mocks.drizzleClient.query.actionItemsTable.findMany.mockResolvedValue([
				actionItem,
			]);

			mocks.drizzleClient.query.actionItemExceptionsTable.findMany.mockResolvedValue(
				[],
			);

			const cursor = createValidCursor(actionItem.id, actionItem.assignedAt);

			const result = await resolveActionItemsPaginated(
				mockEvent,
				{ after: cursor, first: 1 },
				context,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(actionItem.id);
			expect(result.edges[0]?.cursor).toBeDefined();
			expect(result.pageInfo).toBeDefined();
		});
	});

	describe("Schema Registration", () => {
		it("registers actionItems field on Event type with valid connection resolver", () => {
			const eventType = schema.getType("Event") as GraphQLObjectType;
			expect(eventType).toBeDefined();
			const field = eventType.getFields().actionItems;
			expect(field).toBeDefined();
			expect(field?.description).toBe(
				"GraphQL connection to traverse through the action items associated with this event.",
			);
			expect(field?.resolve).toBeDefined();
		});
	});
});
