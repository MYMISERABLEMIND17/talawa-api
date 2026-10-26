import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { eventsTable } from "~/src/drizzle/tables/events";
import type { GraphQLContext } from "~/src/graphql/context";
import type { Event as EventType } from "~/src/graphql/types/Event/Event";
import { formatRecurrenceDescription } from "~/src/utilities/recurrenceFormatter";
import { escapeHTML } from "~/src/utilities/sanitizer";

const { implementSpy, objectRefSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	const objectRef = vi.fn(() => ({ implement }));
	return { implementSpy: implement, objectRefSpy: objectRef };
});

vi.mock("~/src/graphql/builder", () => ({
	builder: {
		objectRef: objectRefSpy,
	},
}));

vi.mock("~/src/utilities/sanitizer", () => ({
	escapeHTML: vi.fn((value: string) => `escaped_${value}`),
}));

vi.mock("~/src/utilities/recurrenceFormatter", () => ({
	formatRecurrenceDescription: vi.fn(() => "Every week on Monday"),
}));

vi.mock("~/src/graphql/types/EventAttachment/EventAttachment", () => ({
	EventAttachment: {},
}));

vi.mock("~/src/graphql/types/RecurrenceRule/RecurrenceRule", () => ({
	RecurrenceRule: {},
}));

type ResolverField = {
	resolve: (...args: unknown[]) => unknown;
	description?: string;
	nullable?: boolean;
	type?: unknown;
};

type ExposedField = {
	fieldName: string;
	options?: Record<string, unknown>;
};

type EventFieldMap = {
	attachments: ResolverField;
	description: ResolverField;
	endAt: ResolverField;
	id: ExposedField;
	name: ResolverField;
	startAt: ResolverField;
	startDate: ResolverField;
	endDate: ResolverField;
	allDay: ExposedField;
	isInviteOnly: ExposedField;
	isPublic: ExposedField;
	isRegisterable: ExposedField;
	location: ExposedField;
	isRecurringEventTemplate: ResolverField;
	isCancelled: ResolverField;
	baseEvent: ResolverField;
	hasExceptions: ResolverField;
	sequenceNumber: ResolverField;
	totalCount: ResolverField;
	progressLabel: ResolverField;
	recurrenceRule: ResolverField;
	recurrenceDescription: ResolverField;
	isGenerated: ResolverField;
	baseRecurringEventId: ResolverField;
};

const triggerWhere = (opts?: unknown) => {
	if (opts && typeof opts === "object" && "where" in opts) {
		const whereFn = (opts as { where?: unknown }).where;
		if (typeof whereFn === "function") {
			const dummyFields = new Proxy({}, { get: (_t, prop) => prop });
			const dummyOps = { eq: vi.fn((a, b) => ({ eq: [a, b] })) };
			whereFn(dummyFields, dummyOps);
		}
	}
};

const mockQueryMethod = (
	target: unknown,
	impl: (opts?: unknown) => Promise<unknown>,
) => {
	(target as { mockImplementation: (fn: unknown) => void }).mockImplementation(
		impl,
	);
};

describe("Event GraphQL Type", () => {
	let ctx: GraphQLContext;
	let mockEvent: EventType;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let fields: EventFieldMap;
	let implementDescription: string | undefined;

	beforeAll(async () => {
		await import("~/src/graphql/types/Event/Event");

		const implementCall = implementSpy.mock.calls[0]?.[0];
		implementDescription = implementCall?.description;
		const fieldsFactory = implementCall?.fields;

		const tStub = {
			field: vi.fn((opts) => opts),
			string: vi.fn((opts) => opts),
			exposeID: vi.fn((fieldName, options) => ({ fieldName, options })),
			exposeBoolean: vi.fn((fieldName, options) => ({ fieldName, options })),
			exposeString: vi.fn((fieldName, options) => ({ fieldName, options })),
			boolean: vi.fn((opts) => opts),
			int: vi.fn((opts) => opts),
			id: vi.fn((opts) => opts),
			listRef: vi.fn((_ref) => ({ __listOf: _ref })),
		};

		fields = fieldsFactory(tStub) as EventFieldMap;
	});

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			"user-123",
		);
		ctx = context;
		mocks = newMocks;

		mockQueryMethod(
			mocks.drizzleClient.query.eventAttachmentsTable.findMany,
			async (opts: unknown) => {
				triggerWhere(opts);
				return [];
			},
		);

		mockQueryMethod(
			mocks.drizzleClient.query.eventsTable.findFirst,
			async (opts: unknown) => {
				triggerWhere(opts);
				return undefined;
			},
		);

		mockQueryMethod(
			mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
			async (opts: unknown) => {
				triggerWhere(opts);
				return undefined;
			},
		);

		mockEvent = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Test Event",
			description: "Test Description",
			startAt: new Date("2026-01-01T10:00:00Z"),
			endAt: new Date("2026-01-01T11:00:00Z"),
			organizationId: "789e1234-e89b-12d3-a456-426614174002",
			createdAt: new Date("2026-01-01T09:00:00Z"),
			updatedAt: new Date("2026-01-01T09:30:00Z"),
			creatorId: "123e4567-e89b-12d3-a456-426614174000",
			updaterId: "223e4567-e89b-12d3-a456-426614174001",
			allDay: false,
			isPublic: true,
			isRegisterable: true,
			isInviteOnly: false,
			location: "Room A",
			isRecurringEventTemplate: false,
			startDate: null,
			endDate: null,
			attachments: [],
		} as unknown as EventType;

		vi.restoreAllMocks();
	});

	describe("Type definition and schema registration", () => {
		it("should register the type with description and expose expected fields", () => {
			expect(implementDescription).toBe(
				"Represents an event, which can be a standalone occurrence or a materialized instance of a recurring series. This unified type allows for consistent handling of all events.",
			);

			expect(fields.id.fieldName).toBe("id");
			expect(fields.allDay.fieldName).toBe("allDay");
			expect(fields.isInviteOnly.fieldName).toBe("isInviteOnly");
			expect(fields.isPublic.fieldName).toBe("isPublic");
			expect(fields.isRegisterable.fieldName).toBe("isRegisterable");
			expect(fields.location.fieldName).toBe("location");
		});
	});

	describe("attachments resolver", () => {
		it("should return event attachments when already present", async () => {
			const result = await fields.attachments.resolve(
				{ ...mockEvent, attachments: [{ id: "a1" }] },
				{},
				ctx,
			);

			expect(result).toEqual([{ id: "a1" }]);
			expect(
				mocks.drizzleClient.query.eventAttachmentsTable.findMany,
			).not.toHaveBeenCalled();
		});

		it("should fetch base event attachments for generated instances", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.eventAttachmentsTable.findMany,
				async (opts: unknown) => {
					triggerWhere(opts);
					return [{ id: "base-attachment" }];
				},
			);

			const result = await fields.attachments.resolve(
				{
					...mockEvent,
					attachments: [],
					baseRecurringEventId: "base-event-id",
				},
				{},
				ctx,
			);

			expect(result).toEqual([{ id: "base-attachment" }]);
			expect(
				mocks.drizzleClient.query.eventAttachmentsTable.findMany,
			).toHaveBeenCalledTimes(1);
		});

		it("should return empty array when no attachments and no base event", async () => {
			const result = await fields.attachments.resolve(
				{ ...mockEvent, attachments: [] },
				{},
				ctx,
			);

			expect(result).toEqual([]);
		});
	});

	describe("string and date resolvers", () => {
		it("should escape name and description", () => {
			const name = fields.name.resolve({ ...mockEvent, name: "<b>Unsafe</b>" });
			const description = fields.description.resolve({
				...mockEvent,
				description: "<script>alert(1)</script>",
			});

			expect(name).toBe("escaped_<b>Unsafe</b>");
			expect(description).toBe("escaped_<script>alert(1)</script>");
			expect(escapeHTML).toHaveBeenCalledWith("<b>Unsafe</b>");
			expect(escapeHTML).toHaveBeenCalledWith("<script>alert(1)</script>");
		});

		it("should return null for empty or null description", () => {
			expect(
				fields.description.resolve({
					...mockEvent,
					description: "",
				}),
			).toBeNull();

			expect(
				fields.description.resolve({
					...mockEvent,
					description: null,
				}),
			).toBeNull();
		});

		it("should use actualStartTime and actualEndTime when present, or fallback to startAt/endAt", () => {
			const actualStart = new Date("2026-01-02T10:00:00Z");
			const actualEnd = new Date("2026-01-02T11:00:00Z");
			const standaloneEvent = mockEvent as typeof eventsTable.$inferSelect;

			expect(
				fields.startAt.resolve({ ...mockEvent, actualStartTime: actualStart }),
			).toEqual(actualStart);
			expect(
				fields.endAt.resolve({ ...mockEvent, actualEndTime: actualEnd }),
			).toEqual(actualEnd);

			expect(fields.startAt.resolve(standaloneEvent)).toEqual(
				standaloneEvent.startAt,
			);
			expect(fields.endAt.resolve(standaloneEvent)).toEqual(
				standaloneEvent.endAt,
			);
		});

		it("should resolve and escape startDate from actualStartDate or startDate fallback, handling nulls", () => {
			expect(
				fields.startDate.resolve({
					actualStartDate: "2026-01-01",
				}),
			).toBe("escaped_2026-01-01");

			expect(
				fields.startDate.resolve({
					actualStartDate: null,
				}),
			).toBeNull();

			expect(
				fields.startDate.resolve({
					startDate: "2026-01-02",
				}),
			).toBe("escaped_2026-01-02");

			expect(
				fields.startDate.resolve({
					startDate: null,
				}),
			).toBeNull();

			expect(fields.startDate.resolve({})).toBeNull();
		});

		it("should resolve and escape endDate from actualEndDate or endDate fallback, handling nulls", () => {
			expect(
				fields.endDate.resolve({
					actualEndDate: "2026-01-03",
				}),
			).toBe("escaped_2026-01-03");

			expect(
				fields.endDate.resolve({
					actualEndDate: null,
				}),
			).toBeNull();

			expect(
				fields.endDate.resolve({
					endDate: "2026-01-04",
				}),
			).toBe("escaped_2026-01-04");

			expect(
				fields.endDate.resolve({
					endDate: null,
				}),
			).toBeNull();

			expect(fields.endDate.resolve({})).toBeNull();
		});
	});

	describe("boolean flag resolvers", () => {
		it("should resolve isRecurringEventTemplate correctly", () => {
			expect(
				fields.isRecurringEventTemplate.resolve({
					isRecurringEventTemplate: true,
				}),
			).toBe(true);
			expect(
				fields.isRecurringEventTemplate.resolve({
					isRecurringEventTemplate: false,
				}),
			).toBe(false);
			expect(fields.isRecurringEventTemplate.resolve({})).toBe(false);
		});

		it("should resolve isCancelled correctly", () => {
			expect(fields.isCancelled.resolve({ isCancelled: true })).toBe(true);
			expect(fields.isCancelled.resolve({ isCancelled: false })).toBe(false);
			expect(fields.isCancelled.resolve({})).toBe(false);
		});

		it("should resolve hasExceptions correctly", () => {
			expect(fields.hasExceptions.resolve({ hasExceptions: true })).toBe(true);
			expect(fields.hasExceptions.resolve({ hasExceptions: false })).toBe(
				false,
			);
			expect(fields.hasExceptions.resolve({})).toBe(false);
		});
	});

	describe("sequence, count and progress resolvers", () => {
		it("should resolve sequenceNumber", () => {
			expect(fields.sequenceNumber.resolve({ sequenceNumber: 3 })).toBe(3);
			expect(fields.sequenceNumber.resolve({})).toBeNull();
		});

		it("should resolve totalCount", () => {
			expect(fields.totalCount.resolve({ totalCount: 12 })).toBe(12);
			expect(fields.totalCount.resolve({})).toBeNull();
		});

		it("should resolve progressLabel for finite, infinite series, and incomplete objects", () => {
			expect(
				fields.progressLabel.resolve({ sequenceNumber: 2, totalCount: 10 }),
			).toBe("escaped_2 of 10");
			expect(
				fields.progressLabel.resolve({ sequenceNumber: 5, totalCount: null }),
			).toBe("escaped_#5");
			expect(fields.progressLabel.resolve({ sequenceNumber: 1 })).toBeNull();
			expect(fields.progressLabel.resolve({ totalCount: 10 })).toBeNull();
			expect(fields.progressLabel.resolve({})).toBeNull();
		});
	});

	describe("baseEvent and baseRecurringEventId resolvers", () => {
		it("should resolve baseEvent when baseRecurringEventId exists and base event is found", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.eventsTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return {
						id: "base-id",
						name: "Base Event",
					};
				},
			);

			const result = await fields.baseEvent.resolve(
				{ ...mockEvent, baseRecurringEventId: "base-id" },
				{},
				ctx,
			);

			expect(result).toEqual({
				id: "base-id",
				name: "Base Event",
				attachments: [],
			});
		});

		it("should return null for baseEvent when base event is not found in database", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.eventsTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return undefined;
				},
			);

			const result = await fields.baseEvent.resolve(
				{ ...mockEvent, baseRecurringEventId: "base-id" },
				{},
				ctx,
			);

			expect(result).toBeNull();
		});

		it("should return null for baseEvent when baseRecurringEventId is missing or falsy", async () => {
			expect(
				await fields.baseEvent.resolve(
					{ ...mockEvent, baseRecurringEventId: null },
					{},
					ctx,
				),
			).toBeNull();

			expect(await fields.baseEvent.resolve({}, {}, ctx)).toBeNull();

			expect(
				mocks.drizzleClient.query.eventsTable.findFirst,
			).not.toHaveBeenCalled();
		});

		it("should resolve baseRecurringEventId when present and non-empty", () => {
			expect(
				fields.baseRecurringEventId.resolve({
					baseRecurringEventId: "base-123",
				}),
			).toBe("base-123");
			expect(
				fields.baseRecurringEventId.resolve({
					baseRecurringEventId: null,
				}),
			).toBeNull();
			expect(
				fields.baseRecurringEventId.resolve({
					baseRecurringEventId: "",
				}),
			).toBeNull();
			expect(fields.baseRecurringEventId.resolve({})).toBeNull();
		});
	});

	describe("recurrenceRule and recurrenceDescription resolvers", () => {
		it("should resolve recurrenceRule by recurrenceRuleId", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr1", frequency: "weekly" };
				},
			);

			const result = await fields.recurrenceRule.resolve(
				{ ...mockEvent, recurrenceRuleId: "rr1" },
				{},
				ctx,
			);

			expect(result).toEqual({ id: "rr1", frequency: "weekly" });
		});

		it("should resolve recurrenceRule by baseRecurringEventId", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr-base", frequency: "daily" };
				},
			);

			const result = await fields.recurrenceRule.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: "base-event-id",
				},
				{},
				ctx,
			);

			expect(result).toEqual({ id: "rr-base", frequency: "daily" });
		});

		it("should resolve recurrenceRule for recurring template by event id", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr-template", frequency: "monthly" };
				},
			);

			const result = await fields.recurrenceRule.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: null,
					isRecurringEventTemplate: true,
				},
				{},
				ctx,
			);

			expect(result).toEqual({ id: "rr-template", frequency: "monthly" });
		});

		it("should return null for recurrenceRule when none of the conditions match", async () => {
			const result = await fields.recurrenceRule.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: null,
					isRecurringEventTemplate: false,
				},
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
			).not.toHaveBeenCalled();
		});

		it("should resolve recurrenceDescription by recurrenceRuleId and escape formatter output", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr2", frequency: "weekly" };
				},
			);

			const result = await fields.recurrenceDescription.resolve(
				{ ...mockEvent, recurrenceRuleId: "rr2" },
				{},
				ctx,
			);

			expect(formatRecurrenceDescription).toHaveBeenCalledWith({
				id: "rr2",
				frequency: "weekly",
			});
			expect(result).toBe("escaped_Every week on Monday");
		});

		it("should resolve recurrenceDescription by baseRecurringEventId", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr3", frequency: "daily" };
				},
			);

			const result = await fields.recurrenceDescription.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: "base-event-id",
				},
				{},
				ctx,
			);

			expect(formatRecurrenceDescription).toHaveBeenCalledWith({
				id: "rr3",
				frequency: "daily",
			});
			expect(result).toBe("escaped_Every week on Monday");
		});

		it("should resolve recurrenceDescription for recurring template by event id", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return { id: "rr4", frequency: "yearly" };
				},
			);

			const result = await fields.recurrenceDescription.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: null,
					isRecurringEventTemplate: true,
				},
				{},
				ctx,
			);

			expect(formatRecurrenceDescription).toHaveBeenCalledWith({
				id: "rr4",
				frequency: "yearly",
			});
			expect(result).toBe("escaped_Every week on Monday");
		});

		it("should return null when recurrenceDescription has no matching rule found in database", async () => {
			mockQueryMethod(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
				async (opts: unknown) => {
					triggerWhere(opts);
					return undefined;
				},
			);

			const result = await fields.recurrenceDescription.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: "base-event-id",
				},
				{},
				ctx,
			);

			expect(result).toBeNull();
		});

		it("should return null for recurrenceDescription when no recurrence criteria are met", async () => {
			const result = await fields.recurrenceDescription.resolve(
				{
					...mockEvent,
					recurrenceRuleId: null,
					baseRecurringEventId: null,
					isRecurringEventTemplate: false,
				},
				{},
				ctx,
			);

			expect(result).toBeNull();
			expect(
				mocks.drizzleClient.query.recurrenceRulesTable.findFirst,
			).not.toHaveBeenCalled();
		});
	});

	describe("isGenerated resolver", () => {
		it("should resolve isGenerated using explicit flag or baseRecurringEventId", () => {
			expect(fields.isGenerated.resolve({ isGenerated: true })).toBe(true);
			expect(
				fields.isGenerated.resolve({
					isGenerated: false,
					baseRecurringEventId: "base-id",
				}),
			).toBe(true);
			expect(fields.isGenerated.resolve({ isGenerated: false })).toBe(false);
			expect(fields.isGenerated.resolve({})).toBe(false);
		});
	});
});
