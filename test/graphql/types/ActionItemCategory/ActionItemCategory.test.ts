import { faker } from "@faker-js/faker";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ActionItemCategory as ActionItemCategoryType } from "~/src/graphql/types/ActionItemCategory/ActionItemCategory";
import {
	categoriesByIdsInputSchema,
	categoriesByIdsResolver,
} from "~/src/graphql/types/ActionItemCategory/ActionItemCategory";
import { createMockGraphQLContext } from "../../../_Mocks_/mockContextCreator/mockContextCreator";

const { implementSpy, objectRefSpy, queryFieldSpy, inputTypeSpy } = vi.hoisted(
	() => {
		const implement = vi.fn();
		const objectRef = vi.fn(() => ({ implement }));
		const queryField = vi.fn((_name, factory) => {
			const tStub = {
				field: vi.fn((opts) => opts),
				arg: vi.fn((opts) => opts),
			};
			return typeof factory === "function" ? factory(tStub) : undefined;
		});
		const inputType = vi.fn((_name, config) => {
			const tStub = {
				field: vi.fn((opts) => opts),
			};
			if (typeof config?.fields === "function") {
				config.fields(tStub);
			}
			return config;
		});
		return {
			implementSpy: implement,
			objectRefSpy: objectRef,
			queryFieldSpy: queryField,
			inputTypeSpy: inputType,
		};
	},
);

vi.mock("~/src/graphql/builder", () => ({
	builder: {
		objectRef: objectRefSpy,
		queryField: queryFieldSpy,
		inputType: inputTypeSpy,
	},
}));

type ActionItemCategoryFieldMap = {
	id: { description: string };
	name: { description: string };
	description: { description: string; nullable?: boolean };
	isDisabled: { description: string };
};

describe("ActionItemCategory GraphQL Type and Query", () => {
	let fields: ActionItemCategoryFieldMap;
	let implementConfig: { description?: string; fields?: unknown };

	beforeAll(async () => {
		await import("~/src/graphql/types/ActionItemCategory/ActionItemCategory");

		implementConfig = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = implementConfig.fields as (
			t: unknown,
		) => ActionItemCategoryFieldMap;

		const tStub = {
			exposeID: vi.fn((_name, opts) => opts),
			exposeString: vi.fn((_name, opts) => opts),
			exposeBoolean: vi.fn((_name, opts) => opts),
		};

		fields = fieldsFactory(tStub);
	});

	it("registers the ActionItemCategory object ref with builder", () => {
		expect(objectRefSpy).toHaveBeenCalledWith("ActionItemCategory");
	});

	it("implements ActionItemCategory with the correct description", () => {
		expect(implementConfig.description).toBe(
			"Represents a category for action items, including metadata such as creation and update timestamps.",
		);
	});

	it("exposes scalar fields with correct descriptions", () => {
		expect(fields.id.description).toBe(
			"Unique identifier for the action item category.",
		);
		expect(fields.name.description).toBe(
			"The name of the action item category.",
		);
		expect(fields.isDisabled.description).toBe(
			"Indicates whether the action item category is disabled.",
		);
	});

	it("marks description field as nullable with correct description", () => {
		expect(fields.description.description).toBe(
			"The description of the action item category.",
		);
		expect(fields.description.nullable).toBe(true);
	});

	it("registers categoriesByIds queryField on builder with inputType", () => {
		expect(queryFieldSpy).toHaveBeenCalledWith(
			"categoriesByIds",
			expect.any(Function),
		);
		expect(inputTypeSpy).toHaveBeenCalledWith(
			"CategoriesByIdsInput",
			expect.objectContaining({
				fields: expect.any(Function),
			}),
		);
	});

	describe("categoriesByIdsInputSchema validation", () => {
		it("successfully parses valid UUID array", () => {
			const validIds = [faker.string.uuid(), faker.string.uuid()];
			const result = categoriesByIdsInputSchema.safeParse({ ids: validIds });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ids).toEqual(validIds);
			}
		});

		it("fails validation when ids array is empty", () => {
			const result = categoriesByIdsInputSchema.safeParse({ ids: [] });
			expect(result.success).toBe(false);
		});

		it("fails validation when ids contain invalid non-UUID string", () => {
			const result = categoriesByIdsInputSchema.safeParse({
				ids: ["not-a-valid-uuid"],
			});
			expect(result.success).toBe(false);
		});

		it("fails validation when ids property is omitted", () => {
			const result = categoriesByIdsInputSchema.safeParse({});
			expect(result.success).toBe(false);
		});
	});

	describe("categoriesByIdsResolver", () => {
		it("throws Error('Unauthenticated') when client is not authenticated", async () => {
			const { context } = createMockGraphQLContext(false);
			const args = {
				input: {
					ids: [faker.string.uuid()],
				},
			};

			await expect(
				categoriesByIdsResolver(null, args, context),
			).rejects.toThrow("Unauthenticated");
		});

		it("throws Error('Invalid arguments') when arguments fail schema validation", async () => {
			const { context } = createMockGraphQLContext(true);
			const args = {
				input: {
					ids: [],
				},
			};

			await expect(
				categoriesByIdsResolver(null, args, context),
			).rejects.toThrow("Invalid arguments");
		});

		it("throws Error('Invalid arguments') when arguments contain invalid UUID", async () => {
			const { context } = createMockGraphQLContext(true);
			const args = {
				input: {
					ids: ["invalid-id"],
				},
			};

			await expect(
				categoriesByIdsResolver(null, args, context),
			).rejects.toThrow("Invalid arguments");
		});

		it("queries database and returns category list on valid request", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const catId1 = faker.string.uuid();
			const catId2 = faker.string.uuid();
			const orgId = faker.string.uuid();

			const mockCategories: ActionItemCategoryType[] = [
				{
					id: catId1,
					name: "Maintenance",
					description: "Facility maintenance",
					isDisabled: false,
					organizationId: orgId,
					createdAt: new Date(),
					updatedAt: new Date(),
					creatorId: faker.string.uuid(),
					updaterId: faker.string.uuid(),
				},
				{
					id: catId2,
					name: "Logistics",
					description: null,
					isDisabled: true,
					organizationId: orgId,
					createdAt: new Date(),
					updatedAt: new Date(),
					creatorId: faker.string.uuid(),
					updaterId: faker.string.uuid(),
				},
			];

			mocks.drizzleClient.query.actionItemCategoriesTable.findMany.mockImplementation(
				(options?: {
					where?: (fields: unknown, operators: unknown) => unknown;
				}) => {
					if (typeof options?.where === "function") {
						options.where({ id: "id" }, {});
					}
					return Promise.resolve(mockCategories);
				},
			);

			const args = {
				input: {
					ids: [catId1, catId2],
				},
			};

			const result = await categoriesByIdsResolver(null, args, context);

			expect(
				mocks.drizzleClient.query.actionItemCategoriesTable.findMany,
			).toHaveBeenCalledTimes(1);
			expect(result).toEqual(mockCategories);
		});

		it("returns empty array when database returns no matches", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const catId = faker.string.uuid();

			mocks.drizzleClient.query.actionItemCategoriesTable.findMany.mockResolvedValue(
				[],
			);

			const args = {
				input: {
					ids: [catId],
				},
			};

			const result = await categoriesByIdsResolver(null, args, context);

			expect(
				mocks.drizzleClient.query.actionItemCategoriesTable.findMany,
			).toHaveBeenCalledTimes(1);
			expect(result).toEqual([]);
		});
	});
});
