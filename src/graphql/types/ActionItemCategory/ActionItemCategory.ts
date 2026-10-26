import type { InferSelectModel } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { actionItemCategoriesTable } from "~/src/drizzle/tables/actionItemCategories";
import { builder } from "~/src/graphql/builder";
import type { GraphQLContext } from "~/src/graphql/context";

/**
 * Type representing an ActionItemCategory entity inferred from database schema.
 */
export type ActionItemCategory = InferSelectModel<
	typeof actionItemCategoriesTable
>;

/**
 * Pothos GraphQL ObjectRef for ActionItemCategory.
 */
export const ActionItemCategory =
	builder.objectRef<ActionItemCategory>("ActionItemCategory");

ActionItemCategory.implement({
	description:
		"Represents a category for action items, including metadata such as creation and update timestamps.",
	fields: (t) => ({
		id: t.exposeID("id", {
			description: "Unique identifier for the action item category.",
		}),
		name: t.exposeString("name", {
			description: "The name of the action item category.",
		}),
		description: t.exposeString("description", {
			description: "The description of the action item category.",
			nullable: true,
		}),
		isDisabled: t.exposeBoolean("isDisabled", {
			description: "Indicates whether the action item category is disabled.",
		}),
	}),
});

/**
 * Input validation schema for fetching categories by IDs.
 */
export const categoriesByIdsInputSchema = z.object({
	ids: z.array(z.string().uuid()).min(1),
});

/**
 * Input arguments type for categoriesByIds query.
 */
export type CategoriesByIdsArgs = {
	input: {
		ids: string[];
	};
};

/**
 * Resolver function to fetch multiple action item categories by their IDs.
 *
 * @param _parent - The GraphQL parent object (unused).
 * @param args - The query arguments containing the array of category IDs.
 * @param ctx - The GraphQL context containing authentication and database client.
 * @returns A promise that resolves to an array of action item categories.
 * @throws {Error} If the current client is unauthenticated.
 * @throws {Error} If the input arguments fail schema validation.
 */
export const categoriesByIdsResolver = async (
	_parent: unknown,
	args: CategoriesByIdsArgs,
	ctx: GraphQLContext,
): Promise<ActionItemCategory[]> => {
	if (!ctx.currentClient.isAuthenticated) {
		throw new Error("Unauthenticated");
	}

	const parsedArgs = categoriesByIdsInputSchema.safeParse(args.input);
	if (!parsedArgs.success) {
		throw new Error("Invalid arguments");
	}

	const categoryIds = parsedArgs.data.ids;

	const categories =
		await ctx.drizzleClient.query.actionItemCategoriesTable.findMany({
			where: (fields, _operators) => inArray(fields.id, categoryIds),
		});

	return categories;
};

builder.queryField("categoriesByIds", (t) =>
	t.field({
		type: [ActionItemCategory],
		args: {
			input: t.arg({
				type: builder.inputType("CategoriesByIdsInput", {
					fields: (t) => ({
						ids: t.field({
							type: ["ID"],
							required: true,
						}),
					}),
				}),
				required: true,
			}),
		},
		description: "Fetch multiple action item categories by their IDs.",
		resolve: categoriesByIdsResolver,
	}),
);
