import { Buffer } from "node:buffer";
import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import type { Event as EventType } from "~/src/graphql/types/Event/Event";
import {
	resolveEventVenuesPaginated,
	venuesComplexity,
} from "~/src/graphql/types/Event/venues";
import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

const { implementSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	return { implementSpy: implement };
});

vi.mock("~/src/graphql/types/Event/Event", () => ({
	Event: {
		implement: implementSpy,
	},
}));

vi.mock("~/src/graphql/types/Venue/Venue", () => ({
	Venue: {},
}));

type ComplexityResult = {
	field: number;
	multiplier: number;
};

type ConnectionConfig = {
	description: string;
	resolve: typeof resolveEventVenuesPaginated;
	complexity: typeof venuesComplexity;
	type: unknown;
	edgesField?: { complexity: ComplexityResult };
	nodeField?: { complexity: ComplexityResult };
};

type EventFieldsMap = {
	venues: ConnectionConfig;
};

const makeCursor = (data: { venueId: string; createdAt: string }) => {
	return Buffer.from(JSON.stringify(data), "utf-8").toString("base64url");
};

const mockQueryMethod = (
	target: unknown,
	impl: (opts?: unknown) => Promise<unknown>,
) => {
	(target as { mockImplementation: (fn: unknown) => void }).mockImplementation(
		impl,
	);
};

describe("Event venues connection field", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let mockEvent: EventType;
	let connectionField: ConnectionConfig;

	beforeAll(async () => {
		await import("~/src/graphql/types/Event/venues");

		const implementCall = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = implementCall?.fields;

		const tStub = {
			connection: vi.fn((config, edgesOpts, nodeOpts) => ({
				...config,
				edgesField: edgesOpts?.edgesField,
				nodeField: nodeOpts?.nodeField,
			})),
		};

		const fields = fieldsFactory(tStub) as EventFieldsMap;
		connectionField = fields.venues;
	});

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			"user-123",
		);
		ctx = context;
		mocks = newMocks;

		mockEvent = {
			id: faker.string.uuid(),
			name: "Test Event",
			description: "Event for venue booking test",
			organizationId: faker.string.uuid(),
			allDay: false,
			isPublic: true,
			isRegisterable: true,
			isInviteOnly: false,
			location: "Hall A",
			isRecurringEventTemplate: false,
			startDate: null,
			endDate: null,
			attachments: [],
		} as unknown as EventType;

		mockQueryMethod(
			mocks.drizzleClient.query.venueBookingsTable.findMany,
			async () => [],
		);
	});

	describe("Schema definition and complexity", () => {
		it("should register the venues connection field with proper description and type", () => {
			expect(connectionField).toBeDefined();
			expect(connectionField.description).toBe(
				"GraphQL connection to traverse through the venues that are booked for the event.",
			);
			expect(connectionField.resolve).toBe(resolveEventVenuesPaginated);
			expect(connectionField.complexity).toBe(venuesComplexity);
		});

		it("should calculate complexity based on first, last, or default limit", () => {
			expect(venuesComplexity({ first: 10 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 10,
			});
			expect(venuesComplexity({ last: 5 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 5,
			});
			expect(venuesComplexity({})).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});

		it("should configure edges and node field complexities correctly", () => {
			expect(connectionField.edgesField?.complexity).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
			expect(connectionField.nodeField?.complexity).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Arguments validation", () => {
		it("should throw invalid_arguments error when both first and last are provided", async () => {
			await expect(
				resolveEventVenuesPaginated(
					mockEvent,
					{ first: 10, last: 5 } as unknown as { first: number },
					ctx,
				),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ first: 10, last: 5 } as unknown as { first: number },
					ctx,
				);
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
			}
		});

		it("should throw invalid_arguments error when neither first nor last is provided", async () => {
			await expect(
				resolveEventVenuesPaginated(
					mockEvent,
					{} as unknown as { first: number },
					ctx,
				),
			).rejects.toThrow(TalawaGraphQLError);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{} as unknown as { first: number },
					ctx,
				);
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
			}
		});

		it("should throw invalid_arguments error when malformed cursor is passed with forward pagination (after)", async () => {
			const invalidCursor = Buffer.from("not-a-json-string", "utf-8").toString(
				"base64url",
			);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ first: 10, after: invalidCursor },
					ctx,
				);
				expect.fail("Expected invalid cursor to throw");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
					message: string;
				}>;
				expect(issues?.[0]?.argumentPath).toContain("after");
				expect(issues?.[0]?.message).toBe("Not a valid cursor.");
			}
		});

		it("should throw invalid_arguments error when malformed cursor is passed with backward pagination (before)", async () => {
			const invalidCursor = Buffer.from("not-a-json-string", "utf-8").toString(
				"base64url",
			);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ last: 10, before: invalidCursor },
					ctx,
				);
				expect.fail("Expected invalid cursor to throw");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
					message: string;
				}>;
				expect(issues?.[0]?.argumentPath).toContain("before");
				expect(issues?.[0]?.message).toBe("Not a valid cursor.");
			}
		});

		it("should throw invalid_arguments error when cursor JSON has invalid schema fields", async () => {
			const invalidFieldCursor = Buffer.from(
				JSON.stringify({ venueId: "v1", createdAt: "not-a-date" }),
				"utf-8",
			).toString("base64url");

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ first: 10, after: invalidFieldCursor },
					ctx,
				);
				expect.fail("Expected schema validation failure");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe("invalid_arguments");
			}
		});
	});

	describe("Forward pagination", () => {
		it("should return empty connection when no venue bookings exist without cursor", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ first: 10 },
				ctx,
			);

			expect(result.edges).toEqual([]);
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
			expect(result.pageInfo.startCursor).toBeNull();
			expect(result.pageInfo.endCursor).toBeNull();
		});

		it("should return venues connection with edges and nodes when bookings exist", async () => {
			const bookingDate = new Date("2026-03-01T12:00:00.000Z");
			const venueId = faker.string.uuid();
			const mockBooking = {
				createdAt: bookingDate,
				venueId,
				venue: {
					id: venueId,
					name: "Main Auditorium",
					description: "Large conference auditorium",
					capacity: 500,
					attachmentsWhereVenue: [{ id: "att-1", name: "floor_plan.png" }],
				},
			};

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [mockBooking],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ first: 10 },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node).toEqual({
				id: venueId,
				name: "Main Auditorium",
				description: "Large conference auditorium",
				capacity: 500,
				attachments: [{ id: "att-1", name: "floor_plan.png" }],
			});
			expect(result.edges[0]?.cursor).toBeDefined();
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		it("should handle forward pagination with a valid after cursor", async () => {
			const cursorDate = new Date("2026-03-01T10:00:00.000Z");
			const cursorVenueId = faker.string.uuid();
			const validAfterCursor = makeCursor({
				venueId: cursorVenueId,
				createdAt: cursorDate.toISOString(),
			});

			const nextVenueId = faker.string.uuid();
			const nextBooking = {
				createdAt: new Date("2026-03-01T09:00:00.000Z"),
				venueId: nextVenueId,
				venue: {
					id: nextVenueId,
					name: "Side Hall",
					description: null,
					capacity: 100,
					attachmentsWhereVenue: [],
				},
			};

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [nextBooking],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ first: 5, after: validAfterCursor },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(nextVenueId);
			expect(result.edges[0]?.node.attachments).toEqual([]);
		});

		it("should throw arguments_associated_resources_not_found when forward cursor returns 0 items", async () => {
			const cursorDate = new Date("2026-03-01T10:00:00.000Z");
			const validAfterCursor = makeCursor({
				venueId: faker.string.uuid(),
				createdAt: cursorDate.toISOString(),
			});

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [],
			);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ first: 5, after: validAfterCursor },
					ctx,
				);
				expect.fail("Expected missing resource error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe(
					"arguments_associated_resources_not_found",
				);
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["after"]);
			}
		});
	});

	describe("Backward pagination", () => {
		it("should return empty connection when no venue bookings exist without cursor", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ last: 10 },
				ctx,
			);

			expect(result.edges).toEqual([]);
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		it("should return venues connection with edges and nodes when backward query returns bookings", async () => {
			const bookingDate = new Date("2026-03-01T12:00:00.000Z");
			const venueId = faker.string.uuid();
			const mockBooking = {
				createdAt: bookingDate,
				venueId,
				venue: {
					id: venueId,
					name: "Conference Room B",
					description: "Equipped with projector",
					capacity: 50,
					attachmentsWhereVenue: [],
				},
			};

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [mockBooking],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ last: 5 },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(venueId);
			expect(result.edges[0]?.node.name).toBe("Conference Room B");
		});

		it("should handle backward pagination with a valid before cursor", async () => {
			const cursorDate = new Date("2026-03-01T10:00:00.000Z");
			const cursorVenueId = faker.string.uuid();
			const validBeforeCursor = makeCursor({
				venueId: cursorVenueId,
				createdAt: cursorDate.toISOString(),
			});

			const prevVenueId = faker.string.uuid();
			const prevBooking = {
				createdAt: new Date("2026-03-01T11:00:00.000Z"),
				venueId: prevVenueId,
				venue: {
					id: prevVenueId,
					name: "Meeting Room 1",
					description: null,
					capacity: 20,
					attachmentsWhereVenue: [],
				},
			};

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [prevBooking],
			);

			const result = await resolveEventVenuesPaginated(
				mockEvent,
				{ last: 5, before: validBeforeCursor },
				ctx,
			);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.id).toBe(prevVenueId);
		});

		it("should throw arguments_associated_resources_not_found when backward cursor returns 0 items", async () => {
			const cursorDate = new Date("2026-03-01T10:00:00.000Z");
			const validBeforeCursor = makeCursor({
				venueId: faker.string.uuid(),
				createdAt: cursorDate.toISOString(),
			});

			mockQueryMethod(
				mocks.drizzleClient.query.venueBookingsTable.findMany,
				async () => [],
			);

			try {
				await resolveEventVenuesPaginated(
					mockEvent,
					{ last: 5, before: validBeforeCursor },
					ctx,
				);
				expect.fail("Expected missing resource error");
			} catch (error) {
				const gqlError = error as TalawaGraphQLError;
				expect(gqlError.extensions?.code).toBe(
					"arguments_associated_resources_not_found",
				);
				const issues = gqlError.extensions?.issues as Array<{
					argumentPath: string[];
				}>;
				expect(issues?.[0]?.argumentPath).toEqual(["before"]);
			}
		});
	});
});
