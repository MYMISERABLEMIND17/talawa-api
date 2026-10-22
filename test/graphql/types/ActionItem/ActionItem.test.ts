import { faker } from "@faker-js/faker";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ActionItem as ActionItemType } from "~/src/graphql/types/ActionItem/ActionItem";
import { resolveIsInstanceException } from "~/src/graphql/types/ActionItem/ActionItem";

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

type ResolverField = {
	type: string;
	description: string;
	resolve: (parent: { isInstanceException?: boolean }) => boolean;
};

type ActionItemFieldMap = {
	id: { description: string };
	isCompleted: { description: string };
	isTemplate: { description: string; nullable: boolean };
	assignedAt: { description: string; type: string };
	completionAt: { description: string; type: string; nullable: boolean };
	preCompletionNotes: { description: string; nullable: boolean };
	postCompletionNotes: { description: string; nullable: boolean };
	isInstanceException: ResolverField;
};

describe("ActionItem GraphQL Type", () => {
	let fields: ActionItemFieldMap;
	let implementConfig: { description?: string; fields?: unknown };

	beforeAll(async () => {
		await import("~/src/graphql/types/ActionItem/ActionItem");

		implementConfig = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = implementConfig.fields as (
			t: unknown,
		) => ActionItemFieldMap;

		const tStub = {
			field: vi.fn((opts) => opts),
			exposeID: vi.fn((_name, opts) => opts),
			exposeBoolean: vi.fn((_name, opts) => opts),
			exposeString: vi.fn((_name, opts) => opts),
			expose: vi.fn((_name, opts) => opts),
		};

		fields = fieldsFactory(tStub);
	});

	it("registers the ActionItem object ref with builder", () => {
		expect(objectRefSpy).toHaveBeenCalledWith("ActionItem");
	});

	it("implements ActionItem with the correct description", () => {
		expect(implementConfig.description).toBe(
			"Represents an action item assigned to users, linked to events, categories, and organizations.",
		);
	});

	it("exposes scalar fields with correct descriptions and types", () => {
		expect(fields.id.description).toBe(
			"Unique identifier for the action item.",
		);
		expect(fields.isCompleted.description).toBe(
			"Indicates whether the action item is completed.",
		);
		expect(fields.assignedAt.type).toBe("DateTime");
		expect(fields.assignedAt.description).toBe(
			"Timestamp when the action item was assigned.",
		);
	});

	it("marks optional fields as nullable with expected descriptions", () => {
		expect(fields.isTemplate.nullable).toBe(true);
		expect(fields.isTemplate.description).toBe(
			"Indicates whether the action item is a template for recurring events.",
		);
		expect(fields.completionAt.nullable).toBe(true);
		expect(fields.completionAt.type).toBe("DateTime");
		expect(fields.preCompletionNotes.nullable).toBe(true);
		expect(fields.postCompletionNotes.nullable).toBe(true);
	});

	describe("resolveIsInstanceException function", () => {
		it("returns true when isInstanceException is true", () => {
			const result = resolveIsInstanceException({ isInstanceException: true });
			expect(result).toBe(true);
		});

		it("returns false when isInstanceException is false", () => {
			const result = resolveIsInstanceException({ isInstanceException: false });
			expect(result).toBe(false);
		});

		it("returns false when isInstanceException is undefined", () => {
			const result = resolveIsInstanceException({
				isInstanceException: undefined,
			});
			expect(result).toBe(false);
		});

		it("returns false when parent object is empty", () => {
			const result = resolveIsInstanceException({});
			expect(result).toBe(false);
		});

		it("correctly handles randomized boolean flags generated via faker", () => {
			const flag = faker.datatype.boolean();
			const result = resolveIsInstanceException({ isInstanceException: flag });
			expect(result).toBe(flag);
		});
	});

	describe("isInstanceException builder field resolver", () => {
		it("defines correct type and description on isInstanceException field", () => {
			expect(fields.isInstanceException.type).toBe("Boolean");
			expect(fields.isInstanceException.description).toBe(
				"Indicates whether this action item is currently showing instance-specific exception data.",
			);
		});

		it("returns true when the parent has an active exception", () => {
			const result = fields.isInstanceException.resolve({
				isInstanceException: true,
			} as unknown as ActionItemType);

			expect(result).toBe(true);
		});

		it("returns false when the parent explicitly has no exception", () => {
			const result = fields.isInstanceException.resolve({
				isInstanceException: false,
			} as unknown as ActionItemType);

			expect(result).toBe(false);
		});

		it("returns false when the parent omits the flag entirely", () => {
			const result = fields.isInstanceException.resolve(
				{} as unknown as ActionItemType,
			);

			expect(result).toBe(false);
		});
	});
});
