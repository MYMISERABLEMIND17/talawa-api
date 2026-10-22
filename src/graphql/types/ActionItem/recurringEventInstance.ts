import type { GraphQLContext } from "~/src/graphql/context";
import { Event } from "~/src/graphql/types/Event/Event";
import type { ActionItem as ActionItemType } from "./ActionItem";
import { ActionItem } from "./ActionItem";

/**
 * Resolves the recurring event instance associated with an ActionItem.
 * Fetches the instance row and merges it with the base recurring event row.
 *
 * @param parent - The ActionItem parent object containing recurringEventInstanceId
 * @param _args - GraphQL arguments (unused)
 * @param ctx - GraphQL context containing drizzle client
 * @returns The merged event instance object with attachments, or null if not found or id is missing
 */
export const actionItemRecurringEventInstanceResolver = async (
	parent: ActionItemType,
	_args: unknown,
	ctx: GraphQLContext,
) => {
	if (!parent.recurringEventInstanceId) {
		return null;
	}
	const instance =
		await ctx.drizzleClient.query.recurringEventInstancesTable.findFirst({
			where: (fields, operators) =>
				operators.eq(fields.id, parent.recurringEventInstanceId as string),
		});
	if (!instance) {
		return null;
	}

	const baseEvent = await ctx.drizzleClient.query.eventsTable.findFirst({
		where: (fields, operators) =>
			operators.eq(fields.id, instance.baseRecurringEventId),
	});

	if (!baseEvent) {
		return null;
	}

	return { ...baseEvent, ...instance, attachments: [] };
};

ActionItem.implement({
	fields: (t) => ({
		recurringEventInstance: t.field({
			type: Event,
			description:
				"The recurring event instance associated with this action item.",
			nullable: true,
			resolve: actionItemRecurringEventInstanceResolver,
		}),
	}),
});
