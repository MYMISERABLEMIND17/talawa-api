import type { GraphQLContext } from "~/src/graphql/context";
import { Event } from "~/src/graphql/types/Event/Event";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import type { ActionItem as ActionItemType } from "./ActionItem";
import { ActionItem } from "./ActionItem";

/**
 * Resolves the event associated with an ActionItem, including attachments if available.
 *
 * @param parent - The ActionItem parent object containing eventId
 * @param _args - GraphQL arguments (unused)
 * @param ctx - GraphQL context containing drizzle client and logger
 * @returns The resolved Event object with attachments, or null if eventId is null
 * @throws {TalawaGraphQLError} With code "unexpected" if database returns no row for a non-null eventId
 */
export const actionItemEventResolver = async (
	parent: ActionItemType,
	_args: unknown,
	ctx: GraphQLContext,
) => {
	if (!parent.eventId) return null;

	const existingEvent = await ctx.drizzleClient.query.eventsTable.findFirst({
		where: (fields, operators) =>
			operators.eq(fields.id, parent.eventId as string),
		with: {
			attachmentsWhereEvent: true,
		},
	});

	if (!existingEvent) {
		ctx.log.error(
			"Postgres select operation returned no row for action item's eventId that isn't null.",
		);

		throw new TalawaGraphQLError({
			extensions: {
				code: "unexpected",
			},
		});
	}

	return Object.assign(existingEvent, {
		attachments: existingEvent.attachmentsWhereEvent,
	});
};

ActionItem.implement({
	fields: (t) => ({
		event: t.field({
			description:
				"Fetch the event associated with this action item, including attachments if available.",
			type: Event,
			nullable: true,
			resolve: actionItemEventResolver,
		}),
	}),
});
