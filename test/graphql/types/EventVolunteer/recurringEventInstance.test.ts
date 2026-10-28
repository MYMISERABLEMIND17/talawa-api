import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import { Event } from "~/src/graphql/types/Event/Event";
import type { EventVolunteer as EventVolunteerType } from "~/src/graphql/types/EventVolunteer/EventVolunteer";
import { RecurringEventInstanceResolver } from "~/src/graphql/types/EventVolunteer/recurringEventInstance";

const { implementSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	return { implementSpy: implement };
});

vi.mock("~/src/graphql/types/EventVolunteer/EventVolunteer", () => ({
	EventVolunteer: {
		implement: implementSpy,
	},
}));

type MockInstance = {
	id: string;
	baseRecurringEventId: string;
	organizationId: string;
	creatorId: string;
	createdAt: Date;
	startAt: Date;
	endAt: Date;
	isRecurringEventTemplate: boolean;
	recurrenceRule?: string;
};

type MockBaseEvent = {
	id: string;
	name: string;
	organizationId: string;
	creatorId: string;
	createdAt: Date;
	updatedAt: Date;
	startAt: Date;
	endAt: Date;
	description: string;
	location: string;
	allDay: boolean;
	isPublic: boolean;
	isRegisterable: boolean;
	updaterId: string;
	isRecurringEventTemplate: boolean;
};

type FieldOptions = {
	type: unknown;
	description: string;
	nullable: boolean;
	resolve: typeof RecurringEventInstanceResolver;
};

describe("EventVolunteer.recurringEventInstance", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let mockVolunteer: EventVolunteerType;
	let testInstanceId: string;
	let testBaseEventId: string;
	let testOrgId: string;

	let capturedImplementCall:
		| { fields: (t: unknown) => { recurringEventInstance: FieldOptions } }
		| undefined;

	beforeAll(() => {
		capturedImplementCall = implementSpy.mock.calls[0]?.[0];
	});

	beforeEach(() => {
		vi.clearAllMocks();

		testInstanceId = faker.string.uuid();
		testBaseEventId = faker.string.uuid();
		testOrgId = faker.string.uuid();

		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
		);
		ctx = context;
		mocks = newMocks;

		mockVolunteer = {
			id: faker.string.uuid(),
			userId: faker.string.uuid(),
			eventId: faker.string.uuid(),
			creatorId: faker.string.uuid(),
			hasAccepted: true,
			isPublic: true,
			hoursVolunteered: "5.50",
			createdAt: new Date("2026-01-01T10:00:00Z"),
			updatedAt: new Date("2026-01-01T12:00:00Z"),
			updaterId: faker.string.uuid(),
			recurringEventInstanceId: testInstanceId,
			isTemplate: false,
		} as EventVolunteerType;
	});

	describe("Schema Field Registration", () => {
		it("implements EventVolunteer recurringEventInstance field correctly", () => {
			expect(capturedImplementCall).toBeDefined();

			const tStub = {
				field: vi.fn((opts: FieldOptions) => opts),
			};

			const fields = capturedImplementCall?.fields(tStub);
			expect(tStub.field).toHaveBeenCalledWith({
				type: Event,
				description:
					"The recurring event instance associated with this volunteer.",
				nullable: true,
				resolve: RecurringEventInstanceResolver,
			});

			expect(fields).toHaveProperty("recurringEventInstance");
			expect(fields?.recurringEventInstance.description).toBe(
				"The recurring event instance associated with this volunteer.",
			);
			expect(fields?.recurringEventInstance.nullable).toBe(true);
			expect(fields?.recurringEventInstance.resolve).toBe(
				RecurringEventInstanceResolver,
			);
		});
	});

	describe("Authentication & Parent ID Validation", () => {
		it("should return null when parent.recurringEventInstanceId is null", async () => {
			const volunteerWithoutInstance = {
				...mockVolunteer,
				recurringEventInstanceId: null,
			};

			const result = await RecurringEventInstanceResolver(
				volunteerWithoutInstance,
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
			).not.toHaveBeenCalled();
		});

		it("should return null when parent.recurringEventInstanceId is undefined", async () => {
			const volunteerWithoutInstance = {
				...mockVolunteer,
				recurringEventInstanceId: undefined as unknown as null,
			};

			const result = await RecurringEventInstanceResolver(
				volunteerWithoutInstance,
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
			).not.toHaveBeenCalled();
		});

		it("should return null when parent.recurringEventInstanceId is an empty string", async () => {
			const volunteerWithEmptyInstanceId = {
				...mockVolunteer,
				recurringEventInstanceId: "",
			};

			const result = await RecurringEventInstanceResolver(
				volunteerWithEmptyInstanceId,
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
			).not.toHaveBeenCalled();
		});
	});

	describe("Resolution Logic", () => {
		it("should return null when recurring event instance is not found in database", async () => {
			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
				undefined,
			);

			const result = await RecurringEventInstanceResolver(
				mockVolunteer,
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
			).toHaveBeenCalledTimes(1);
			expect(
				mocks.drizzleClient.query.eventsTable.findFirst,
			).not.toHaveBeenCalled();
		});

		it("should return null when instance is found but base recurring event is not found", async () => {
			const mockInstance: MockInstance = {
				id: testInstanceId,
				baseRecurringEventId: testBaseEventId,
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date("2026-01-01T10:00:00Z"),
				startAt: new Date("2026-02-01T14:00:00Z"),
				endAt: new Date("2026-02-01T16:00:00Z"),
				isRecurringEventTemplate: false,
			};

			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
				mockInstance,
			);
			mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
				undefined,
			);

			const result = await RecurringEventInstanceResolver(
				mockVolunteer,
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurringEventInstancesTable.findFirst,
			).toHaveBeenCalledTimes(1);
			expect(
				mocks.drizzleClient.query.eventsTable.findFirst,
			).toHaveBeenCalledTimes(1);
		});

		it("should return merged event and instance with attachments: [] when both exist", async () => {
			const mockInstance: MockInstance = {
				id: testInstanceId,
				baseRecurringEventId: testBaseEventId,
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date("2026-01-01T10:00:00Z"),
				startAt: new Date("2026-02-01T14:00:00Z"),
				endAt: new Date("2026-02-01T16:00:00Z"),
				isRecurringEventTemplate: false,
			};

			const mockBaseEvent: MockBaseEvent = {
				id: testBaseEventId,
				name: "Volunteer Orientation",
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date("2025-12-01T10:00:00Z"),
				updatedAt: new Date("2025-12-15T12:00:00Z"),
				startAt: new Date("2026-01-01T14:00:00Z"),
				endAt: new Date("2026-01-01T16:00:00Z"),
				description: "Orientation for new volunteers",
				location: "Community Hall",
				allDay: false,
				isPublic: true,
				isRegisterable: true,
				updaterId: faker.string.uuid(),
				isRecurringEventTemplate: true,
			};

			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
				mockInstance,
			);
			mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
				mockBaseEvent,
			);

			const result = await RecurringEventInstanceResolver(
				mockVolunteer,
				{},
				ctx,
			);

			expect(result).toEqual({
				...mockBaseEvent,
				...mockInstance,
				attachments: [],
			});
			expect(result).toHaveProperty("id", testInstanceId);
			expect(result).toHaveProperty("name", "Volunteer Orientation");
			expect(result).toHaveProperty("attachments", []);
		});
	});

	describe("Database Query Filters & Callbacks", () => {
		it("should query recurringEventInstancesTable with where callback matching id", async () => {
			const mockInstance: MockInstance = {
				id: testInstanceId,
				baseRecurringEventId: testBaseEventId,
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date(),
				startAt: new Date(),
				endAt: new Date(),
				isRecurringEventTemplate: false,
			};

			const mockBaseEvent: MockBaseEvent = {
				id: testBaseEventId,
				name: "Food Bank Drive",
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date(),
				updatedAt: new Date(),
				startAt: new Date(),
				endAt: new Date(),
				description: "Monthly food distribution",
				location: "Warehouse A",
				allDay: false,
				isPublic: true,
				isRegisterable: true,
				updaterId: faker.string.uuid(),
				isRecurringEventTemplate: true,
			};

			(
				mocks.drizzleClient.query.recurringEventInstancesTable
					.findFirst as ReturnType<typeof vi.fn>
			).mockImplementation(({ where: whereClause }) => {
				expect(whereClause).toBeDefined();

				const mockFields = { id: "mock-id-field" };
				const mockOperators = {
					eq: vi.fn((field, val) => ({ [field]: val })),
				};

				const whereResult = whereClause(mockFields, mockOperators);
				expect(mockOperators.eq).toHaveBeenCalledWith(
					mockFields.id,
					testInstanceId,
				);
				expect(whereResult).toEqual({
					[mockFields.id]: testInstanceId,
				});

				return Promise.resolve(mockInstance);
			});

			mocks.drizzleClient.query.eventsTable.findFirst.mockResolvedValue(
				mockBaseEvent,
			);

			const result = await RecurringEventInstanceResolver(
				mockVolunteer,
				{},
				ctx,
			);

			expect(result).toBeDefined();
			expect(result).toHaveProperty("id", testInstanceId);
		});

		it("should query eventsTable with where callback matching baseRecurringEventId", async () => {
			const mockInstance: MockInstance = {
				id: testInstanceId,
				baseRecurringEventId: testBaseEventId,
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date(),
				startAt: new Date(),
				endAt: new Date(),
				isRecurringEventTemplate: false,
			};

			const mockBaseEvent: MockBaseEvent = {
				id: testBaseEventId,
				name: "Beach Cleanup",
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date(),
				updatedAt: new Date(),
				startAt: new Date(),
				endAt: new Date(),
				description: "Weekly coastal cleanup",
				location: "Coastal Park",
				allDay: false,
				isPublic: true,
				isRegisterable: true,
				updaterId: faker.string.uuid(),
				isRecurringEventTemplate: true,
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

				const mockFields = { id: "mock-base-event-id-field" };
				const mockOperators = {
					eq: vi.fn((field, val) => ({ [field]: val })),
				};

				const whereResult = whereClause(mockFields, mockOperators);
				expect(mockOperators.eq).toHaveBeenCalledWith(
					mockFields.id,
					testBaseEventId,
				);
				expect(whereResult).toEqual({
					[mockFields.id]: testBaseEventId,
				});

				return Promise.resolve(mockBaseEvent);
			});

			const result = await RecurringEventInstanceResolver(
				mockVolunteer,
				{},
				ctx,
			);

			expect(result).toBeDefined();
			expect(result).toHaveProperty("name", "Beach Cleanup");
		});
	});

	describe("Error Handling", () => {
		it("should reject if recurringEventInstancesTable.findFirst throws an error", async () => {
			const dbError = new Error("Connection timed out to database");
			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockRejectedValue(
				dbError,
			);

			await expect(
				RecurringEventInstanceResolver(mockVolunteer, {}, ctx),
			).rejects.toThrow("Connection timed out to database");
		});

		it("should reject if eventsTable.findFirst throws an error", async () => {
			const mockInstance: MockInstance = {
				id: testInstanceId,
				baseRecurringEventId: testBaseEventId,
				organizationId: testOrgId,
				creatorId: faker.string.uuid(),
				createdAt: new Date(),
				startAt: new Date(),
				endAt: new Date(),
				isRecurringEventTemplate: false,
			};

			mocks.drizzleClient.query.recurringEventInstancesTable.findFirst.mockResolvedValue(
				mockInstance,
			);

			const dbError = new Error("Query execution aborted");
			mocks.drizzleClient.query.eventsTable.findFirst.mockRejectedValue(
				dbError,
			);

			await expect(
				RecurringEventInstanceResolver(mockVolunteer, {}, ctx),
			).rejects.toThrow("Query execution aborted");
		});
	});
});
