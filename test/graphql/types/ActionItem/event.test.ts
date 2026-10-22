import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { ActionItem as ActionItemType } from "~/src/graphql/types/ActionItem/ActionItem";
import { actionItemEventResolver } from "~/src/graphql/types/ActionItem/event";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import "~/src/graphql/types/ActionItem/ActionItem";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";

type MockEvent = {
	id: string;
	title: string;
	organizationId: string;
	attachmentsWhereEvent: Array<{ id: string; url: string }>;
	[key: string]: unknown;
};

describe("ActionItem Event Resolver Tests", () => {
	let ctx: GraphQLContext;
	let mockActionItem: ActionItemType;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let testEventId: string;
	let testOrgId: string;

	beforeEach(() => {
		testEventId = faker.string.uuid();
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
			eventId: testEventId,
			isTemplate: false,
			recurringEventInstanceId: null,
			volunteerId: faker.string.uuid(),
			volunteerGroupId: null,
			createdAt: new Date("2026-02-01T10:00:00Z"),
			updatedAt: new Date("2026-02-05T12:00:00Z"),
		} as ActionItemType;
	});

	it("should return null if parent.eventId is null", async () => {
		const actionItemWithoutEvent = {
			...mockActionItem,
			eventId: null,
		};

		const result = await actionItemEventResolver(
			actionItemWithoutEvent,
			{},
			ctx,
		);
		expect(result).toBeNull();
		expect(
			mocks.drizzleClient.query.eventsTable.findFirst,
		).not.toHaveBeenCalled();
	});

	it("should return null if parent.eventId is empty string or undefined", async () => {
		const actionItemWithoutEvent = {
			...mockActionItem,
			eventId: undefined as unknown as null,
		};

		const result = await actionItemEventResolver(
			actionItemWithoutEvent,
			{},
			ctx,
		);
		expect(result).toBeNull();
		expect(
			mocks.drizzleClient.query.eventsTable.findFirst,
		).not.toHaveBeenCalled();
	});

	it("should throw unexpected error and log if event is not found in database", async () => {
		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			undefined,
		);

		await expect(
			actionItemEventResolver(mockActionItem, {}, ctx),
		).rejects.toThrow(
			new TalawaGraphQLError({
				extensions: {
					code: "unexpected",
				},
			}),
		);

		expect(ctx.log.error).toHaveBeenCalledWith(
			"Postgres select operation returned no row for action item's eventId that isn't null.",
		);
	});

	it("should return event with mapped attachments on successful lookup", async () => {
		const mockAttachments = [
			{ id: faker.string.uuid(), url: "https://example.com/file1.pdf" },
			{ id: faker.string.uuid(), url: "https://example.com/file2.png" },
		];

		const mockEventData: MockEvent = {
			id: testEventId,
			title: "Annual Planning Meeting",
			organizationId: testOrgId,
			attachmentsWhereEvent: mockAttachments,
		};

		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockEventData,
		);

		const result = await actionItemEventResolver(mockActionItem, {}, ctx);

		expect(result).toBeDefined();
		expect(result).toHaveProperty("id", testEventId);
		expect(result).toHaveProperty("title", "Annual Planning Meeting");
		expect(result).toHaveProperty("attachments", mockAttachments);
		expect(ctx.log.error).not.toHaveBeenCalled();
	});

	it("should return event with empty attachments array when event has no attachments", async () => {
		const mockEventData: MockEvent = {
			id: testEventId,
			title: "Event Without Attachments",
			organizationId: testOrgId,
			attachmentsWhereEvent: [],
		};

		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockEventData,
		);

		const result = await actionItemEventResolver(mockActionItem, {}, ctx);

		expect(result).toBeDefined();
		expect(result).toHaveProperty("attachments", []);
		expect(ctx.log.error).not.toHaveBeenCalled();
	});

	it("should query eventsTable with correct where clause and with options", async () => {
		const mockEventData: MockEvent = {
			id: testEventId,
			title: "Query Structure Verification Event",
			organizationId: testOrgId,
			attachmentsWhereEvent: [],
		};

		(
			mocks.drizzleClient.query.eventsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockImplementation(({ where: whereClause, with: withClause }) => {
			expect(withClause).toEqual({ attachmentsWhereEvent: true });
			expect(whereClause).toBeDefined();

			const mockFields = { id: "event-field-id" };
			const mockOperators = { eq: vi.fn((a, b) => ({ [a]: b })) };

			const whereResult = whereClause(mockFields, mockOperators);
			expect(whereResult).toEqual(
				expect.objectContaining({
					[mockFields.id]: testEventId,
				}),
			);
			return Promise.resolve(mockEventData);
		});

		const result = await actionItemEventResolver(mockActionItem, {}, ctx);
		expect(result).toBeDefined();
		expect(result).toHaveProperty("id", testEventId);
	});

	it("should handle empty args object without issue", async () => {
		const mockEventData: MockEvent = {
			id: testEventId,
			title: "Test Event",
			organizationId: testOrgId,
			attachmentsWhereEvent: [],
		};

		mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
			mockEventData,
		);

		const result = await actionItemEventResolver(
			mockActionItem,
			{} as Record<string, never>,
			ctx,
		);
		expect(result).toBeDefined();
		expect(result).toHaveProperty("id", testEventId);
	});
});
