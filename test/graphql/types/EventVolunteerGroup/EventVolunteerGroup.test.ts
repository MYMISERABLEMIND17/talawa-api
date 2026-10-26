import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EventVolunteerGroup as EventVolunteerGroupType } from "~/src/graphql/types/EventVolunteerGroup/EventVolunteerGroup";
import {
	EventVolunteerGroup,
	EventVolunteerGroupIsInstanceExceptionResolver,
} from "~/src/graphql/types/EventVolunteerGroup/EventVolunteerGroup";

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

type FieldOptions = {
	description?: string;
	nullable?: boolean;
	type?: string;
	resolve?: (...args: unknown[]) => unknown;
};

type ExposedFieldCall = {
	name: string;
	options: FieldOptions;
};

type CapturedFields = {
	id: ExposedFieldCall;
	name: ExposedFieldCall;
	description: ExposedFieldCall;
	volunteersRequired: ExposedFieldCall;
	isTemplate: ExposedFieldCall;
	isInstanceException: FieldOptions;
};

describe("EventVolunteerGroup GraphQL Type", () => {
	let capturedFields: CapturedFields;
	let implementDescription: string | undefined;

	beforeAll(async () => {
		// Import the module under test
		await import("~/src/graphql/types/EventVolunteerGroup/EventVolunteerGroup");

		const implementCall = implementSpy.mock.calls[0]?.[0];
		implementDescription = implementCall?.description;
		const fieldsFactory = implementCall?.fields;

		const tStub = {
			exposeID: vi.fn((name: string, options: FieldOptions) => ({
				name,
				options,
			})),
			exposeString: vi.fn((name: string, options: FieldOptions) => ({
				name,
				options,
			})),
			exposeInt: vi.fn((name: string, options: FieldOptions) => ({
				name,
				options,
			})),
			exposeBoolean: vi.fn((name: string, options: FieldOptions) => ({
				name,
				options,
			})),
			field: vi.fn((options: FieldOptions) => options),
		};

		capturedFields = fieldsFactory(tStub) as unknown as CapturedFields;
	});

	describe("ObjectRef and Implementation", () => {
		it("should register EventVolunteerGroup with builder.objectRef", () => {
			expect(objectRefSpy).toHaveBeenCalledWith("EventVolunteerGroup");
			expect(EventVolunteerGroup).toBeDefined();
		});

		it("should configure proper description on EventVolunteerGroup type", () => {
			expect(implementDescription).toBe(
				"Represents a volunteer group for a specific event with a leader.",
			);
		});
	});

	describe("Exposed Fields", () => {
		it("should expose id field with correct options", () => {
			expect(capturedFields.id.name).toBe("id");
			expect(capturedFields.id.options).toEqual({
				description: "Primary unique identifier of the event volunteer group.",
			});
		});

		it("should expose name field with correct options", () => {
			expect(capturedFields.name.name).toBe("name");
			expect(capturedFields.name.options).toEqual({
				description: "Name of the volunteer group.",
			});
		});

		it("should expose description field with nullable option", () => {
			expect(capturedFields.description.name).toBe("description");
			expect(capturedFields.description.options).toEqual({
				description: "Description of the volunteer group.",
				nullable: true,
			});
		});

		it("should expose volunteersRequired field with nullable option", () => {
			expect(capturedFields.volunteersRequired.name).toBe("volunteersRequired");
			expect(capturedFields.volunteersRequired.options).toEqual({
				description: "Number of volunteers required for this group.",
				nullable: true,
			});
		});

		it("should expose isTemplate boolean field", () => {
			expect(capturedFields.isTemplate.name).toBe("isTemplate");
			expect(capturedFields.isTemplate.options).toEqual({
				description:
					"Boolean indicating if this is a template volunteer group (for recurring events).",
			});
		});

		it("should define isInstanceException field with Boolean type and resolver", () => {
			expect(capturedFields.isInstanceException.type).toBe("Boolean");
			expect(capturedFields.isInstanceException.description).toBe(
				"Indicates whether this volunteer group is currently showing instance-specific exception data.",
			);
			expect(capturedFields.isInstanceException.resolve).toBe(
				EventVolunteerGroupIsInstanceExceptionResolver,
			);
		});
	});

	describe("EventVolunteerGroupIsInstanceExceptionResolver", () => {
		it("should return true when isInstanceException is true", () => {
			const parent = {
				id: "group-1",
				eventId: "event-1",
				leaderId: "user-1",
				creatorId: "user-1",
				name: "Security",
				description: "Security detail",
				volunteersRequired: 4,
				createdAt: new Date(),
				updatedAt: new Date(),
				updaterId: "user-1",
				recurringEventInstanceId: null,
				isTemplate: false,
				isInstanceException: true,
			} as EventVolunteerGroupType;

			const result = EventVolunteerGroupIsInstanceExceptionResolver(parent);
			expect(result).toBe(true);
		});

		it("should return false when isInstanceException is false", () => {
			const parent = {
				id: "group-1",
				eventId: "event-1",
				leaderId: "user-1",
				creatorId: "user-1",
				name: "Security",
				description: null,
				volunteersRequired: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				updaterId: "user-1",
				recurringEventInstanceId: null,
				isTemplate: false,
				isInstanceException: false,
			} as EventVolunteerGroupType;

			const result = EventVolunteerGroupIsInstanceExceptionResolver(parent);
			expect(result).toBe(false);
		});

		it("should return false when isInstanceException is undefined", () => {
			const parent = {
				id: "group-1",
				eventId: "event-1",
				leaderId: "leader-1",
				creatorId: "user-1",
				name: "Logistics",
				description: null,
				volunteersRequired: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
				updaterId: "user-1",
				recurringEventInstanceId: null,
				isTemplate: false,
			} as EventVolunteerGroupType;

			const result = EventVolunteerGroupIsInstanceExceptionResolver(parent);
			expect(result).toBe(false);
		});

		it("should return false when isInstanceException is null or falsy", () => {
			const parent = {
				id: "group-1",
				eventId: "event-1",
				leaderId: "leader-1",
				creatorId: "user-1",
				name: "Logistics",
				description: null,
				volunteersRequired: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				updaterId: "user-1",
				recurringEventInstanceId: null,
				isTemplate: false,
				isInstanceException: null as unknown as boolean,
			} as EventVolunteerGroupType;

			const result = EventVolunteerGroupIsInstanceExceptionResolver(parent);
			expect(result).toBe(false);
		});
	});
});
