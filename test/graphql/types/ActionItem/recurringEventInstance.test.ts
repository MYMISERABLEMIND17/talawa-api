import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { ActionItem as ActionItemType } from "~/src/graphql/types/ActionItem/ActionItem";
import { actionItemRecurringEventInstanceResolver } from "~/src/graphql/types/ActionItem/recurringEventInstance";
import "~/src/graphql/types/ActionItem/ActionItem";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";

type MockInstance = {
	id: string;
	baseRecurringEventId: string;
	recurrenceRule: string;
	instanceDate: Date;
	[key: string]: unknown;
};

type MockBaseEvent = {
	id: string;
	title: string;
	organizationId: string;
	description: string;
	[key: string]: unknown;
};

describe("ActionItem RecurringEventInstance Resolver Tests", () => {
	let ctx: GraphQLContext;
	let mockActionItem: ActionItemType;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let testInstanceId: string;
	let testBaseEventId: string;
	let testOrgId: string;

	beforeEach(() => {
		testInstanceId = faker.string.uuid();
		testBaseEventId = faker.string.uuid();
		testOrgId = faker.string.uuid();

		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
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
			recurringEventInstanceId: testInstanceId,
			volunteerId: faker.string.uuid(),
			volunteerGroupId: null,
			createdAt: new Date("2026-02-01T10:00:00Z"),
			updatedAt: new Date("2026-02-05T12:00:00Z"),
		} as ActionItemType;
	});

	it("should return null if parent.recurringEventInstanceId is null", async () => {
		const actionItemWithoutInstance = {
			...mockActionItem,
			recurringEventInstanceId: null,
		};

		const result = await actionItemRecurringEventInstanceResolver(
			actionItemWithoutInstance,
			{},
			ctx,
		);
		expect(result).toBeNull();
		expect(
			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
		).not.toHaveBeenCalled();
	});

	it("should return null if parent.recurringEventInstanceId is undefined", async () => {
		const actionItemWithoutInstance = {
			...mockActionItem,
			recurringEventInstanceId: undefined as unknown as null,
		};

		const result = await actionItemRecurringEventInstanceResolver(
			actionItemWithoutInstance,
			{},
			ctx,
		);
		expect(result).toBeNull();
		expect(
			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
		).not.toHaveBeenCalled();
	});

	it("should return null if recurring event instance is not found in database", async () => {
		mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
			undefined,
		);

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{},
			ctx,
		);
		expect(result).toBeNull();
		expect(
			mocks.drizzleClient.query.eventsTable.findFirst,
		).not.toHaveBeenCalled();
	});

	it("should return null if instance exists but base recurring event is not found", async () => {
		const mockInstance: MockInstance = {
			id: testInstanceId,
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=WEEKLY",
			instanceDate: new Date("2026-03-01T10:00:00Z"),
		};

		mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
			mockInstance,
		);
		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			undefined,
		);

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{},
			ctx,
		);
		expect(result).toBeNull();
	});

	it("should return merged event and instance with attachments empty array on success", async () => {
		const mockInstance: MockInstance = {
			id: testInstanceId,
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=WEEKLY",
			instanceDate: new Date("2026-03-01T10:00:00Z"),
			instanceNote: "Custom note for this instance",
		};

		const mockBaseEvent: MockBaseEvent = {
			id: testBaseEventId,
			title: "Weekly All-Hands",
			organizationId: testOrgId,
			description: "General sync meeting",
		};

		mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
			mockInstance,
		);
		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockBaseEvent,
		);

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{},
			ctx,
		);

		expect(result).toBeDefined();
		expect(result).toMatchObject({
			id: testInstanceId,
			title: "Weekly All-Hands",
			organizationId: testOrgId,
			description: "General sync meeting",
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=WEEKLY",
			instanceNote: "Custom note for this instance",
			attachments: [],
		});
	});

	it("should query recurringEventInstancesTable with correct where filter", async () => {
		const mockInstance: MockInstance = {
			id: testInstanceId,
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=DAILY",
			instanceDate: new Date(),
		};

		const mockBaseEvent: MockBaseEvent = {
			id: testBaseEventId,
			title: "Daily Standup",
			organizationId: testOrgId,
			description: "Standup sync",
		};

		(
			mocks.drizzleClient.query.recurringEventInstancesTable
				.findFirst as ReturnType<typeof vi.fn>
		).mockImplementation(({ where: whereClause }) => {
			expect(whereClause).toBeDefined();

			const mockFields = { id: "instance-id-field" };
			const mockOperators = { eq: vi.fn((a, b) => ({ [a]: b })) };

			const whereResult = whereClause(mockFields, mockOperators);
			expect(whereResult).toEqual(
				expect.objectContaining({
					[mockFields.id]: testInstanceId,
				}),
			);
			return Promise.resolve(mockInstance);
		});

		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockBaseEvent,
		);

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{},
			ctx,
		);
		expect(result).toBeDefined();
		expect(result).toHaveProperty("id", testInstanceId);
	});

	it("should query eventsTable with correct where filter for base recurring event ID", async () => {
		const mockInstance: MockInstance = {
			id: testInstanceId,
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=MONTHLY",
			instanceDate: new Date(),
		};

		const mockBaseEvent: MockBaseEvent = {
			id: testBaseEventId,
			title: "Monthly Planning",
			organizationId: testOrgId,
			description: "Planning meeting",
		};

		mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
			mockInstance,
		);

		(
			mocks.drizzleClient.query.eventsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockImplementation(({ where: whereClause }) => {
			expect(whereClause).toBeDefined();

			const mockFields = { id: "event-id-field" };
			const mockOperators = { eq: vi.fn((a, b) => ({ [a]: b })) };

			const whereResult = whereClause(mockFields, mockOperators);
			expect(whereResult).toEqual(
				expect.objectContaining({
					[mockFields.id]: testBaseEventId,
				}),
			);
			return Promise.resolve(mockBaseEvent);
		});

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{},
			ctx,
		);
		expect(result).toBeDefined();
		expect(result).toHaveProperty("title", "Monthly Planning");
	});

	it("should handle empty args object without issue", async () => {
		const mockInstance: MockInstance = {
			id: testInstanceId,
			baseRecurringEventId: testBaseEventId,
			recurrenceRule: "FREQ=YEARLY",
			instanceDate: new Date(),
		};

		const mockBaseEvent: MockBaseEvent = {
			id: testBaseEventId,
			title: "Annual Gala",
			organizationId: testOrgId,
			description: "Annual event",
		};

		mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
			mockInstance,
		);
		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockBaseEvent,
		);

		const result = await actionItemRecurringEventInstanceResolver(
			mockActionItem,
			{} as Record<string, never>,
			ctx,
		);
		expect(result).toBeDefined();
		expect(result).toHaveProperty("title", "Annual Gala");
	});
});
