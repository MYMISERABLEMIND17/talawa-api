import { Event } from "~/src/graphql/types/Event/Event";
import type { GraphQLContext } from "../../context";
import type { EventVolunteerGroup as EventVolunteerGroupType } from "./EventVolunteerGroup";
import { EventVolunteerGroup } from "./EventVolunteerGroup";

/**
 * Resolver function for the `recurringEventInstance` field on `EventVolunteerGroup`.
 *
 * Resolves the recurring event instance associated with the volunteer group by querying
 * the recurring event instances table and merging it with its underlying base recurring event.
 *
 * @param parent - The parent `EventVolunteerGroup` object.
 * @param _args - Empty arguments object for this field resolver.
 * @param ctx - The GraphQL execution context containing the Drizzle database client.
 * @returns A promise resolving to the merged event instance object with attachments, or `null` if not found.
 */
export const RecurringEventInstanceResolver = async (
	parent: EventVolunteerGroupType,
	_args: Record<string, never>,
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

EventVolunteerGroup.implement({
	fields: (t) => ({
		recurringEventInstance: t.field({
			type: Event,
			description:
				"The recurring event instance associated with this volunteer group.",
			nullable: true,
			resolve: RecurringEventInstanceResolver,
		}),
	}),
});
